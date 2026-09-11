'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { fail, fromZodError, ok, runAction, type ActionResult } from '@/lib/action-result';
import { requirePermission } from '@/lib/auth/session';
import {
  blockTime,
  cancelBooking,
  createBooking,
  rescheduleBooking,
  setBookingStatus,
  setPaymentStatus,
  type BookingActor,
} from '@/lib/booking/engine';
import { getRepository } from '@/lib/data';
import { RepositoryError } from '@/lib/data/repository';
import { classifyEdit, toPendingChanges } from '@/lib/listing/changes';
import { setOwnerPublished } from '@/lib/listing/service';
import { isValidDateString, timeToMinutes, zonedToInstant } from '@/lib/time';
import type { OrgContext } from '@/lib/auth/session';
import type { BookingSource, BookingStatus, PaymentStatus, Weekday } from '@/types/domain';

/**
 * PL·CE Studio actions.
 *
 * Every one begins with `requirePermission`, which proves membership of
 * the organisation *and* that this person's role allows the thing they
 * are asking for. Staff can move a booking; only an owner can change the
 * prices.
 */

function actorFrom(context: OrgContext): BookingActor {
  return {
    userId: context.session.user.id,
    name: context.session.user.fullName,
    kind: 'org',
  };
}

function refresh(): void {
  revalidatePath('/studio');
  revalidatePath('/studio/schedule');
  revalidatePath('/studio/bookings');
}

/* ── Bookings ───────────────────────────────────────────────────── */

const bookingSchema = z.object({
  spaceId: z.string().min(1, 'Which space?'),
  date: z.string().refine(isValidDateString, 'Pick a date'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'End time'),
  customerId: z.string().optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  customerEmail: z.string().trim().max(160).optional(),
  guestCount: z.coerce.number().int().min(1).max(500).optional(),
  price: z.coerce.number().int().min(0).max(10_000_000).optional(),
  status: z.enum(['pending', 'confirmed', 'completed', 'no_show']).optional(),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid', 'refunded']).optional(),
  source: z.enum(['plce', 'whatsapp', 'instagram', 'phone', 'walk_in', 'manual']).optional(),
  notes: z.string().trim().max(600).optional(),
});

export async function createManualBooking(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  let destination: string | null = null;

  const result = await runAction(async () => {
    const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const input = parsed.data;

    const context = await requirePermission('booking.create');
    const repository = await getRepository();

    const space = await repository.getSpace(input.spaceId);
    if (!space || space.organizationId !== context.organizationId) {
      return fail('That space is not part of your studio.', 'spaceId');
    }

    const studio = await repository.getStudio(space.studioId);
    if (!studio) return fail('That studio no longer exists.');

    if ((timeToMinutes(input.endTime) ?? 0) <= (timeToMinutes(input.startTime) ?? 0)) {
      return fail('The end time has to be after the start time.', 'endTime');
    }

    if (!input.customerId && !input.customerName?.trim()) {
      return fail('Pick a customer or type a name.', 'customerName');
    }

    const outcome = await createBooking(repository, {
      organizationId: context.organizationId,
      studioId: studio.id,
      spaceId: space.id,
      startsAt: zonedToInstant(input.date, input.startTime, studio.timezone).toISOString(),
      endsAt: zonedToInstant(input.date, input.endTime, studio.timezone).toISOString(),
      customer: {
        id: input.customerId || undefined,
        name: input.customerName,
        phone: input.customerPhone || null,
        email: input.customerEmail || null,
      },
      source: (input.source ?? 'manual') as BookingSource,
      guestCount: input.guestCount ?? null,
      notes: input.notes ?? null,
      // Owners quote their own prices — a discount for a regular is a
      // normal thing to do, and the engine only computes a default.
      priceOverride: input.price ?? null,
      paymentStatus: (input.paymentStatus ?? 'unpaid') as PaymentStatus,
      status: (input.status ?? 'confirmed') as BookingStatus,
      actor: actorFrom(context),
    });

    if (!outcome.ok) return fail(outcome.message);

    destination = `/studio/bookings/${outcome.booking.id}`;
    return ok(null);
  });

  if (destination) {
    refresh();
    redirect(destination);
  }
  return result;
}

