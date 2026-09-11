import 'server-only';

import {
  checkRange,
  priceFor,
  type AvailabilityContext,
  type AvailabilityVerdict,
} from '@/lib/booking/availability';
import type { DataRepository } from '@/lib/data/repository';
import { RepositoryError } from '@/lib/data/repository';
import { DAY_MS } from '@/lib/time';
import type {
  BookingDetail,
  BookingSource,
  BookingStatus,
  Currency,
  PaymentStatus,
  Space,
  StudioDetail,
} from '@/types/domain';

/**
 * The booking engine.
 *
 * Every booking in PL·CE — made on `/discover`, typed into the owner's
 * calendar, created by an admin, or texted over WhatsApp — is created
 * here. `repository.insertBooking` exists for this file and no other.
 *
 * That is not a style preference. Availability, turnaround time, notice
 * periods, pricing and the customer record are five rules that have to
 * agree; four surfaces each applying their own version of them is exactly
 * how a marketplace ends up double-booking a Saturday.
 */

export interface BookingActor {
  userId: string | null;
  name: string;
  /** Where the request came from — recorded on the event, not trusted for authority. */
  kind: 'customer' | 'org' | 'admin' | 'whatsapp';
}

export interface CreateBookingRequest {
  organizationId: string;
  studioId: string;
  spaceId: string;
  startsAt: string;
  endsAt: string;
  customer: {
    id?: string;
    name?: string;
    phone?: string | null;
    email?: string | null;
    userId?: string | null;
  };
  source: BookingSource;
  guestCount?: number | null;
  notes?: string | null;
  /**
   * Owner and admin overrides only. A customer-side booking never sets
   * this — the price comes from the space's own rates.
   */
  priceOverride?: number | null;
  paymentStatus?: PaymentStatus;
  status?: BookingStatus;
  actor: BookingActor;
  /**
   * Provenance recorded on the `booking.created` event — for a WhatsApp
   * booking, the message id and the intent that produced it. The engine
   * stores it and does not read it; nothing here is authorisation.
   */
  eventMetadata?: Record<string, unknown> | null;
}

export type BookingOutcome =
  | { ok: true; booking: BookingDetail }
  | { ok: false; reason: string; message: string; conflict?: AvailabilityVerdict['conflict'] };

/* ── Create ─────────────────────────────────────────────────────── */

export async function createBooking(
  repository: DataRepository,
  request: CreateBookingRequest,
  now: Date = new Date(),
): Promise<BookingOutcome> {
  const { studio, space } = await loadTarget(repository, request.studioId, request.spaceId, request.organizationId);

  const context = await availabilityContext(repository, studio, space, request.startsAt, request.endsAt, now);
  const verdict = checkRange(context, request.startsAt, request.endsAt);
  if (!verdict.ok) {
    return {
      ok: false,
      reason: verdict.reason ?? 'unavailable',
      message: verdict.message ?? 'That time is not available.',
      conflict: verdict.conflict,
    };
  }

  const customer = await resolveCustomer(repository, request);

  const price =
    request.priceOverride != null
      ? Math.max(0, Math.round(request.priceOverride))
      : priceFor(space, request.startsAt, request.endsAt);

  const status: BookingStatus =
    request.status ?? (studio.bookingRules.autoConfirm ? 'confirmed' : 'pending');

  const inserted = await repository.insertBooking({
    organizationId: studio.organizationId,
    studioId: studio.id,
    spaceId: space.id,
    customerId: customer.id,
    customerUserId: request.customer.userId ?? customer.userId ?? null,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
    status,
    paymentStatus: request.paymentStatus ?? 'unpaid',
    source: request.source,
    guestCount: request.guestCount ?? null,
    priceAmount: price,
    currency: space.currency as Currency,
    notes: request.notes ?? null,
    createdBy: request.actor.userId,
  });

  await repository.appendBookingEvent({
    bookingId: inserted.id,
    organizationId: studio.organizationId,
    type: 'booking.created',
    actorId: request.actor.userId,
    actorName: request.actor.name,
    message: `Created from ${request.source}`,
    metadata: { source: request.source, ...(request.eventMetadata ?? {}) },
  });

  const booking = await repository.getBooking(inserted.id);
  if (!booking) throw new RepositoryError('The booking could not be read back.', 'unavailable');

  await notifyBookingCreated(repository, studio, booking);

  return { ok: true, booking };
}

/* ── Reschedule ─────────────────────────────────────────────────── */

