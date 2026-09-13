import 'server-only';

import { getIntentProvider, intentSchema, type Intent } from '@/lib/ai';
import { checkRange } from '@/lib/booking/availability';
import {
  availabilityContext,
  blockTime,
  cancelBooking,
  createBooking,
  rescheduleBooking,
  type BookingActor,
} from '@/lib/booking/engine';
import { RepositoryError, type DataRepository } from '@/lib/data/repository';
import {
  formatDateRelative,
  formatDateWithDay,
  formatMoney,
  formatTimeRange,
} from '@/lib/format';
import {
  addDaysToDateString,
  instantToZoned,
  isValidDateString,
  minutesToTime,
  timeToMinutes,
  todayInZone,
  zonedToInstant,
} from '@/lib/time';
import {
  extractVerificationCode,
  VERIFICATION_MAX_ATTEMPTS,
  verificationCodeMatches,
} from '@/lib/whatsapp/verification';
import type { Space, StudioDetail, WhatsAppOutcome } from '@/types/domain';

/**
 * WhatsApp, end to end.
 *
 *   verify → identify → interpret → validate → execute → reply
 *
 * The identity comes from the sender's phone number, matched against
 * `whatsapp_accounts`. It is never taken from the message body, so a
 * message claiming to be from another studio changes nothing.
 *
 * Execution runs through the same booking engine the website uses. There
 * is no WhatsApp-specific booking path, which is why a booking made here
 * is on the owner's calendar before the reply is sent.
 */

export interface InboundMessage {
  /** E.164, from the webhook payload — already signature-verified. */
  phone: string;
  body: string;
  /** Meta's message id, carried onto the booking event for tracing. */
  messageId?: string;
  now?: Date;
}

export interface HandledMessage {
  reply: string;
  organizationId: string | null;
  intent: Intent | null;
  /** What actually happened, for the owner's activity log. */
  outcome: WhatsAppOutcome;
  bookingId?: string;
  /**
   * True when this Meta message id had already been processed. The
   * caller should not reply again — the first delivery already did.
   */
  duplicate?: boolean;
}

const CONVERSATION_TTL_MINUTES = 15;

export async function handleInboundMessage(
  repository: DataRepository,
  message: InboundMessage,
): Promise<HandledMessage> {
  const now = message.now ?? new Date();

  const account = await repository.getWhatsAppAccountByPhone(message.phone);
  if (!account) {
    /*
      An unrecognised number is either someone finishing a possession
      challenge or a stranger. Verification is tried first, because a
      pending challenge is the only reason an unverified number has any
      business talking to PL·CE at all.
    */
    const verified = await tryVerification(repository, message);
    if (verified) return verified;

    // Nothing is logged against an organisation, because there is no
    // organisation to log it against.
    return {
      reply:
        'This number is not connected to a studio on PL·CE. If you run one, connect it in PL·CE Studio → WhatsApp.',
      organizationId: null,
      intent: null,
      outcome: 'refused',
    };
  }

  const studios = await repository.listStudiosForOrganization(account.organizationId);
  const studio = studios[0];
  if (!studio) {
    return {
      reply: 'That studio is not set up yet. Finish your listing on PL·CE and try again.',
      organizationId: account.organizationId,
      intent: null,
      outcome: 'refused',
    };
  }

  /*
    Claim the message before acting on it.

    Recording the inbound message and taking the right to process it are
    the same operation, enforced by a unique index on Meta's message id.
    A retried delivery loses that insert and stops here — which is what
    keeps "cancel Rahul's booking", delivered twice, from cancelling two
    bookings.

    It has to happen after identity resolution, because the row is scoped
    to an organisation, and there is no organisation until the sender is
    known. That is not a weakness: a message from an unknown or
    unverified number mutates nothing, so there is nothing to replay.
  */
  const claim = await repository.claimInboundWhatsAppMessage({
    organizationId: account.organizationId,
    phone: message.phone,
    body: message.body,
    externalId: message.messageId ?? null,
  });

  if (!claim) {
    return {
      reply: '',
      organizationId: account.organizationId,
      intent: null,
      outcome: 'help',
      duplicate: true,
    };
  }

  const reply = await respond(repository, studio, account.organizationId, message, now);

  /*
    No `externalId` on the reply.

    `external_id` is Meta's id for *this* row's message, and the unique
    index over it is what makes the inbound claim idempotent. Stamping
    the inbound id onto the outbound row claimed the same id twice: the
    claim inserted it, this insert collided with it, and every message
    that got far enough to earn a reply died on 23505 — reported to the
    owner as "That conflicts with something already saved."

    Verification survived only by accident. Its own outbound log never
    passed an id, so it never collided, which is why possession
    challenges worked while every booking failed.

    The reply's real Meta id is not knowable here anyway: it comes back
    from the send, which happens in the route after this returns. The
    inbound row already records the id, and the two rows correlate by
    organisation, phone and time.
  */
  await repository.logWhatsAppMessage({
    organizationId: account.organizationId,
    direction: 'outbound',
    phone: message.phone,
    body: reply.reply,
    intent: reply.intent as unknown as Record<string, unknown> | null,
    outcome: reply.outcome,
    bookingId: reply.bookingId ?? null,
  });

  return reply;
}

