import type { Weekday } from '@/types/domain';

/**
 * Timezone-aware time handling, without a timezone library.
 *
 * A studio in Mumbai opens at 09:00 *there*. Everyone reading the
 * calendar — the owner on a laptop, the customer on a train, the server
 * rendering the page — must agree on which instant that is. So the rule
 * throughout PL·CE is:
 *
 *   stored instants are UTC ISO strings
 *   wall-clock strings ('YYYY-MM-DD', 'HH:mm') are always accompanied by
 *   the studio's IANA timezone, and converted here
 *
 * `Intl.DateTimeFormat` already carries the full IANA database in every
 * runtime this ships to, so the conversion needs no dependency — only
 * care around DST, which the two-pass resolution below handles.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/* ── Wall-clock helpers ─────────────────────────────────────────── */

/** '14:30' → 870. Returns null for anything that is not a valid time. */
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 870 → '14:30'. Minutes past midnight; 1440 renders as '24:00'. */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.round(minutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** '14:30' → '2:30 PM'. */
export function formatTimeLabel(time: string): string {
  const minutes = timeToMinutes(time);
  if (minutes == null) return time;
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return mins === 0 ? `${hours12} ${suffix}` : `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

export function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Calendar arithmetic on 'YYYY-MM-DD', independent of any timezone. */
export function addDaysToDateString(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Whole days between two 'YYYY-MM-DD' strings (b − a). */
export function daysBetweenDateStrings(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS,
  );
}

/* ── Zone conversion ────────────────────────────────────────────── */

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(timeZone, formatter);
  }
  return formatter;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedPartsOf(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  // 'hour: 2-digit' with hour12:false renders midnight as 24 in some
  // runtimes; normalising here keeps the arithmetic below honest.
  const hour = read('hour') % 24;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Milliseconds the zone is ahead of UTC at this instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedPartsOf(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - instant.getTime();
}

/**
 * '2026-09-10' + '15:00' in 'Asia/Kolkata' → the UTC instant.
 *
 * Resolved in two passes: the first guesses the offset using the naive
 * instant, the second corrects it using an instant that is already close.
 * That is what makes the hour either side of a DST change come out right
 * — India has no DST, but this code should not quietly be wrong the first
 * time PL·CE lists a studio in a zone that does.
 */
export function zonedToInstant(date: string, time: string, timeZone: string): Date {
  const minutes = timeToMinutes(time) ?? 0;
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const naive = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);

  const firstPass = naive - zoneOffsetMs(new Date(naive), timeZone);
  const secondPass = naive - zoneOffsetMs(new Date(firstPass), timeZone);
  return new Date(secondPass);
}

/** The inverse: a UTC instant → the studio's local date, time and weekday. */
export function instantToZoned(
  instant: string | Date,
  timeZone: string,
): { date: string; time: string; weekday: Weekday; minutes: number } {
  const asDate = typeof instant === 'string' ? new Date(instant) : instant;
  const parts = zonedPartsOf(asDate, timeZone);
  const date = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const minutes = parts.hour * 60 + parts.minute;
  // Weekday of the *local* date, derived from the local calendar date so
  // an 11pm booking never lands on the previous day's opening hours.
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() as Weekday;
  return { date, time: minutesToTime(minutes), weekday, minutes };
}

/** Today's date in the studio's zone — never `new Date()` in a component. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return instantToZoned(now, timeZone).date;
}

/* ── Ranges ─────────────────────────────────────────────────────── */

export interface Interval {
  start: number;
  end: number;
}

/** Half-open overlap: `[a, b)`. Back-to-back bookings do not collide. */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function instantsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return intervalsOverlap(
    { start: Date.parse(aStart), end: Date.parse(aEnd) },
    { start: Date.parse(bStart), end: Date.parse(bEnd) },
  );
}

export function durationMinutes(startsAt: string, endsAt: string): number {
  return Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / MINUTE_MS);
}

export function durationHours(startsAt: string, endsAt: string): number {
  return durationMinutes(startsAt, endsAt) / 60;
}

/** Start of the local day, as a UTC instant. */
export function startOfZonedDay(date: string, timeZone: string): Date {
  return zonedToInstant(date, '00:00', timeZone);
}

/** Exclusive end of the local day, as a UTC instant. */
export function endOfZonedDay(date: string, timeZone: string): Date {
  return zonedToInstant(addDaysToDateString(date, 1), '00:00', timeZone);
}

/** The Monday-first week containing `date`, as seven date strings. */
export function weekOf(date: string): string[] {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const monday = addDaysToDateString(date, offsetToMonday);
  return Array.from({ length: 7 }, (_, index) => addDaysToDateString(monday, index));
}

/** Every date in the calendar grid for `date`'s month, padded to whole weeks. */
export function monthGridOf(date: string): string[] {
  const [year, month] = date.split('-').map(Number) as [number, number];
  const first = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${first.slice(0, 8)}${String(daysInMonth).padStart(2, '0')}`;

  const leading = weekOf(first);
  const trailing = weekOf(last);
  const days: string[] = [];
  let cursor = leading[0]!;
  const end = trailing[6]!;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDaysToDateString(cursor, 1);
  }
  return days;
}
