import { beforeEach, describe, expect, it } from 'vitest';

import { createBooking } from '@/lib/booking/engine';
import { RepositoryError } from '@/lib/data/repository';
import { DemoRepository } from '@/lib/data/demo/repository';
import { db, resetDb } from '@/lib/data/demo/store';
import { instantToZoned } from '@/lib/time';
import { explainFailure, handleInboundMessage } from '@/lib/whatsapp/handler';
import {
  generateVerificationCode,
  hashVerificationCode,
  VERIFICATION_MAX_ATTEMPTS,
} from '@/lib/whatsapp/verification';

/**
 * The owner WhatsApp path, exercised end to end.
 *
 * `DemoRepository` is a full implementation of `DataRepository`, so
 * these run the real handler, the real intent parser, the real
 * availability rules and the real booking engine. Only storage differs.
 */

const OWNER_PHONE = '+919820100201'; // seeded, verified, Studio 404
const STRANGER_PHONE = '+919000000001';

let repository: DemoRepository;

function studio404() {
  const studio = db().studios.find((candidate) => candidate.slug === 'studio-404');
  if (!studio) throw new Error('seed changed: studio-404 missing');
  return studio;
}

function otherStudio() {
  const studio = db().studios.find((candidate) => candidate.slug !== 'studio-404');
  if (!studio) throw new Error('seed changed: expected more than one studio');
  return studio;
}

/** A weekday well clear of "today", so notice rules never interfere. */
function soon(days = 3): { date: string; now: Date } {
  const now = new Date();
  const target = new Date(now.getTime() + days * 86_400_000);
  return { date: target.toISOString().slice(0, 10), now };
}

async function bookingsFor(organizationId: string) {
  const page = await repository.listBookings(organizationId, { pageSize: 500 });
  return page.items;
}

/**
 * Empties one organisation's diary.
 *
 * The seed fills a realistic month, which is right for the demo and
 * wrong for a test that needs a specific hour to be free — a refusal
 * caused by a seeded booking looks exactly like a refusal caused by a
 * bug. Collision behaviour is asserted deliberately elsewhere.
 */
function clearCalendar(organizationId: string): void {
  const data = db();
  data.bookings = data.bookings.filter(
    (booking) => booking.organizationId !== organizationId,
  );
}

beforeEach(() => {
  resetDb();
  repository = new DemoRepository();
});

/* ── Verification ───────────────────────────────────────────────── */

