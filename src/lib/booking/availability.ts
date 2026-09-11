import {
  addDaysToDateString,
  instantToZoned,
  intervalsOverlap,
  minutesToTime,
  timeToMinutes,
  zonedToInstant,
  MINUTE_MS,
} from '@/lib/time';
import type {
  AvailabilityRule,
  BlockedTime,
  BookingRules,
  BookingStatus,
  Space,
  Weekday,
} from '@/types/domain';
import { BLOCKING_BOOKING_STATUSES } from '@/types/domain';

/**
 * Availability, as a pure function.
 *
 * Nothing in this file reads the clock, touches the database, or knows
 * which surface is asking. Everything it needs is passed in. That is what
 * makes it trustworthy: the answer given to a customer browsing
 * `/discover`, to an owner dragging a booking in the calendar, and to a
 * WhatsApp message asking "is Studio A free tomorrow 6-9?" is produced by
 * the same code and cannot disagree with itself.
 */

export type UnavailableReason =
  | 'invalid_range'
  | 'inactive_space'
  | 'past'
  | 'too_soon'
  | 'too_far'
  | 'too_short'
  | 'not_aligned'
  | 'closed'
  | 'outside_hours'
  | 'blocked'
  | 'booked';

export interface BookingLike {
  id: string;
  spaceId: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
}

export interface AvailabilityContext {
  space: Pick<
    Space,
    'id' | 'isActive' | 'minBookingMinutes' | 'bufferMinutes' | 'hourlyRate' | 'name'
  >;
  timezone: string;
  rules: AvailabilityRule[];
  blocked: BlockedTime[];
  bookings: BookingLike[];
  bookingRules: BookingRules;
  now: Date;
  /** Ignored when checking a reschedule of this booking against itself. */
  excludeBookingId?: string;
}

export interface AvailabilityVerdict {
  ok: boolean;
  reason?: UnavailableReason;
  message?: string;
  /** Present when the clash is a specific booking or block. */
  conflict?: { startsAt: string; endsAt: string; label: string };
}

const OK: AvailabilityVerdict = { ok: true };

/**
 * Can this exact range be booked?
 *
 * The order of the checks is the order a human would explain a refusal
 * in: is the request coherent, is it in time, is the studio even open,
 * and only then — is something already there.
 */