export async function rescheduleBooking(
  repository: DataRepository,
  options: {
    bookingId: string;
    organizationId: string;
    spaceId?: string;
    startsAt: string;
    endsAt: string;
    actor: BookingActor;
    /** Keep the agreed price when an owner simply moves a booking. */
    repriceOnMove?: boolean;
  },
  now: Date = new Date(),
): Promise<BookingOutcome> {
  const existing = await repository.getBooking(options.bookingId);
  if (!existing) throw new RepositoryError('That booking no longer exists.', 'not_found');
  assertTenant(existing.organizationId, options.organizationId);

  if (existing.status === 'cancelled') {
    return { ok: false, reason: 'cancelled', message: 'A cancelled booking cannot be moved.' };
  }

  const spaceId = options.spaceId ?? existing.spaceId;
  const { studio, space } = await loadTarget(
    repository,
    existing.studioId,
    spaceId,
    options.organizationId,
  );

  const context = await availabilityContext(repository, studio, space, options.startsAt, options.endsAt, now);
  const verdict = checkRange(
    { ...context, excludeBookingId: existing.id },
    options.startsAt,
    options.endsAt,
  );
  if (!verdict.ok) {
    return {
      ok: false,
      reason: verdict.reason ?? 'unavailable',
      message: verdict.message ?? 'That time is not available.',
      conflict: verdict.conflict,
    };
  }

  await repository.updateBooking(existing.id, {
    spaceId,
    startsAt: options.startsAt,
    endsAt: options.endsAt,
    ...(options.repriceOnMove
      ? { priceAmount: priceFor(space, options.startsAt, options.endsAt) }
      : {}),
  });

  await repository.appendBookingEvent({
    bookingId: existing.id,
    organizationId: existing.organizationId,
    type: 'booking.rescheduled',
    actorId: options.actor.userId,
    actorName: options.actor.name,
    message: `Moved from ${existing.startsAt} to ${options.startsAt}`,
  });

  const booking = await repository.getBooking(existing.id);
  if (!booking) throw new RepositoryError('The booking could not be read back.', 'unavailable');

  if (booking.customerUserId) {
    await repository.createNotification({
      userId: booking.customerUserId,
      type: 'booking.rescheduled',
      title: 'Your booking moved',
      body: `${booking.studioName} moved your booking ${booking.reference}.`,
      href: `/bookings/${booking.reference}`,
    });
  }

  return { ok: true, booking };
}

/* ── Cancel ─────────────────────────────────────────────────────── */

export async function cancelBooking(
  repository: DataRepository,
  options: {
    bookingId: string;
    organizationId: string;
    reason: string | null;
    actor: BookingActor;
  },
  now: Date = new Date(),
): Promise<BookingDetail> {
  const existing = await repository.getBooking(options.bookingId);
  if (!existing) throw new RepositoryError('That booking no longer exists.', 'not_found');
  assertTenant(existing.organizationId, options.organizationId);

  if (existing.status === 'cancelled') return existing;

  await repository.updateBooking(existing.id, {
    status: 'cancelled',
    cancelledAt: now.toISOString(),
    cancellationReason: options.reason,
  });

  await repository.appendBookingEvent({
    bookingId: existing.id,
    organizationId: existing.organizationId,
    type: 'booking.cancelled',
    actorId: options.actor.userId,
    actorName: options.actor.name,
    message: options.reason,
  });

  if (existing.customerUserId) {
    await repository.createNotification({
      userId: existing.customerUserId,
      type: 'booking.cancelled',
      title: 'Booking cancelled',
      body: `${existing.studioName} cancelled ${existing.reference}.`,
      href: `/bookings/${existing.reference}`,
    });
  }

  const booking = await repository.getBooking(existing.id);
  return booking ?? existing;
}

/* ── Status + payment ───────────────────────────────────────────── */

export async function setBookingStatus(
  repository: DataRepository,
  options: {
    bookingId: string;
    organizationId: string;
    status: BookingStatus;
    actor: BookingActor;
  },
): Promise<BookingDetail> {
  const existing = await repository.getBooking(options.bookingId);
  if (!existing) throw new RepositoryError('That booking no longer exists.', 'not_found');
  assertTenant(existing.organizationId, options.organizationId);

  await repository.updateBooking(existing.id, { status: options.status });
  await repository.appendBookingEvent({
    bookingId: existing.id,
    organizationId: existing.organizationId,
    type:
      options.status === 'completed'
        ? 'booking.completed'
        : options.status === 'no_show'
          ? 'booking.no_show'
          : 'booking.confirmed',
    actorId: options.actor.userId,
    actorName: options.actor.name,
    message: null,
  });

  return (await repository.getBooking(existing.id)) ?? existing;
}

export async function setPaymentStatus(
  repository: DataRepository,
  options: {
    bookingId: string;
    organizationId: string;
    paymentStatus: PaymentStatus;
    actor: BookingActor;
  },
): Promise<BookingDetail> {
  const existing = await repository.getBooking(options.bookingId);
  if (!existing) throw new RepositoryError('That booking no longer exists.', 'not_found');
  assertTenant(existing.organizationId, options.organizationId);

  await repository.updateBooking(existing.id, { paymentStatus: options.paymentStatus });
  await repository.appendBookingEvent({
    bookingId: existing.id,
    organizationId: existing.organizationId,
    type: 'booking.payment_updated',
    actorId: options.actor.userId,
    actorName: options.actor.name,
    message: options.paymentStatus,
  });

  return (await repository.getBooking(existing.id)) ?? existing;
}