describe('verification', () => {
  it('refuses a booking from a number that was claimed but never proved', async () => {
    const organizationId = otherStudio().organizationId;
    const before = (await bookingsFor(organizationId)).length;

    await repository.startWhatsAppVerification({
      organizationId,
      phone: STRANGER_PHONE,
      displayName: 'Unproven',
      codeHash: hashVerificationCode(STRANGER_PHONE, '123456'),
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });

    const result = await handleInboundMessage(repository, {
      phone: STRANGER_PHONE,
      body: 'Book Main Studio tomorrow 3 to 6 for Rahul',
      messageId: 'wamid.unverified',
    });

    expect(result.outcome).toBe('refused');
    expect(result.organizationId).toBeNull();
    expect(await bookingsFor(organizationId)).toHaveLength(before);
  });

  it('refuses a booking from a number nobody has claimed', async () => {
    const result = await handleInboundMessage(repository, {
      phone: '+919111111111',
      body: 'Book Main Studio tomorrow 3 to 6 for Rahul',
      messageId: 'wamid.unknown',
    });

    expect(result.outcome).toBe('refused');
    expect(result.organizationId).toBeNull();
  });

  it('rejects an expired code and leaves the number unverified', async () => {
    const organizationId = studio404().organizationId;
    const code = generateVerificationCode();

    await repository.startWhatsAppVerification({
      organizationId,
      phone: STRANGER_PHONE,
      displayName: 'Studio 404',
      codeHash: hashVerificationCode(STRANGER_PHONE, code),
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    const result = await handleInboundMessage(repository, {
      phone: STRANGER_PHONE,
      body: code,
      messageId: 'wamid.expired',
    });

    expect(result.outcome).toBe('refused');
    expect(result.reply).toContain('expired');
    expect(await repository.getWhatsAppAccountByPhone(STRANGER_PHONE)).toBeNull();
  });

  it('rejects a wrong code, counts the attempt, and stays unverified', async () => {
    const organizationId = studio404().organizationId;

    await repository.startWhatsAppVerification({
      organizationId,
      phone: STRANGER_PHONE,
      displayName: 'Studio 404',
      codeHash: hashVerificationCode(STRANGER_PHONE, '111111'),
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });

    const result = await handleInboundMessage(repository, {
      phone: STRANGER_PHONE,
      body: '222222',
      messageId: 'wamid.wrong',
    });

    expect(result.outcome).toBe('refused');
    expect(await repository.getWhatsAppAccountByPhone(STRANGER_PHONE)).toBeNull();

    const pending = await repository.getWhatsAppVerification(STRANGER_PHONE);
    expect(pending?.attempts).toBe(1);
  });

  it('stops accepting codes once the attempt budget is spent', async () => {
    const organizationId = studio404().organizationId;
    const code = generateVerificationCode();

    await repository.startWhatsAppVerification({
      organizationId,
      phone: STRANGER_PHONE,
      displayName: 'Studio 404',
      codeHash: hashVerificationCode(STRANGER_PHONE, code),
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });

    for (let attempt = 0; attempt < VERIFICATION_MAX_ATTEMPTS; attempt += 1) {
      await handleInboundMessage(repository, {
        phone: STRANGER_PHONE,
        body: '000000',
        messageId: `wamid.brute.${attempt}`,
      });
    }

    // Even the correct code is refused now.
    const result = await handleInboundMessage(repository, {
      phone: STRANGER_PHONE,
      body: code,
      messageId: 'wamid.brute.final',
    });

    expect(result.outcome).toBe('refused');
    expect(await repository.getWhatsAppAccountByPhone(STRANGER_PHONE)).toBeNull();
  });

  it('verifies on the correct code, persists verified_at, and resolves the right org', async () => {
    const organizationId = studio404().organizationId;
    const code = generateVerificationCode();

    await repository.startWhatsAppVerification({
      organizationId,
      phone: STRANGER_PHONE,
      displayName: 'Studio 404',
      codeHash: hashVerificationCode(STRANGER_PHONE, code),
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });

    const result = await handleInboundMessage(repository, {
      phone: STRANGER_PHONE,
      body: `my code is ${code}`,
      messageId: 'wamid.verify',
    });

    expect(result.reply).toContain('Verified');

    const account = await repository.getWhatsAppAccountByPhone(STRANGER_PHONE);
    expect(account).not.toBeNull();
    expect(account?.verifiedAt).not.toBeNull();
    expect(account?.organizationId).toBe(organizationId);
  });

  it('never stores the code in readable form', async () => {
    const organizationId = studio404().organizationId;
    const code = generateVerificationCode();

    await repository.startWhatsAppVerification({
      organizationId,
      phone: STRANGER_PHONE,
      displayName: 'Studio 404',
      codeHash: hashVerificationCode(STRANGER_PHONE, code),
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });

    await handleInboundMessage(repository, {
      phone: STRANGER_PHONE,
      body: code,
      messageId: 'wamid.redact',
    });

    const messages = await repository.listWhatsAppMessages(organizationId, 50);
    expect(messages.some((message) => message.body.includes(code))).toBe(false);

    const stored = JSON.stringify(db().whatsappAccounts);
    expect(stored).not.toContain(code);
  });

  it('does not burn a second attempt on a redelivered wrong code', async () => {
    await repository.startWhatsAppVerification({
      organizationId: studio404().organizationId,
      phone: STRANGER_PHONE,
      displayName: 'Studio 404',
      codeHash: hashVerificationCode(STRANGER_PHONE, '111111'),
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });

    const wrong = { phone: STRANGER_PHONE, body: '222222', messageId: 'wamid.wrong.retry' };

    await handleInboundMessage(repository, wrong);
    const second = await handleInboundMessage(repository, wrong);

    expect(second.duplicate).toBe(true);

    const pending = await repository.getWhatsAppVerification(STRANGER_PHONE);
    expect(pending?.attempts).toBe(1);
  });

  it('will not reassign a number that is already verified', async () => {
    await expect(
      repository.startWhatsAppVerification({
        organizationId: otherStudio().organizationId,
        phone: OWNER_PHONE,
        displayName: 'Somebody else',
        codeHash: hashVerificationCode(OWNER_PHONE, '123456'),
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      }),
    ).rejects.toThrow();
  });

  it('releases a lapsed claim so the real owner is not locked out', async () => {
    const squatter = otherStudio().organizationId;
    const rightful = studio404().organizationId;

    await repository.startWhatsAppVerification({
      organizationId: squatter,
      phone: STRANGER_PHONE,
      displayName: 'Squatter',
      codeHash: hashVerificationCode(STRANGER_PHONE, '111111'),
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    const taken = await repository.startWhatsAppVerification({
      organizationId: rightful,
      phone: STRANGER_PHONE,
      displayName: 'Studio 404',
      codeHash: hashVerificationCode(STRANGER_PHONE, '222222'),
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });

    expect(taken.organizationId).toBe(rightful);
  });

  it('holds a live claim against another organisation', async () => {
    await repository.startWhatsAppVerification({
      organizationId: otherStudio().organizationId,
      phone: STRANGER_PHONE,
      displayName: 'First',
      codeHash: hashVerificationCode(STRANGER_PHONE, '111111'),
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });

    await expect(
      repository.startWhatsAppVerification({
        organizationId: studio404().organizationId,
        phone: STRANGER_PHONE,
        displayName: 'Second',
        codeHash: hashVerificationCode(STRANGER_PHONE, '222222'),
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      }),
    ).rejects.toThrow();
  });
});

/* ── Booking ────────────────────────────────────────────────────── */

describe('booking', () => {
  beforeEach(() => clearCalendar(studio404().organizationId));

  it('creates a confirmed booking from a verified owner, sourced whatsapp', async () => {
    const { now } = soon();
    const organizationId = studio404().organizationId;

    const result = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: `Book Main Studio tomorrow 3 to 6 for Shivam`,
      messageId: 'wamid.create.1',
      now,
    });

    expect(result.outcome).toBe('booking_created');
    expect(result.bookingId).toBeTruthy();

    const booking = await repository.getBooking(result.bookingId!);
    expect(booking?.status).toBe('confirmed');
    expect(booking?.source).toBe('whatsapp');
    expect(booking?.organizationId).toBe(organizationId);
    expect(booking?.customerName).toBe('Shivam');

    // The hours actually asked for, in the studio's own timezone.
    const start = instantToZoned(booking!.startsAt, booking!.timezone);
    const end = instantToZoned(booking!.endsAt, booking!.timezone);
    expect(start.time).toBe('15:00');
    expect(end.time).toBe('18:00');
  });

  it('confirms even when the studio does not auto-confirm marketplace bookings', async () => {
    const { now } = soon(4);
    const studio = studio404();
    studio.bookingRules = { ...studio.bookingRules, autoConfirm: false };

    const result = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: `Book Main Studio tomorrow 11 to 1 for Meera`,
      messageId: 'wamid.create.noauto',
      now,
    });

    expect(result.outcome).toBe('booking_created');
    const booking = await repository.getBooking(result.bookingId!);
    expect(booking?.status).toBe('confirmed');
  });

  it('leaves marketplace bookings governed by autoConfirm', async () => {
    const { date, now } = soon(5);
    const studio = studio404();
    studio.bookingRules = { ...studio.bookingRules, autoConfirm: false };

    const full = await repository.getStudio(studio.id);
    const space = full!.spaces.find((candidate) => candidate.isActive)!;

    const outcome = await createBooking(
      repository,
      {
        organizationId: studio.organizationId,
        studioId: studio.id,
        spaceId: space.id,
        startsAt: `${date}T04:30:00.000Z`,
        endsAt: `${date}T06:30:00.000Z`,
        customer: { name: 'Marketplace Customer' },
        source: 'plce',
        actor: { userId: null, name: 'Customer', kind: 'customer' },
      },
      now,
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.booking.status).toBe('pending');
  });

  it('refuses a slot that is already taken', async () => {
    const { now } = soon(6);

    const first = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: `Book Main Studio tomorrow 2 to 4 for Asha`,
      messageId: 'wamid.clash.1',
      now,
    });
    expect(first.outcome).toBe('booking_created');

    const second = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: `Book Main Studio tomorrow 2 to 4 for Bilal`,
      messageId: 'wamid.clash.2',
      now,
    });

    expect(second.outcome).toBe('refused');
    expect(second.bookingId).toBeUndefined();
  });

  it('reuses an existing customer rather than duplicating them', async () => {
    const { now } = soon(7);
    const organizationId = studio404().organizationId;

    await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: `Book Main Studio tomorrow 9 to 11 for Repeat Customer`,
      messageId: 'wamid.cust.1',
      now,
    });
    await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: `Book Main Studio tomorrow 12 to 2 for Repeat Customer`,
      messageId: 'wamid.cust.2',
      now,
    });

    const matches = await repository.searchCustomers(organizationId, 'Repeat Customer', 10);
    expect(matches).toHaveLength(1);
  });
});