const moveSchema = z.object({
  bookingId: z.string().min(1),
  spaceId: z.string().min(1),
  date: z.string().refine(isValidDateString, 'Pick a date'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function moveBooking(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = moveSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const input = parsed.data;

    const context = await requirePermission('booking.edit');
    const repository = await getRepository();

    const booking = await repository.getBooking(input.bookingId);
    if (!booking || booking.organizationId !== context.organizationId) {
      return fail('That booking is not yours.');
    }

    const studio = await repository.getStudio(booking.studioId);
    if (!studio) return fail('That studio no longer exists.');

    const outcome = await rescheduleBooking(repository, {
      bookingId: booking.id,
      organizationId: context.organizationId,
      spaceId: input.spaceId,
      startsAt: zonedToInstant(input.date, input.startTime, studio.timezone).toISOString(),
      endsAt: zonedToInstant(input.date, input.endTime, studio.timezone).toISOString(),
      actor: actorFrom(context),
    });

    if (!outcome.ok) return fail(outcome.message);

    refresh();
    revalidatePath(`/studio/bookings/${booking.id}`);
    return ok(null);
  });
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
): Promise<void> {
  const context = await requirePermission('booking.edit');
  const repository = await getRepository();

  await setBookingStatus(repository, {
    bookingId,
    organizationId: context.organizationId,
    status,
    actor: actorFrom(context),
  });

  refresh();
  revalidatePath(`/studio/bookings/${bookingId}`);
}

export async function updatePaymentStatus(
  bookingId: string,
  paymentStatus: PaymentStatus,
): Promise<void> {
  const context = await requirePermission('booking.edit');
  const repository = await getRepository();

  await setPaymentStatus(repository, {
    bookingId,
    organizationId: context.organizationId,
    paymentStatus,
    actor: actorFrom(context),
  });

  refresh();
  revalidatePath(`/studio/bookings/${bookingId}`);
}

export async function cancelStudioBooking(bookingId: string, reason: string): Promise<void> {
  const context = await requirePermission('booking.cancel');
  const repository = await getRepository();

  await cancelBooking(repository, {
    bookingId,
    organizationId: context.organizationId,
    reason: reason.trim() || null,
    actor: actorFrom(context),
  });

  refresh();
  revalidatePath(`/studio/bookings/${bookingId}`);
}

/* ── Blocking time ──────────────────────────────────────────────── */

const blockSchema = z.object({
  spaceId: z.string().min(1, 'Which space?'),
  date: z.string().refine(isValidDateString, 'Pick a date'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().trim().max(120).optional(),
});

export async function blockStudioTime(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = blockSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const input = parsed.data;

    const context = await requirePermission('availability.edit');
    const repository = await getRepository();

    const space = await repository.getSpace(input.spaceId);
    if (!space || space.organizationId !== context.organizationId) {
      return fail('That space is not part of your studio.', 'spaceId');
    }
    const studio = await repository.getStudio(space.studioId);
    if (!studio) return fail('That studio no longer exists.');

    const outcome = await blockTime(repository, {
      organizationId: context.organizationId,
      spaceId: space.id,
      startsAt: zonedToInstant(input.date, input.startTime, studio.timezone).toISOString(),
      endsAt: zonedToInstant(input.date, input.endTime, studio.timezone).toISOString(),
      reason: input.reason?.trim() || null,
      actor: actorFrom(context),
    });

    if (!outcome.ok) return fail(outcome.message);

    revalidatePath('/studio/availability');
    refresh();
    return ok(null);
  });
}

export async function removeBlockedTime(blockedTimeId: string): Promise<void> {
  const context = await requirePermission('availability.edit');
  const repository = await getRepository();

  const blocks = await repository.listBlockedTimes({
    spaceIds: (await repository.listStudiosForOrganization(context.organizationId)).flatMap(
      (studio) => studio.spaces.map((space) => space.id),
    ),
  });
  if (!blocks.some((block) => block.id === blockedTimeId)) {
    throw new RepositoryError('That block is not yours.', 'forbidden');
  }

  await repository.deleteBlockedTime(blockedTimeId);
  revalidatePath('/studio/availability');
  refresh();
}

/* ── Availability ───────────────────────────────────────────────── */