export function checkRange(
  context: AvailabilityContext,
  startsAt: string,
  endsAt: string,
): AvailabilityVerdict {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return refuse('invalid_range', 'The end time has to be after the start time.');
  }

  if (!context.space.isActive) {
    return refuse('inactive_space', `${context.space.name} is not taking bookings right now.`);
  }

  const durationMinutes = Math.round((end - start) / MINUTE_MS);
  const { minBookingMinutes, bufferMinutes } = context.space;
  const { minNoticeMinutes, maxAdvanceDays, slotMinutes } = context.bookingRules;

  if (durationMinutes < minBookingMinutes) {
    return refuse(
      'too_short',
      `${context.space.name} has a ${formatMinutes(minBookingMinutes)} minimum booking.`,
    );
  }

  if (durationMinutes % slotMinutes !== 0) {
    return refuse('not_aligned', `Bookings run in ${slotMinutes}-minute blocks.`);
  }

  const nowMs = context.now.getTime();
  if (start < nowMs) {
    return refuse('past', 'That time has already passed.');
  }
  if (start < nowMs + minNoticeMinutes * MINUTE_MS) {
    return refuse(
      'too_soon',
      `This studio needs ${formatMinutes(minNoticeMinutes)} notice before a booking starts.`,
    );
  }
  if (start > nowMs + maxAdvanceDays * 86_400_000) {
    return refuse('too_far', `Bookings open ${maxAdvanceDays} days ahead.`);
  }

  const hours = openingWindowFor(context, startsAt);
  if (!hours) {
    return refuse('closed', `${context.space.name} is closed that day.`);
  }
  if (start < hours.opens || end > hours.closes) {
    return refuse(
      'outside_hours',
      `That day the studio is open ${minutesToTime(hours.opensMinutes)}–${minutesToTime(hours.closesMinutes)}.`,
    );
  }

  const range = { start, end };

  for (const block of context.blocked) {
    if (block.spaceId !== context.space.id) continue;
    if (intervalsOverlap(range, { start: Date.parse(block.startsAt), end: Date.parse(block.endsAt) })) {
      return {
        ok: false,
        reason: 'blocked',
        message: block.reason
          ? `That time is blocked (${block.reason}).`
          : 'That time is blocked off.',
        conflict: {
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          label: block.reason ?? 'Blocked',
        },
      };
    }
  }

  /**
   * Turnaround time is applied symmetrically. An existing booking holds
   * the space until `endsAt + buffer`, and the new booking will hold it
   * from `startsAt`, so the gap between any two bookings is at least one
   * buffer regardless of which one was made first.
   */
  const bufferMs = bufferMinutes * MINUTE_MS;
  for (const booking of context.bookings) {
    if (booking.spaceId !== context.space.id) continue;
    if (booking.id === context.excludeBookingId) continue;
    if (!BLOCKING_BOOKING_STATUSES.includes(booking.status)) continue;

    const held = {
      start: Date.parse(booking.startsAt) - bufferMs,
      end: Date.parse(booking.endsAt) + bufferMs,
    };
    if (intervalsOverlap(range, held)) {
      return {
        ok: false,
        reason: 'booked',
        message:
          bufferMinutes > 0
            ? `That overlaps another booking (plus ${formatMinutes(bufferMinutes)} turnaround).`
            : 'That overlaps another booking.',
        conflict: { startsAt: booking.startsAt, endsAt: booking.endsAt, label: 'Booked' },
      };
    }
  }

  return OK;
}

/* ── Day view ───────────────────────────────────────────────────── */

export interface Slot {
  /** Local wall-clock start, 'HH:mm'. */
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  available: boolean;
  reason?: UnavailableReason;
}

/**
 * Every slot-sized block of one local day, marked available or not.
 *
 * The grid comes from the studio's opening hours, so a studio open
 * 09:00–21:00 produces 24 half-hour blocks and nothing outside them —
 * rendering a greyed-out 3 AM row would be noise, not information.
 */
export function daySlots(context: AvailabilityContext, date: string): Slot[] {
  const hours = openingWindowForDate(context, date);
  if (!hours) return [];

  const { slotMinutes } = context.bookingRules;
  const slots: Slot[] = [];

  for (
    let minutes = hours.opensMinutes;
    minutes + slotMinutes <= hours.closesMinutes;
    minutes += slotMinutes
  ) {
    const startTime = minutesToTime(minutes);
    const endTime = minutesToTime(minutes + slotMinutes);
    const startsAt = zonedToInstant(date, startTime, context.timezone).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + slotMinutes * MINUTE_MS).toISOString();

    // A single slot is checked against occupancy and time only — the
    // minimum-duration rule applies to the whole booking, not to the
    // grid, so it must not grey out every cell of a two-hour-minimum
    // studio.
    const verdict = checkSlot(context, startsAt, endsAt);
    slots.push({
      startTime,
      endTime,
      startsAt,
      endsAt,
      available: verdict.ok,
      reason: verdict.reason,
    });
  }

  return slots;
}

/** Occupancy and timing for one grid cell, ignoring duration rules. */
function checkSlot(
  context: AvailabilityContext,
  startsAt: string,
  endsAt: string,
): AvailabilityVerdict {
  const relaxed: AvailabilityContext = {
    ...context,
    space: { ...context.space, minBookingMinutes: 0 },
    bookingRules: { ...context.bookingRules, slotMinutes: 1 },
  };
  return checkRange(relaxed, startsAt, endsAt);
}

/**
 * The start times from which a booking of `durationMinutes` would fit.
 * This is what the customer booking flow renders once a duration is
 * chosen — offering a start that cannot hold the whole booking is the
 * classic way to make a booking form feel broken.
 */