/* ── Idempotency ────────────────────────────────────────────────── */

describe('idempotency', () => {
  beforeEach(() => clearCalendar(studio404().organizationId));

  it('does not create two bookings from one redelivered message', async () => {
    const { now } = soon(8);
    const organizationId = studio404().organizationId;
    const before = (await bookingsFor(organizationId)).length;

    const message = {
      phone: OWNER_PHONE,
      body: `Book Main Studio tomorrow 4 to 6 for Duplicate`,
      messageId: 'wamid.retry.same',
      now,
    };

    const first = await handleInboundMessage(repository, message);
    const second = await handleInboundMessage(repository, message);

    expect(first.outcome).toBe('booking_created');
    expect(second.duplicate).toBe(true);
    expect(await bookingsFor(organizationId)).toHaveLength(before + 1);
  });

  it('handles concurrent redelivery without double-booking', async () => {
    const { now } = soon(9);
    const organizationId = studio404().organizationId;
    const before = (await bookingsFor(organizationId)).length;

    const message = {
      phone: OWNER_PHONE,
      body: `Book Main Studio tomorrow 5 to 7 for Concurrent`,
      messageId: 'wamid.retry.concurrent',
      now,
    };

    const [a, b] = await Promise.all([
      handleInboundMessage(repository, message),
      handleInboundMessage(repository, message),
    ]);

    const duplicates = [a, b].filter((result) => result.duplicate).length;
    expect(duplicates).toBe(1);
    expect(await bookingsFor(organizationId)).toHaveLength(before + 1);
  });

  it('does not cancel twice on a redelivered cancellation', async () => {
    const { now } = soon(10);

    const created = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: `Book Main Studio tomorrow 10 to 12 for Cancelme`,
      messageId: 'wamid.cancel.create',
      now,
    });
    expect(created.outcome).toBe('booking_created');

    const cancel = {
      phone: OWNER_PHONE,
      body: `Cancel Cancelme's booking tomorrow`,
      messageId: 'wamid.cancel.once',
      now,
    };

    const first = await handleInboundMessage(repository, cancel);
    const second = await handleInboundMessage(repository, cancel);

    // The first delivery did the work; the second was refused entry.
    expect(first.outcome).toBe('booking_cancelled');
    expect(second.duplicate).toBe(true);

    const booking = await repository.getBooking(created.bookingId!);
    expect(booking?.status).toBe('cancelled');

    const events = await repository.listBookingEvents(created.bookingId!);
    const cancellations = events.filter((event) => event.type === 'booking.cancelled');
    expect(cancellations).toHaveLength(1);
  });

  it('does not reschedule twice on a redelivered move', async () => {
    const { now } = soon(11);

    const created = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: `Book Main Studio tomorrow 9 to 11 for Moveme`,
      messageId: 'wamid.move.create',
      now,
    });
    expect(created.outcome).toBe('booking_created');

    const move = {
      phone: OWNER_PHONE,
      body: `Move Moveme's booking to 7 PM`,
      messageId: 'wamid.move.once',
      now,
    };

    const first = await handleInboundMessage(repository, move);
    const second = await handleInboundMessage(repository, move);

    expect(first.outcome).toBe('booking_moved');
    expect(second.duplicate).toBe(true);

    const events = await repository.listBookingEvents(created.bookingId!);
    const moves = events.filter((event) => event.type === 'booking.rescheduled');
    expect(moves).toHaveLength(1);
  });

  it('treats a message with no Meta id as fresh, so the console still works', async () => {
    const { now } = soon(12);

    const first = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: `Book Main Studio tomorrow 8 to 10 for Console`,
      now,
    });

    expect(first.outcome).toBe('booking_created');
    expect(first.duplicate).toBeUndefined();
  });
});