export async function saveOpeningHours(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const context = await requirePermission('availability.edit');
    const repository = await getRepository();

    const spaceId = String(formData.get('spaceId') ?? '');
    const space = await repository.getSpace(spaceId);
    if (!space || space.organizationId !== context.organizationId) {
      return fail('That space is not part of your studio.');
    }

    const rules = [];
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      const closed = formData.get(`closed-${weekday}`) === 'true';
      const opensAt = String(formData.get(`opens-${weekday}`) ?? '09:00');
      const closesAt = String(formData.get(`closes-${weekday}`) ?? '21:00');

      if (!closed && closesAt <= opensAt) {
        return fail('Closing time has to be after opening time.', `closes-${weekday}`);
      }

      rules.push({ weekday: weekday as Weekday, opensAt, closesAt, isClosed: closed });
    }

    await repository.replaceAvailabilityRules(spaceId, rules);

    revalidatePath('/studio/availability');
    revalidatePath('/studio/schedule');
    return ok(null);
  });
}

/* ── Customers ──────────────────────────────────────────────────── */

const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, 'A name to book against'),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function saveCustomer(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  let destination: string | null = null;

  const result = await runAction(async () => {
    const parsed = customerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const { id, ...input } = parsed.data;

    const context = await requirePermission('customer.edit');
    const repository = await getRepository();

    const saved = id
      ? await repository.updateCustomer(context.organizationId, id, input)
      : await repository.createCustomer(context.organizationId, input);

    destination = `/studio/customers/${saved.id}`;
    return ok(null);
  });

  if (destination) {
    revalidatePath('/studio/customers');
    redirect(destination);
  }
  return result;
}

/* ── Spaces ─────────────────────────────────────────────────────── */

const spaceSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Name the room'),
  description: z.string().trim().max(300).optional(),
  capacity: z.coerce.number().int().min(1).max(1000),
  sizeSqft: z.coerce.number().int().min(0).max(100000).optional(),
  hourlyRate: z.coerce.number().int().min(0).max(1000000),
  halfDayRate: z.coerce.number().int().min(0).max(10000000).optional(),
  fullDayRate: z.coerce.number().int().min(0).max(10000000).optional(),
  minBookingMinutes: z.coerce.number().int().min(30).max(1440),
  bufferMinutes: z.coerce.number().int().min(0).max(240),
  isActive: z.coerce.boolean().optional(),
});

export async function saveSpace(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = spaceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const { id, ...input } = parsed.data;

    const context = await requirePermission('space.edit');
    const repository = await getRepository();

    const studios = await repository.listStudiosForOrganization(context.organizationId);
    const studio = studios[0];
    if (!studio) return fail('No studio to add a space to.');

    const amenitySlugs = formData.getAll('amenity').map(String);

    if (id) {
      const owned = studio.spaces.some((space) => space.id === id);
      if (!owned) return fail('That space is not part of your studio.');
      await repository.updateSpace(id, {
        ...input,
        isActive: input.isActive ?? false,
        amenitySlugs,
      });
    } else {
      await repository.createSpace(studio.id, {
        ...input,
        isActive: true,
        amenitySlugs,
        sortOrder: studio.spaces.length,
      });
    }

    revalidatePath('/studio/spaces');
    revalidatePath(`/studios/${studio.slug}`);
    return ok(null);
  });
}

export async function removeSpace(spaceId: string): Promise<void> {
  const context = await requirePermission('space.edit');
  const repository = await getRepository();

  const studios = await repository.listStudiosForOrganization(context.organizationId);
  const owned = studios.some((studio) => studio.spaces.some((space) => space.id === spaceId));
  if (!owned) throw new RepositoryError('That space is not part of your studio.', 'forbidden');

  await repository.deleteSpace(spaceId);
  revalidatePath('/studio/spaces');
}

/* ── Listing ────────────────────────────────────────────────────── */

const listingSchema = z.object({
  name: z.string().trim().min(2),
  tagline: z.string().trim().max(120).optional(),
  description: z.string().trim().min(20, 'Keep at least a sentence'),
  categoryId: z.string().min(1),
  city: z.string().trim().min(2),
  area: z.string().trim().min(2),
  addressLine: z.string().trim().min(2),
  postalCode: z.string().trim().max(12).optional(),
  contactName: z.string().trim().min(2),
  contactPhone: z.string().trim().min(8),
  contactEmail: z.string().trim().email(),
  instagram: z.string().trim().max(60).optional(),
  website: z.string().trim().max(200).optional(),
  rules: z.string().trim().max(2000).optional(),
  equipment: z.string().trim().max(2000).optional(),
  cancellationPolicy: z.string().trim().min(20),
});