async function respond(
  repository: DataRepository,
  studio: StudioDetail,
  organizationId: string,
  message: InboundMessage,
  now: Date,
): Promise<HandledMessage> {
  const text = message.body.trim();
  const today = todayInZone(studio.timezone, now);

  // An explicit escape from a half-finished request. Without it, someone
  // who changes their mind is stuck answering a question they no longer
  // care about.
  if (/^(stop|cancel that|never mind|nevermind|forget it)$/i.test(text)) {
    await repository.clearWhatsAppConversation(organizationId, message.phone);
    return { reply: 'Dropped it. Anything else?', organizationId, intent: null, outcome: 'help' };
  }

  if (/^(hi|hello|hey|thanks|thank you|ok|okay|👍)$/i.test(text)) {
    return {
      reply: helpText(studio),
      organizationId,
      intent: { kind: 'unknown' },
      outcome: 'help',
    };
  }

  const pending = await repository.getWhatsAppConversation(organizationId, message.phone);
  const spaces = studio.spaces.filter((space) => space.isActive);

  const provider = getIntentProvider();
  const fresh = await provider.interpret(text, {
    spaceNames: spaces.map((space) => space.name),
    studioName: studio.name,
    today,
    pending: pending?.intent as Partial<Intent> | undefined,
  });

  // The stored partial is the base; the new message fills in blanks.
  // Parsing the merge again means a half-remembered conversation cannot
  // produce a shape the rest of the code has not checked.
  const merged = intentSchema.safeParse({
    ...(pending?.intent ?? {}),
    ...stripUndefined(fresh as Record<string, unknown>),
    ...answerToQuestion(pending, text, fresh),
    kind: fresh.kind === 'unknown' ? (pending?.intent?.kind ?? 'unknown') : fresh.kind,
  });

  const intent: Intent = merged.success ? merged.data : { kind: 'unknown' };

  switch (intent.kind) {
    case 'create_booking':
      return handleCreate(repository, studio, organizationId, message, intent, now, today);
    case 'check_availability':
      return handleAvailability(repository, studio, organizationId, message, intent, now, today);
    case 'todays_schedule':
      return handleSchedule(repository, studio, organizationId, intent, now, today);
    case 'cancel_booking':
      return handleCancel(repository, studio, organizationId, message, intent, now, today);
    case 'reschedule_booking':
      return handleReschedule(repository, studio, organizationId, message, intent, now, today);
    case 'block_time':
      return handleBlock(repository, studio, organizationId, message, intent, now, today);
    case 'customer_lookup':
      return handleLookup(repository, organizationId, intent, studio);
    default:
      await repository.clearWhatsAppConversation(organizationId, message.phone);
      return { reply: helpText(studio), organizationId, intent, outcome: 'help' };
  }
}

/**
 * Reads the reply to a question we asked.
 *
 * `ask` records which field it is waiting on, and until now nothing
 * read it back. That made the second half of every clarification
 * unreachable: "Who is it for?" produces "Shivam", which names no
 * command, so the merge kept `create_booking` with `customerName`
 * still missing and the same question was asked again. Forever.
 *
 * The parser is no help here. It is given the pending intent as
 * context, so it echoes that intent's kind back rather than reporting
 * `unknown` — which means "did it recognise anything" cannot
 * distinguish an answer from a fresh instruction. What does
 * distinguish them is whether it recognised something *different*: an
 * owner who replies to "Who is it for?" with "what's on today" has
 * changed the subject, not named a customer called "what's on today".
 *
 * Within the same intent, a message that did not fill the awaited
 * field is taken at face value as the answer. The cost of that is an
 * owner who replies with a time instead of a name gets a customer
 * named after a time — recoverable with "stop", and better than a
 * question that can never be answered.
 *
 * Dates and times are left alone deliberately: those parse on their
 * own, so the ordinary merge already carries them, and forcing the raw
 * text in would overwrite a good parse with a worse one.
 */