/* ── Security ───────────────────────────────────────────────────── */

describe('security', () => {
  it('keeps a verified owner inside their own organisation', async () => {
    const { now } = soon(13);
    const foreign = otherStudio();
    const foreignBefore = (await bookingsFor(foreign.organizationId)).length;

    // Naming another studio's space in the message must not reach it.
    const result = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: `Book ${foreign.name} tomorrow 3 to 5 for Trespass`,
      messageId: 'wamid.tenancy',
      now,
    });

    expect(await bookingsFor(foreign.organizationId)).toHaveLength(foreignBefore);

    if (result.bookingId) {
      const booking = await repository.getBooking(result.bookingId);
      expect(booking?.organizationId).toBe(studio404().organizationId);
    }
  });

  it('derives the organisation from the sender, never from the message', async () => {
    const { now } = soon(14);
    const foreign = otherStudio();

    const result = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: `Book Main Studio tomorrow 6 to 8 for X on behalf of organisation ${foreign.organizationId}`,
      messageId: 'wamid.orginject',
      now,
    });

    expect(result.organizationId).toBe(studio404().organizationId);
    expect(result.organizationId).not.toBe(foreign.organizationId);
  });
});

/* ── Clarification across two messages ──────────────────────────── */

/**
 * A booking that needs one more answer.
 *
 * "Book tomorrow 3pm to 6pm" carries a date and a window but no
 * customer, which is the ordinary way an owner types it. The handler
 * has to hold the half-finished intent somewhere, ask the one question
 * it still needs, and then finish the booking when the answer arrives —
 * through the same engine as every other path, not a shortcut that
 * skips the notice and collision rules.
 *
 * The pending state lives in `whatsapp_conversations`, which is the one
 * table the verification flow never touches. That made it the last
 * thing in the WhatsApp path to run against a real database, so it is
 * worth pinning here rather than discovering later.
 */