/**
 * The owner's listing edit.
 *
 * Operational fields save straight away. Anything public-facing on an
 * approved listing is held as a pending change and queued for PL·CE,
 * because approval would mean nothing if the name and the address could
 * be swapped the day after.
 */
export async function saveListing(
  _previous: ActionResult<{ queued: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ queued: boolean }>> {
  return runAction(async () => {
    const parsed = listingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const input = parsed.data;

    const context = await requirePermission('studio.edit');
    const repository = await getRepository();

    const studios = await repository.listStudiosForOrganization(context.organizationId);
    const studio = studios[0];
    if (!studio) return fail('No studio to edit.');

    const classified = classifyEdit(studio, {
      name: input.name,
      tagline: input.tagline || null,
      description: input.description,
      categoryId: input.categoryId,
      location: {
        ...studio.location,
        city: input.city,
        area: input.area,
        addressLine: input.addressLine,
        postalCode: input.postalCode || null,
      },
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      instagram: input.instagram ? input.instagram.replace(/^@/, '') : null,
      website: input.website || null,
      rules: splitLines(input.rules),
      equipment: splitLines(input.equipment),
      cancellationPolicy: input.cancellationPolicy,
    });

    await repository.updateStudio(studio.id, {
      ...classified.immediate,
      ...(classified.requiresReview
        ? {
            hasPendingChanges: true,
            pendingChanges: toPendingChanges(classified.reviewed, new Date().toISOString()),
          }
        : {}),
    });

    if (classified.requiresReview) {
      const application = await repository.getApplicationForStudio(studio.id);
      if (application) {
        await repository.appendApplicationEvent({
          applicationId: application.id,
          organizationId: studio.organizationId,
          type: 'application.edited',
          actorId: context.session.user.id,
          actorName: context.session.user.fullName,
          message: `Owner proposed changes to: ${classified.changedFieldLabels.join(', ')}`,
        });
      }
    }

    revalidatePath('/studio/listing');
    revalidatePath(`/studios/${studio.slug}`);
    return ok({ queued: classified.requiresReview });
  });
}

export async function setListingPublished(isPublished: boolean): Promise<void> {
  const context = await requirePermission('studio.edit');
  const repository = await getRepository();

  const studios = await repository.listStudiosForOrganization(context.organizationId);
  const studio = studios[0];
  if (!studio) throw new RepositoryError('No studio to update.', 'not_found');

  await setOwnerPublished(repository, {
    studioId: studio.id,
    isPublished,
    actor: {
      userId: context.session.user.id,
      name: context.session.user.fullName,
      platformRole: context.session.user.platformRole,
    },
  });

  revalidatePath('/studio/listing');
  revalidatePath('/discover');
}

/* ── WhatsApp ───────────────────────────────────────────────────── */

/**
 * Opens a possession challenge for a WhatsApp number.
 *
 * Typing a number in no longer connects it — it only says which number
 * the owner intends to prove. The code returned here is the one thing
 * that is never persisted in readable form: the row keeps a hash, the
 * owner keeps the digits, and the two only meet again when a message
 * arrives from that number.
 *
 * Returning the code to *this* caller is safe and necessary — they are
 * authenticated, they hold `whatsapp.manage` for this organisation, and
 * they need to read it in order to send it.
 */
export async function connectWhatsApp(
  _previous: ActionResult<{ code: string; expiresAt: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ code: string; expiresAt: string }>> {
  return runAction(async () => {
    const context = await requirePermission('whatsapp.manage');
    const repository = await getRepository();

    const phone = String(formData.get('phone') ?? '').trim();
    if (phone.replace(/\D/g, '').length < 10) {
      return fail('Enter the number in full, with the country code.', 'phone');
    }

    const { generateVerificationCode, hashVerificationCode, verificationExpiry } = await import(
      '@/lib/whatsapp/verification'
    );
    const { normalisePhone } = await import('@/lib/format');

    const normalised = normalisePhone(phone);
    if (!normalised) return fail('That does not look like a phone number.', 'phone');

    const code = generateVerificationCode();
    const expiresAt = verificationExpiry();

    const studios = await repository.listStudiosForOrganization(context.organizationId);
    await repository.startWhatsAppVerification({
      organizationId: context.organizationId,
      phone: normalised,
      displayName: studios[0]?.name ?? 'Studio',
      // Hashed against the number, so the stored value is useless
      // anywhere else — including against another row.
      codeHash: hashVerificationCode(normalised, code),
      expiresAt,
    });

    revalidatePath('/studio/whatsapp');
    return ok({ code, expiresAt });
  });
}

/** Abandons a pending challenge, releasing the number. */
export async function cancelWhatsAppVerification(accountId: string): Promise<void> {
  const context = await requirePermission('whatsapp.manage');
  const repository = await getRepository();

  const accounts = await repository.listWhatsAppAccounts(context.organizationId);
  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) throw new RepositoryError('That number is not yours.', 'forbidden');
  if (account.verifiedAt) {
    throw new RepositoryError('That number is already verified.', 'conflict');
  }

  await repository.setWhatsAppAccountActive(accountId, false);
  revalidatePath('/studio/whatsapp');
}

export async function setWhatsAppActive(accountId: string, isActive: boolean): Promise<void> {
  const context = await requirePermission('whatsapp.manage');
  const repository = await getRepository();

  const accounts = await repository.listWhatsAppAccounts(context.organizationId);
  if (!accounts.some((account) => account.id === accountId)) {
    throw new RepositoryError('That number is not yours.', 'forbidden');
  }

  await repository.setWhatsAppAccountActive(accountId, isActive);
  revalidatePath('/studio/whatsapp');
}

/* ── Team ───────────────────────────────────────────────────────── */

export async function inviteMember(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const context = await requirePermission('org.manage_members');
    const repository = await getRepository();

    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const role = String(formData.get('role') ?? 'staff') as 'manager' | 'staff';

    const user = await repository.getUserByEmail(email);
    if (!user) {
      // Inviting someone who has never used PL·CE needs an email flow
      // this build does not have. Saying so is better than pretending.
      return fail(
        'No PL·CE account with that email yet. Ask them to sign up first, then add them here.',
        'email',
      );
    }

    await repository.addMember(context.organizationId, user.id, role);
    revalidatePath('/studio/settings');
    return ok(null);
  });
}