function answerToQuestion(
  pending: { intent?: unknown; awaiting?: string } | null,
  text: string,
  fresh: Intent,
): Record<string, unknown> {
  const awaiting = pending?.awaiting;
  if (!awaiting) return {};

  const pendingKind = (pending?.intent as { kind?: string } | undefined)?.kind;
  if (fresh.kind !== 'unknown' && fresh.kind !== pendingKind) return {};

  const answer = text.trim();
  if (!answer) return {};

  const supplied = fresh as unknown as Record<string, unknown>;

  switch (awaiting) {
    case 'customerName':
      return supplied.customerName ? {} : { customerName: answer };
    case 'space':
      return supplied.space ? {} : { space: answer };
    default:
      return {};
  }
}

/**
 * What to say when handling a message threw.
 *
 * "Something went wrong on our end" is the same flattening that has
 * hidden every real fault in this system: it reads as a transient blip
 * and invites a retry, while the causes worth reporting — a database
 * that did not answer, a permission that is missing — are neither
 * transient nor fixable by trying again.
 *
 * A `RepositoryError` already carries a sentence written for a person
 * to read; `throwIfError` exists to produce exactly that. Passing it
 * through tells the owner whether the problem is theirs or ours, and
 * costs nothing, because the message was never a stack trace.
 *
 * Anything else keeps the generic line. An unclassified throw has no
 * message fit to show a stranger, and this reply reaches whoever sent
 * the message — verified or not.
 */
export function explainFailure(error: unknown): string {
  if (error instanceof RepositoryError) return error.message;
  return 'Something went wrong on our end. Try again in a moment.';
}

/* ── Verification ───────────────────────────────────────────────── */

/**
 * Completing a possession challenge.
 *
 * This is the one thing an unverified number is allowed to do, and it
 * proves exactly one fact: whoever holds this number also holds the
 * PL·CE account that opened the challenge. Meta vouches for the sender;
 * the code vouches for the account. Neither alone is enough.
 *
 * Returns `null` when there is no pending challenge, so an actual
 * stranger falls through to the ordinary refusal rather than being told
 * that a challenge exists.
 *
 * The message body is never logged on this path — it contains the code.
 */