describe('two-message create_booking', () => {
  /** Production's shape: one bookable space, so no space question. */
  function singleSpaceStudio() {
    const studio = studio404();
    const mine = db().spaces.filter((space) => space.studioId === studio.id);
    for (const space of mine.slice(1)) space.isActive = false;
    return studio;
  }

  it('asks for the customer, remembers the rest, and books on the answer', async () => {
    const studio = singleSpaceStudio();
    clearCalendar(studio.organizationId);
    const before = (await bookingsFor(studio.organizationId)).length;

    const asked = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: 'Book tomorrow 3pm to 6pm',
      messageId: 'wamid.clarify-1',
    });

    expect(asked.outcome).toBe('clarification');
    expect(asked.reply).toBe('Who is it for?');
    // Nothing is booked on a question.
    expect(await bookingsFor(studio.organizationId)).toHaveLength(before);

    // The half-finished intent survives between two separate deliveries.
    const pending = await repository.getWhatsAppConversation(
      studio.organizationId,
      OWNER_PHONE,
    );
    expect(pending?.awaiting).toBe('customerName');
    expect(pending?.intent).toMatchObject({ kind: 'create_booking', start: '15:00', end: '18:00' });

    const booked = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: 'Shivam',
      messageId: 'wamid.clarify-2',
    });

    expect(booked.outcome).toBe('booking_created');
    expect(booked.bookingId).toBeTruthy();

    const bookings = await bookingsFor(studio.organizationId);
    expect(bookings).toHaveLength(before + 1);

    const created = bookings.find((booking) => booking.id === booked.bookingId);
    expect(created?.customerName).toBe('Shivam');
    // The owner asked for it, so it is not waiting on the owner.
    expect(created?.status).toBe('confirmed');
    expect(created?.source).toBe('whatsapp');

    // The conversation is spent, not left to fire again later.
    expect(
      await repository.getWhatsAppConversation(studio.organizationId, OWNER_PHONE),
    ).toBeNull();
  });

  it('does not book twice when Meta redelivers the answer', async () => {
    const studio = singleSpaceStudio();
    clearCalendar(studio.organizationId);

    await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: 'Book tomorrow 3pm to 6pm',
      messageId: 'wamid.dupe-1',
    });

    const first = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: 'Shivam',
      messageId: 'wamid.dupe-2',
    });
    const replay = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: 'Shivam',
      messageId: 'wamid.dupe-2',
    });

    expect(first.outcome).toBe('booking_created');
    expect(replay.duplicate).toBe(true);
    expect(await bookingsFor(studio.organizationId)).toHaveLength(1);
  });
});