export async function removeMember(userId: string): Promise<void> {
  const context = await requirePermission('org.manage_members');
  const repository = await getRepository();

  await repository.removeMember(context.organizationId, userId);
  revalidatePath('/studio/settings');
}

function splitLines(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);
}

/**
 * Send a message through the real WhatsApp handler from the browser.
 *
 * Not a mock: it runs the same parser, the same validation and the same
 * booking engine an inbound Meta webhook would, against this studio's
 * real calendar. It exists because connecting a Business number takes
 * days of Meta review, and an owner should be able to see exactly what
 * the assistant will do before they commit to that.
 */
export async function sendTestWhatsAppMessage(
  _previous: ActionResult<{ reply: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ reply: string }>> {
  return runAction(async () => {
    const context = await requirePermission('whatsapp.manage');
    const repository = await getRepository();

    const body = String(formData.get('body') ?? '').trim();
    if (!body) return fail('Type a message first.', 'body');

    const accounts = await repository.listWhatsAppAccounts(context.organizationId);
    // The console runs the real handler, and the real handler only
    // answers verified numbers. Requiring the same thing here keeps the
    // rehearsal honest instead of letting it succeed where production
    // would refuse.
    const account = accounts.find((candidate) => candidate.isActive && candidate.verifiedAt);
    if (!account) {
      return fail('Verify a WhatsApp number first.', 'body');
    }

    const { handleInboundMessage } = await import('@/lib/whatsapp/handler');
    const result = await handleInboundMessage(repository, {
      phone: account.phone,
      body,
      // Marked so the activity log and the booking event can tell a
      // console message from one Meta actually delivered.
      messageId: `console-${Date.now()}`,
    });

    revalidatePath('/studio/whatsapp');
    refresh();
    return ok({ reply: result.reply });
  });
}