/* ── Blocking time ──────────────────────────────────────────────── */

/**
 * Blocking runs through the engine too, because a block that lands on top
 * of an existing booking is a data error the owner needs told about — not
 * something to silently write and discover on the day.
 */
export async function blockTime(
  repository: DataRepository,
  options: {
    organizationId: string;
    spaceId: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
    actor: BookingActor;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const space = await repository.getSpace(options.spaceId);
  if (!space) throw new RepositoryError('That space no longer exists.', 'not_found');
  assertTenant(space.organizationId, options.organizationId);

  const clashing = await repository.listBookingsInRange({
    spaceIds: [space.id],
    from: options.startsAt,
    to: options.endsAt,
    statuses: ['pending', 'confirmed'],
  });

  if (clashing.length > 0) {
    const first = clashing[0]!;
    return {
      ok: false,
      message: `${first.customerName} already has ${first.reference} in that window. Cancel or move it first.`,
    };
  }

  await repository.createBlockedTime({
    spaceId: space.id,
    startsAt: options.startsAt,
    endsAt: options.endsAt,
    reason: options.reason,
    createdBy: options.actor.userId,
  });

  return { ok: true };
}

/* ── Shared internals ───────────────────────────────────────────── */

/**
 * Loads the studio and space, and proves they belong together and to the
 * organisation the caller claims. This is the tenancy check: an id
 * arriving from a form, a URL or a WhatsApp message is never assumed to
 * be inside the caller's own organisation.
 */
async function loadTarget(
  repository: DataRepository,
  studioId: string,
  spaceId: string,
  organizationId: string,
): Promise<{ studio: StudioDetail; space: Space }> {
  const studio = await repository.getStudio(studioId);
  if (!studio) throw new RepositoryError('That studio no longer exists.', 'not_found');
  assertTenant(studio.organizationId, organizationId);

  const space = studio.spaces.find((candidate) => candidate.id === spaceId);
  if (!space) {
    throw new RepositoryError('That space is not part of this studio.', 'not_found');
  }

  return { studio, space };
}

function assertTenant(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new RepositoryError('That record belongs to another studio.', 'forbidden');
  }
}

/**
 * Gathers everything the pure availability check needs.
 *
 * The window is padded by a day either side so that a booking near
 * midnight still sees the neighbours it could collide with once
 * turnaround time is applied.
 */
export async function availabilityContext(
  repository: DataRepository,
  studio: StudioDetail,
  space: Space,
  from: string,
  to: string,
  now: Date,
): Promise<AvailabilityContext> {
  const windowFrom = new Date(Date.parse(from) - DAY_MS).toISOString();
  const windowTo = new Date(Date.parse(to) + DAY_MS).toISOString();

  const [rules, blocked, bookings] = await Promise.all([
    repository.listAvailabilityRules([space.id]),
    repository.listBlockedTimes({ spaceIds: [space.id], from: windowFrom, to: windowTo }),
    repository.listBookingsInRange({ spaceIds: [space.id], from: windowFrom, to: windowTo }),
  ]);

  return {
    space,
    timezone: studio.timezone,
    rules,
    blocked,
    bookings,
    bookingRules: studio.bookingRules,
    now,
  };
}

async function resolveCustomer(repository: DataRepository, request: CreateBookingRequest) {
  if (request.customer.id) {
    const existing = await repository.getCustomer(request.organizationId, request.customer.id);
    if (!existing) throw new RepositoryError('That customer no longer exists.', 'not_found');
    return existing;
  }

  if (!request.customer.name?.trim()) {
    throw new RepositoryError('A booking needs a name to go against.', 'validation');
  }

  return repository.findOrCreateCustomer(request.organizationId, {
    name: request.customer.name.trim(),
    phone: request.customer.phone ?? null,
    email: request.customer.email ?? null,
    userId: request.customer.userId ?? null,
  });
}

async function notifyBookingCreated(
  repository: DataRepository,
  studio: StudioDetail,
  booking: BookingDetail,
): Promise<void> {
  const members = await repository.listMembers(studio.organizationId);
  await Promise.all(
    members.map((member) =>
      repository.createNotification({
        userId: member.userId,
        type: 'booking.created',
        title: 'New booking',
        body: `${booking.customerName} booked ${booking.spaceName} · ${booking.reference}`,
        href: `/studio/bookings?booking=${booking.id}`,
      }),
    ),
  );

  if (booking.customerUserId) {
    await repository.createNotification({
      userId: booking.customerUserId,
      type: 'booking.created',
      title: 'Booking confirmed',
      body: `${booking.studioName} · ${booking.reference}`,
      href: `/bookings/${booking.reference}`,
    });
  }
}