async function tryVerification(
  repository: DataRepository,
  message: InboundMessage,
): Promise<HandledMessage | null> {
  const pending = await repository.getWhatsAppVerification(message.phone);
  if (!pending) return null;

  /*
    Claimed like any other inbound message, and for the same reason: a
    redelivered wrong code should not burn a second attempt, and the
    unique index on the message id would reject the duplicate log row
    anyway.

    The body recorded is a placeholder. The code is a credential, and
    the activity log is something an owner — and anyone with sight of
    their screen — can read.
  */
  const claim = await repository.claimInboundWhatsAppMessage({
    organizationId: pending.organizationId,
    phone: message.phone,
    body: '[verification code]',
    externalId: message.messageId ?? null,
  });

  if (!claim) {
    return {
      reply: '',
      organizationId: pending.organizationId,
      intent: null,
      outcome: 'help',
      duplicate: true,
    };
  }

  const refuse = async (reply: string): Promise<HandledMessage> => {
    await repository.logWhatsAppMessage({
      organizationId: pending.organizationId,
      direction: 'outbound',
      phone: message.phone,
      body: reply,
      outcome: 'refused',
    });
    return { reply, organizationId: pending.organizationId, intent: null, outcome: 'refused' };
  };

  if (pending.expiresAt && Date.parse(pending.expiresAt) < Date.now()) {
    return refuse('That code has expired. Generate a new one in PL·CE Studio → WhatsApp.');
  }

  if (pending.attempts >= VERIFICATION_MAX_ATTEMPTS) {
    return refuse(
      'Too many incorrect codes. Generate a new one in PL·CE Studio → WhatsApp.',
    );
  }

  const code = extractVerificationCode(message.body);
  if (!code) return null;

  // Counted before it is checked, so a crash between the two cannot
  // hand an attacker a free guess.
  await repository.recordWhatsAppVerificationAttempt(pending.accountId);

  if (!verificationCodeMatches(pending.phone, code, pending.codeHash)) {
    const left = VERIFICATION_MAX_ATTEMPTS - (pending.attempts + 1);
    return refuse(
      left > 0
        ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`
        : 'Too many incorrect codes. Generate a new one in PL·CE Studio → WhatsApp.',
    );
  }

  await repository.markWhatsAppAccountVerified(pending.accountId);

  const studios = await repository.listStudiosForOrganization(pending.organizationId);
  const name = studios[0]?.name ?? 'your studio';
  const reply = `✓ Verified.

This number is now connected to ${name}. Text me a booking whenever you are ready.`;

  await repository.logWhatsAppMessage({
    organizationId: pending.organizationId,
    direction: 'outbound',
    phone: message.phone,
    body: reply,
    outcome: 'help',
  });

  return { reply, organizationId: pending.organizationId, intent: null, outcome: 'help' };
}

/* ── Create ─────────────────────────────────────────────────────── */

async function handleCreate(
  repository: DataRepository,
  studio: StudioDetail,
  organizationId: string,
  message: InboundMessage,
  intent: Extract<Intent, { kind: 'create_booking' }>,
  now: Date,
  today: string,
): Promise<HandledMessage> {
  const spaces = studio.spaces.filter((space) => space.isActive);

  const space = resolveSpace(intent.space, spaces);
  if (!space) {
    // Naming a space that does not exist is a different mistake from
    // naming none at all, and deserves a different answer.
    return ask(
      repository,
      organizationId,
      message,
      { ...intent, space: undefined },
      'space',
      intent.space
        ? `I could not find a space called "${intent.space}".\n\nYours are:\n${spaceList(spaces)}`
        : `Sure. Which space?\n\n${spaceList(spaces)}`,
    );
  }

  const date = resolveDate(intent.date, today);
  if (!date) {
    return ask(repository, organizationId, message, intent, 'date', 'Which day?');
  }

  const window = resolveWindow(intent.start, intent.end, intent.durationHours, space);
  if (!window) {
    return ask(
      repository,
      organizationId,
      message,
      intent,
      'time',
      `What time should I book ${space.name} for?`,
    );
  }

  if (!intent.customerName?.trim()) {
    return ask(repository, organizationId, message, intent, 'customerName', 'Who is it for?');
  }

  const startsAt = zonedToInstant(date, window.start, studio.timezone).toISOString();
  const endsAt = zonedToInstant(date, window.end, studio.timezone).toISOString();

  const outcome = await createBooking(
    repository,
    {
      organizationId,
      studioId: studio.id,
      spaceId: space.id,
      startsAt,
      endsAt,
      customer: {
        name: intent.customerName.trim(),
        phone: intent.customerPhone ?? null,
      },
      source: 'whatsapp',
      /*
        A verified owner telling PL·CE to book something is the same
        authority as that owner typing it into their own calendar, so it
        matches what the CRM's manual path does: confirmed.

        `autoConfirm` is deliberately not consulted here. That setting
        governs whether a *stranger* booking on the marketplace needs
        the owner to look at it first — a question that has no meaning
        when the owner is the one asking.
      */
      status: 'confirmed',
      actor: actorFor(studio),
      eventMetadata: {
        channel: 'whatsapp',
        whatsappMessageId: message.messageId ?? null,
        fromPhone: message.phone,
        intent,
      },
    },
    now,
  );

  await repository.clearWhatsAppConversation(organizationId, message.phone);

  if (!outcome.ok) {
    const alternatives = await suggestTimes(repository, studio, space, date, window, now);

    // When the clash is a specific booking, say which hours are gone
    // rather than "unavailable" — the owner is deciding what to offer a
    // customer who is on the phone right now.
    const clash = outcome.conflict
      ? `${space.name} is already booked ${formatDateRelative(date, today).toLowerCase()} from ${formatTimeRange(
          instantToZoned(outcome.conflict.startsAt, studio.timezone).time,
          instantToZoned(outcome.conflict.endsAt, studio.timezone).time,
        )}.`
      : outcome.message;

    return {
      reply: `${clash}${alternatives}`,
      organizationId,
      intent,
      outcome: 'refused',
    };
  }

  // Rendered from the row that was written, never from the intent — so
  // the confirmation is what is actually in the calendar.
  const booking = outcome.booking;
  const start = instantToZoned(booking.startsAt, booking.timezone);
  const end = instantToZoned(booking.endsAt, booking.timezone);

  return {
    reply: [
      '✓ Booked.',
      '',
      booking.spaceName,
      `${formatDateWithDay(start.date)} · ${formatTimeRange(start.time, end.time)}`,
      booking.customerName,
      formatMoney(booking.priceAmount),
      '',
      booking.reference,
    ].join('\n'),
    organizationId,
    intent,
    outcome: 'booking_created',
    bookingId: booking.id,
  };
}

/* ── Availability ───────────────────────────────────────────────── */

async function handleAvailability(
  repository: DataRepository,
  studio: StudioDetail,
  organizationId: string,
  message: InboundMessage,
  intent: Extract<Intent, { kind: 'check_availability' }>,
  now: Date,
  today: string,
): Promise<HandledMessage> {
  const spaces = studio.spaces.filter((space) => space.isActive);
  const date = resolveDate(intent.date, today) ?? today;
  const space = resolveSpace(intent.space, spaces);

  const targets = space ? [space] : spaces;
  const lines: string[] = [];

  for (const target of targets) {
    const context = await availabilityContext(
      repository,
      studio,
      target,
      zonedToInstant(date, '00:00', studio.timezone).toISOString(),
      zonedToInstant(addDaysToDateString(date, 1), '00:00', studio.timezone).toISOString(),
      now,
    );

    const booked = context.bookings
      .filter((booking) => booking.spaceId === target.id)
      .filter((booking) => instantToZoned(booking.startsAt, studio.timezone).date === date)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((booking) => {
        const start = instantToZoned(booking.startsAt, studio.timezone);
        const end = instantToZoned(booking.endsAt, studio.timezone);
        return formatTimeRange(start.time, end.time);
      });

    // A specific window was asked about — answer that question directly.
    if (intent.start && intent.end) {
      const verdict = checkRange(
        context,
        zonedToInstant(date, intent.start, studio.timezone).toISOString(),
        zonedToInstant(date, intent.end, studio.timezone).toISOString(),
      );
      lines.push(
        `${target.name}: ${verdict.ok ? 'free' : `not free — ${verdict.message?.toLowerCase()}`}`,
      );
      continue;
    }

    lines.push(
      booked.length === 0
        ? `${target.name}: free all day`
        : `${target.name}: booked ${booked.join(', ')}`,
    );
  }

  await repository.clearWhatsAppConversation(organizationId, message.phone);

  const heading =
    intent.start && intent.end
      ? `${formatDateWithDay(date)}, ${formatTimeRange(intent.start, intent.end)}`
      : formatDateWithDay(date);

  return {
    reply: `${heading}\n\n${lines.join('\n')}`,
    organizationId,
    intent,
    outcome: 'availability_checked',
  };
}

/* ── Schedule ───────────────────────────────────────────────────── */

async function handleSchedule(
  repository: DataRepository,
  studio: StudioDetail,
  organizationId: string,
  intent: Extract<Intent, { kind: 'todays_schedule' }>,
  now: Date,
  today: string,
): Promise<HandledMessage> {
  const date = resolveDate(intent.date, today) ?? today;
  const from = zonedToInstant(date, '00:00', studio.timezone).toISOString();
  const to = zonedToInstant(addDaysToDateString(date, 1), '00:00', studio.timezone).toISOString();

  const bookings = await repository.listBookingsInRange({
    spaceIds: studio.spaces.map((space) => space.id),
    from,
    to,
    statuses: ['pending', 'confirmed', 'completed'],
  });

  if (bookings.length === 0) {
    return {
      reply: `${formatDateWithDay(date)} at ${studio.name}:\n\nNothing booked.`,
      organizationId,
      intent,
      outcome: 'schedule_sent',
    };
  }

  const revenue = bookings.reduce((total, booking) => total + booking.priceAmount, 0);
  const lines = bookings
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((booking) => {
      const start = instantToZoned(booking.startsAt, studio.timezone);
      const end = instantToZoned(booking.endsAt, studio.timezone);
      return `${start.time}–${end.time} · ${booking.spaceName} · ${booking.customerName}`;
    });

  return {
    reply: [
      `${formatDateWithDay(date)} at ${studio.name}:`,
      '',
      ...lines,
      '',
      `${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'} · ${formatMoney(revenue)}`,
    ].join('\n'),
    organizationId,
    intent,
    outcome: 'schedule_sent',
  };
}

/* ── Cancel ─────────────────────────────────────────────────────── */

async function handleCancel(
  repository: DataRepository,
  studio: StudioDetail,
  organizationId: string,
  message: InboundMessage,
  intent: Extract<Intent, { kind: 'cancel_booking' }>,
  now: Date,
  today: string,
): Promise<HandledMessage> {
  const match = await findBooking(repository, studio, organizationId, intent, now, today);

  if (match.kind === 'ask') {
    return ask(repository, organizationId, message, intent, match.field, match.question);
  }
  if (match.kind === 'none') {
    await repository.clearWhatsAppConversation(organizationId, message.phone);
    return { reply: match.message, organizationId, intent, outcome: 'refused' };
  }

  const booking = match.booking;
  await cancelBooking(
    repository,
    {
      bookingId: booking.id,
      organizationId,
      reason: 'Cancelled over WhatsApp',
      actor: actorFor(studio),
    },
    now,
  );

  await repository.clearWhatsAppConversation(organizationId, message.phone);
  const start = instantToZoned(booking.startsAt, studio.timezone);

  return {
    reply: [
      '✓ Cancelled.',
      '',
      `${booking.customerName} · ${booking.spaceName}`,
      `${formatDateWithDay(start.date)} · ${start.time}`,
      booking.reference,
      '',
      'The slot is free again.',
    ].join('\n'),
    organizationId,
    intent,
    outcome: 'booking_cancelled',
    bookingId: booking.id,
  };
}

/* ── Reschedule ─────────────────────────────────────────────────── */

async function handleReschedule(
  repository: DataRepository,
  studio: StudioDetail,
  organizationId: string,
  message: InboundMessage,
  intent: Extract<Intent, { kind: 'reschedule_booking' }>,
  now: Date,
  today: string,
): Promise<HandledMessage> {
  const match = await findBooking(repository, studio, organizationId, intent, now, today);

  if (match.kind === 'ask') {
    return ask(repository, organizationId, message, intent, match.field, match.question);
  }
  if (match.kind === 'none') {
    await repository.clearWhatsAppConversation(organizationId, message.phone);
    return { reply: match.message, organizationId, intent, outcome: 'refused' };
  }

  const booking = match.booking;
  const current = instantToZoned(booking.startsAt, studio.timezone);
  const currentEnd = instantToZoned(booking.endsAt, studio.timezone);
  const lengthMinutes =
    (timeToMinutes(currentEnd.time) ?? 0) - (timeToMinutes(current.time) ?? 0);

  const date = resolveDate(intent.newDate ?? intent.date, today) ?? current.date;
  const start = intent.start;

  if (!start) {
    return ask(
      repository,
      organizationId,
      message,
      intent,
      'time',
      `What time should ${booking.customerName}'s booking move to?`,
    );
  }

  const end =
    intent.end ?? minutesToTime((timeToMinutes(start) ?? 0) + Math.max(60, lengthMinutes));

  const outcome = await rescheduleBooking(
    repository,
    {
      bookingId: booking.id,
      organizationId,
      startsAt: zonedToInstant(date, start, studio.timezone).toISOString(),
      endsAt: zonedToInstant(date, end, studio.timezone).toISOString(),
      actor: actorFor(studio),
    },
    now,
  );

  await repository.clearWhatsAppConversation(organizationId, message.phone);

  if (!outcome.ok) {
    return {
      reply: `Could not move it.\n\n${outcome.message}`,
      organizationId,
      intent,
      outcome: 'refused',
    };
  }

  const moved = outcome.booking;
  const newStart = instantToZoned(moved.startsAt, studio.timezone);
  const newEnd = instantToZoned(moved.endsAt, studio.timezone);

  return {
    reply: [
      '✓ Moved.',
      '',
      `${moved.customerName} · ${moved.spaceName}`,
      `${formatDateWithDay(newStart.date)} · ${formatTimeRange(newStart.time, newEnd.time)}`,
      moved.reference,
    ].join('\n'),
    organizationId,
    intent,
    outcome: 'booking_moved',
    bookingId: moved.id,
  };
}

/* ── Block ──────────────────────────────────────────────────────── */

async function handleBlock(
  repository: DataRepository,
  studio: StudioDetail,
  organizationId: string,
  message: InboundMessage,
  intent: Extract<Intent, { kind: 'block_time' }>,
  now: Date,
  today: string,
): Promise<HandledMessage> {
  const spaces = studio.spaces.filter((space) => space.isActive);
  const space = resolveSpace(intent.space, spaces);

  if (!space) {
    return ask(
      repository,
      organizationId,
      message,
      intent,
      'space',
      intent.space
        ? `I could not find a space called "${intent.space}".\n\nYours are:\n${spaceList(spaces)}`
        : `Which space should I block?\n\n${spaceList(spaces)}`,
    );
  }

  const date = resolveDate(intent.date, today);
  if (!date) return ask(repository, organizationId, message, intent, 'date', 'Which day?');

  const start = intent.start ?? '09:00';
  const end = intent.end ?? '21:00';

  const outcome = await blockTime(repository, {
    organizationId,
    spaceId: space.id,
    startsAt: zonedToInstant(date, start, studio.timezone).toISOString(),
    endsAt: zonedToInstant(date, end, studio.timezone).toISOString(),
    reason: intent.reason ?? null,
    actor: actorFor(studio),
  });

  await repository.clearWhatsAppConversation(organizationId, message.phone);

  if (!outcome.ok) {
    return {
      reply: `Could not block that.\n\n${outcome.message}`,
      organizationId,
      intent,
      outcome: 'refused',
    };
  }

  return {
    reply: [
      '✓ Blocked.',
      '',
      space.name,
      `${formatDateWithDay(date)} · ${formatTimeRange(start, end)}`,
      intent.reason ?? 'No bookings can land in that window.',
    ].join('\n'),
    organizationId,
    intent,
    outcome: 'time_blocked',
  };
}

/* ── Customer lookup ────────────────────────────────────────────── */

async function handleLookup(
  repository: DataRepository,
  organizationId: string,
  intent: Extract<Intent, { kind: 'customer_lookup' }>,
  studio: StudioDetail,
): Promise<HandledMessage> {
  if (!intent.name?.trim()) {
    return {
      reply: 'Who are you looking for?',
      organizationId,
      intent,
      outcome: 'clarification',
    };
  }

  const matches = await repository.searchCustomers(organizationId, intent.name.trim(), 3);
  if (matches.length === 0) {
    return {
      reply: `No customer called ${intent.name} at ${studio.name}.`,
      organizationId,
      intent,
      outcome: 'refused',
    };
  }

  const customer = matches[0]!;
  const summary = await repository.getCustomer(organizationId, customer.id);
  if (!summary) {
    return {
      reply: `No record for ${intent.name}.`,
      organizationId,
      intent,
      outcome: 'refused',
    };
  }

  const lines = [
    summary.name,
    summary.phone ?? '',
    '',
    `${summary.totalBookings} bookings · ${formatMoney(summary.totalSpend)}`,
  ];

  if (summary.nextBookingAt) {
    const next = instantToZoned(summary.nextBookingAt, studio.timezone);
    lines.push(`Next: ${formatDateWithDay(next.date)} at ${next.time}`);
  } else {
    lines.push('Nothing booked ahead.');
  }

  if (summary.notes) lines.push('', summary.notes);

  return {
    reply: lines.filter(Boolean).join('\n'),
    organizationId,
    intent,
    outcome: 'customer_found',
  };
}

/* ── Clarification ──────────────────────────────────────────────── */

/**
 * Ask one question and remember what has been established so far.
 *
 * Ambiguity is a state, not an error. The partial intent is stored with
 * an expiry, so an abandoned conversation cannot quietly complete a
 * booking twenty minutes later.
 */
async function ask(
  repository: DataRepository,
  organizationId: string,
  message: InboundMessage,
  intent: Intent,
  field: string,
  question: string,
): Promise<HandledMessage> {
  await repository.saveWhatsAppConversation({
    organizationId,
    phone: message.phone,
    intent: intent as unknown as Record<string, unknown>,
    awaiting: field,
    expiresAt: new Date(Date.now() + CONVERSATION_TTL_MINUTES * 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return { reply: question, organizationId, intent, outcome: 'clarification' };
}

/* ── Resolution ─────────────────────────────────────────────────── */

function resolveSpace(name: string | undefined, spaces: Space[]): Space | undefined {
  if (spaces.length === 1) return spaces[0];
  if (!name) return undefined;

  const needle = name.trim().toLowerCase();
  return (
    spaces.find((space) => space.name.toLowerCase() === needle) ??
    spaces.find((space) => space.name.toLowerCase().includes(needle)) ??
    spaces.find((space) => needle.includes(space.name.toLowerCase()))
  );
}

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/**
 * Word to calendar date, in the studio's timezone.
 *
 * Deliberately server-side: "tomorrow" depends on where the studio is,
 * and a model doing this arithmetic is a model that can be a day out.
 */
function resolveDate(token: string | undefined, today: string): string | undefined {
  if (!token) return undefined;
  const value = token.trim().toLowerCase();

  if (isValidDateString(value)) return value;
  if (value === 'today' || value === 'tonight') return today;
  if (value === 'tomorrow') return addDaysToDateString(today, 1);
  if (value === 'day after tomorrow') return addDaysToDateString(today, 2);

  const weekday = WEEKDAYS.indexOf(value);
  if (weekday !== -1) {
    const current = new Date(`${today}T00:00:00Z`).getUTCDay();
    // "Saturday" said on a Saturday means the next one, not today.
    const ahead = (weekday - current + 7) % 7 || 7;
    return addDaysToDateString(today, ahead);
  }

  const day = /^day (\d{1,2})$/.exec(value);
  if (day) {
    const target = Number(day[1]);
    const candidate = `${today.slice(0, 8)}${String(target).padStart(2, '0')}`;
    if (!isValidDateString(candidate)) return undefined;
    // A day number already past this month means next month.
    return candidate >= today ? candidate : nextMonthDay(today, target);
  }

  return undefined;
}

function nextMonthDay(today: string, day: number): string | undefined {
  const [year, month] = today.split('-').map(Number) as [number, number];
  const shifted = new Date(Date.UTC(year, month, day));
  const candidate = shifted.toISOString().slice(0, 10);
  return isValidDateString(candidate) ? candidate : undefined;
}

function resolveWindow(
  start: string | undefined,
  end: string | undefined,
  durationHours: number | undefined,
  space: Space,
): { start: string; end: string } | undefined {
  if (!start) return undefined;
  const startMinutes = timeToMinutes(start);
  if (startMinutes == null) return undefined;

  if (end) {
    const endMinutes = timeToMinutes(end);
    if (endMinutes != null && endMinutes > startMinutes) {
      return { start: minutesToTime(startMinutes), end: minutesToTime(endMinutes) };
    }
  }

  // No end time given: the space's own minimum is the honest default,
  // and it is shown back in the confirmation.
  const length = durationHours ? durationHours * 60 : space.minBookingMinutes;
  return { start: minutesToTime(startMinutes), end: minutesToTime(startMinutes + length) };
}

/* ── Finding an existing booking ────────────────────────────────── */

type BookingMatch =
  | { kind: 'found'; booking: Awaited<ReturnType<DataRepository['getBooking']>> & object }
  | { kind: 'ask'; field: string; question: string }
  | { kind: 'none'; message: string };

async function findBooking(
  repository: DataRepository,
  studio: StudioDetail,
  organizationId: string,
  intent: { reference?: string; customerName?: string; date?: string },
  now: Date,
  today: string,
): Promise<BookingMatch> {
  if (intent.reference) {
    const booking = await repository.getBookingByReference(intent.reference);
    if (booking && booking.organizationId === organizationId) {
      return { kind: 'found', booking };
    }
    return { kind: 'none', message: `No booking here with the reference ${intent.reference}.` };
  }

  if (!intent.customerName?.trim()) {
    return { kind: 'ask', field: 'customerName', question: 'Whose booking?' };
  }

  const customers = await repository.searchCustomers(
    organizationId,
    intent.customerName.trim(),
    5,
  );
  if (customers.length === 0) {
    return {
      kind: 'none',
      message: `No customer called ${intent.customerName} at ${studio.name}.`,
    };
  }

  const date = resolveDate(intent.date, today);
  const upcoming = [];

  for (const customer of customers) {
    const page = await repository.listBookings(organizationId, {
      filters: {
        customerId: customer.id,
        status: ['pending', 'confirmed'],
        from: now.toISOString(),
      },
      pageSize: 10,
    });
    upcoming.push(...page.items);
  }

  const candidates = date
    ? upcoming.filter(
        (booking) => instantToZoned(booking.startsAt, studio.timezone).date === date,
      )
    : upcoming;

  if (candidates.length === 0) {
    return {
      kind: 'none',
      message: date
        ? `${intent.customerName} has nothing booked on ${formatDateWithDay(date)}.`
        : `${intent.customerName} has nothing booked ahead.`,
    };
  }

  if (candidates.length > 1) {
    const options = candidates
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 4)
      .map((booking) => {
        const start = instantToZoned(booking.startsAt, studio.timezone);
        return `· ${formatDateWithDay(start.date)} ${start.time} · ${booking.spaceName} · ${booking.reference}`;
      });

    return {
      kind: 'ask',
      field: 'reference',
      question: `${intent.customerName} has more than one booking. Which?\n\n${options.join('\n')}`,
    };
  }

  return { kind: 'found', booking: candidates[0]! };
}

/* ── Helpers ────────────────────────────────────────────────────── */

/**
 * When a requested slot is taken, offering the nearest free ones turns a
 * refusal into a decision — which is the difference between a booking
 * lost and a booking moved.
 */
async function suggestTimes(
  repository: DataRepository,
  studio: StudioDetail,
  space: Space,
  date: string,
  window: { start: string; end: string },
  now: Date,
): Promise<string> {
  const lengthMinutes =
    (timeToMinutes(window.end) ?? 0) - (timeToMinutes(window.start) ?? 0);
  if (lengthMinutes <= 0) return '';

  const context = await availabilityContext(
    repository,
    studio,
    space,
    zonedToInstant(date, '00:00', studio.timezone).toISOString(),
    zonedToInstant(addDaysToDateString(date, 1), '00:00', studio.timezone).toISOString(),
    now,
  );

  const free: string[] = [];
  for (let minutes = 6 * 60; minutes <= 22 * 60 - lengthMinutes; minutes += 60) {
    const start = minutesToTime(minutes);
    const end = minutesToTime(minutes + lengthMinutes);
    const verdict = checkRange(
      context,
      zonedToInstant(date, start, studio.timezone).toISOString(),
      zonedToInstant(date, end, studio.timezone).toISOString(),
    );
    if (verdict.ok) free.push(formatTimeRange(start, end));
    if (free.length >= 3) break;
  }

  if (free.length === 0) return '';
  return `\n\nFree that day: ${free.join(', ')}`;
}

function actorFor(studio: StudioDetail): BookingActor {
  return { userId: null, name: `${studio.name} (WhatsApp)`, kind: 'whatsapp' };
}

/** The owner's own rooms, listed back to them. */
function spaceList(spaces: Space[]): string {
  return spaces.map((space) => `· ${space.name}`).join('\n');
}

function helpText(studio: StudioDetail): string {
  return [
    `${studio.name} on PL·CE. Try:`,
    '',
    '· Book Main Studio tomorrow 3 to 6 for Rahul',
    '· Is the cyc free saturday evening?',
    '· What do I have today?',
    '· Cancel Rahul’s booking tomorrow',
    '· Move Rahul’s booking to 6 PM',
    '· Block Main Studio tomorrow morning',
    '· When is Rahul coming next?',
  ].join('\n');
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