/* ── Failure reporting ──────────────────────────────────────────── */

/**
 * What a thrown handler tells the owner.
 *
 * The webhook answered every exception with "Something went wrong on
 * our end. Try again in a moment." — advice for a blip, given for
 * faults that were permanent. A database that did not answer and a
 * missing permission both read as transient, so the owner retried, and
 * the one sentence that would have identified either never left the
 * server. These pin the classification so it cannot collapse back.
 */
describe('webhook failure messages', () => {
  it('passes a repository error through, because it was written to be read', () => {
    const error = new RepositoryError(
      'The database did not answer in time. Nothing was lost — try that again.',
      'unavailable',
    );
    expect(explainFailure(error)).toBe(error.message);
    expect(explainFailure(error)).not.toContain('Something went wrong');
  });

  it('names a permission problem rather than inviting a retry', () => {
    const error = new RepositoryError('You do not have permission to do that.', 'forbidden');
    expect(explainFailure(error)).toBe('You do not have permission to do that.');
  });

  it('stays generic for anything unclassified, since the reply reaches strangers', () => {
    expect(explainFailure(new TypeError('x.y is not a function'))).toBe(
      'Something went wrong on our end. Try again in a moment.',
    );
    expect(explainFailure('not even an error')).toContain('Something went wrong');
  });
});

/* ── The id collision ───────────────────────────────────────────── */

/**
 * A reply must not claim the id of the message it answers.
 *
 * `external_id` carries Meta's id for the row it sits on, and the
 * partial unique index over it — spanning both directions — is what
 * makes the inbound claim idempotent. Writing the inbound id onto the
 * outbound row claimed it twice, so every message that got far enough
 * to earn a reply died on 23505 and reached the owner as "That
 * conflicts with something already saved."
 *
 * Verification survived by accident: its outbound log never passed an
 * id. That is precisely why possession challenges worked while every
 * booking failed, and why this is pinned per-direction rather than by
 * asserting the flow merely completes.
 */
describe('external id ownership', () => {
  it('logs the reply without the inbound message id', async () => {
    const studio = studio404();
    await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: 'Book tomorrow 3 p.m to 6 p.m',
      messageId: 'wamid.collision-check',
    });

    const logged = await repository.listWhatsAppMessages(studio.organizationId, 50);
    const claimed = logged.filter((row) => row.externalId === 'wamid.collision-check');

    // Exactly one row owns the id, and it is the one Meta actually sent.
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.direction).toBe('inbound');

    // The reply exists — it simply does not carry the id.
    const outbound = logged.filter((row) => row.direction === 'outbound');
    expect(outbound.length).toBeGreaterThan(0);
    expect(outbound.every((row) => row.externalId !== 'wamid.collision-check')).toBe(true);
  });

  it('still refuses a redelivery of the same inbound id', async () => {
    const first = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: 'Book tomorrow 3 p.m to 6 p.m',
      messageId: 'wamid.replay',
    });
    const second = await handleInboundMessage(repository, {
      phone: OWNER_PHONE,
      body: 'Book tomorrow 3 p.m to 6 p.m',
      messageId: 'wamid.replay',
    });

    expect(first.duplicate).toBeFalsy();
    expect(second.duplicate).toBe(true);
  });
});