export function startTimesFor(
  context: AvailabilityContext,
  date: string,
  durationMinutes: number,
): Slot[] {
  const grid = daySlots(context, date);
  return grid
    .map((slot) => {
      const endsAt = new Date(Date.parse(slot.startsAt) + durationMinutes * MINUTE_MS).toISOString();
      const verdict = checkRange(context, slot.startsAt, endsAt);
      return {
        ...slot,
        endsAt,
        endTime: instantToZoned(endsAt, context.timezone).time,
        available: verdict.ok,
        reason: verdict.reason,
      };
    })
    .filter((slot) => slot.available || slot.reason === 'booked' || slot.reason === 'blocked');
}

/** Whether a space has any bookable start time on a day — for date pickers. */
export function hasAvailabilityOn(
  context: AvailabilityContext,
  date: string,
  durationMinutes: number,
): boolean {
  return startTimesFor(context, date, durationMinutes).some((slot) => slot.available);
}

/* ── Opening hours ──────────────────────────────────────────────── */

interface OpeningWindow {
  opensMinutes: number;
  closesMinutes: number;
  opens: number;
  closes: number;
}

function openingWindowFor(context: AvailabilityContext, instant: string): OpeningWindow | null {
  const { date } = instantToZoned(instant, context.timezone);
  return openingWindowForDate(context, date);
}

function openingWindowForDate(context: AvailabilityContext, date: string): OpeningWindow | null {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() as Weekday;
  const rule = context.rules.find(
    (candidate) => candidate.spaceId === context.space.id && candidate.weekday === weekday,
  );
  if (!rule || rule.isClosed) return null;

  const opensMinutes = timeToMinutes(rule.opensAt);
  const closesRaw = timeToMinutes(rule.closesAt);
  if (opensMinutes == null) return null;

  // '24:00' is a legitimate closing time and `timeToMinutes` rejects it,
  // so midnight close is normalised to the end of the day here.
  const closesMinutes = closesRaw ?? (rule.closesAt.trim() === '24:00' ? 1440 : null);
  if (closesMinutes == null || closesMinutes <= opensMinutes) return null;

  const opens = zonedToInstant(date, minutesToTime(opensMinutes), context.timezone).getTime();
  const closes =
    closesMinutes >= 1440
      ? zonedToInstant(addDaysToDateString(date, 1), '00:00', context.timezone).getTime()
      : zonedToInstant(date, minutesToTime(closesMinutes), context.timezone).getTime();

  return { opensMinutes, closesMinutes, opens, closes };
}

/** The studio's hours for a day, as a label. Null when closed. */
export function openingHoursLabel(context: AvailabilityContext, date: string): string | null {
  const window = openingWindowForDate(context, date);
  if (!window) return null;
  return `${minutesToTime(window.opensMinutes)}–${minutesToTime(window.closesMinutes)}`;
}

/* ── Pricing ────────────────────────────────────────────────────── */

/**
 * Price for a range.
 *
 * Half-day and full-day rates are caps, not tiers: a customer who books
 * nine hours pays the day rate rather than nine times the hourly rate,
 * which is what every studio means when it quotes one.
 */
export function priceFor(
  space: Pick<Space, 'hourlyRate' | 'halfDayRate' | 'fullDayRate'>,
  startsAt: string,
  endsAt: string,
): number {
  const hours = (Date.parse(endsAt) - Date.parse(startsAt)) / 3_600_000;
  const hourly = Math.round(space.hourlyRate * hours);

  const caps: number[] = [hourly];
  if (space.halfDayRate != null && hours >= 4) caps.push(space.halfDayRate);
  if (space.fullDayRate != null && hours >= 8) caps.push(space.fullDayRate);

  return Math.min(...caps);
}

/* ── Helpers ────────────────────────────────────────────────────── */

function refuse(reason: UnavailableReason, message: string): AvailabilityVerdict {
  return { ok: false, reason, message };
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}-minute`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}-hour`;
}
