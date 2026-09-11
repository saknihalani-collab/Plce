import 'server-only';

import type { HourCell, HourState } from '@/components/brand/hour-strip';
import { daySlots, type AvailabilityContext } from '@/lib/booking/availability';
import type { DataRepository } from '@/lib/data/repository';
import { addDaysToDateString, DAY_MS, startOfZonedDay, todayInZone } from '@/lib/time';
import { DEFAULT_BOOKING_RULES, type Space } from '@/types/domain';

/**
 * Today's hours for a page full of studios, in four queries.
 *
 * Every discovery card carries an hour strip, and the strip is only
 * worth having if it is true — so it is computed from the same
 * availability function the booking form uses, not from a summary column
 * that could drift. Doing that a studio at a time would be an N+1 on the
 * busiest page in the product, so the whole page is loaded at once and
 * the merge happens in memory.
 *
 * A studio's hour is free if *any* of its spaces is free then, which is
 * the question a browsing customer is actually asking.
 *
 * `dayOffset` moves the whole thing forward a day at a time, each studio
 * in its own timezone. On a future day nothing has "already gone", so the
 * clock the availability function is given is the start of that day
 * rather than the real one — otherwise a page opened at 10 PM would
 * report tomorrow morning as already past.
 */
export async function todayHourCells(
  repository: DataRepository,
  studios: Array<{ id: string; timezone: string }>,
  now: Date = new Date(),
  dayOffset = 0,
): Promise<Map<string, HourCell[]>> {
  const result = new Map<string, HourCell[]>();
  if (studios.length === 0) return result;

  const spaces = await repository.listSpacesForStudios(studios.map((studio) => studio.id));
  const activeSpaces = spaces.filter((space) => space.isActive);
  const spaceIds = activeSpaces.map((space) => space.id);
  if (spaceIds.length === 0) return result;

  // A day either side of now covers every timezone the marketplace could
  // be listing in, plus the turnaround buffers on bookings at the edges.
  const from = new Date(now.getTime() + (dayOffset - 1) * DAY_MS).toISOString();
  const to = new Date(now.getTime() + (dayOffset + 2) * DAY_MS).toISOString();

  const [rules, blocked, bookings] = await Promise.all([
    repository.listAvailabilityRules(spaceIds),
    repository.listBlockedTimes({ spaceIds, from, to }),
    repository.listBookingsInRange({ spaceIds, from, to }),
  ]);

  const spacesByStudio = new Map<string, Space[]>();
  for (const space of activeSpaces) {
    const list = spacesByStudio.get(space.studioId) ?? [];
    list.push(space);
    spacesByStudio.set(space.studioId, list);
  }

  for (const studio of studios) {
    const studioSpaces = spacesByStudio.get(studio.id) ?? [];
    if (studioSpaces.length === 0) continue;

    const date = addDaysToDateString(todayInZone(studio.timezone, now), dayOffset);
    const clock = dayOffset === 0 ? now : startOfZonedDay(date, studio.timezone);
    const perHour = new Map<number, HourState>();

    for (const space of studioSpaces) {
      const context: AvailabilityContext = {
        space,
        timezone: studio.timezone,
        rules,
        blocked,
        bookings,
        // The preview is drawn at hour granularity regardless of the
        // studio's own slot size — it is a shape, not a booking form.
        bookingRules: { ...DEFAULT_BOOKING_RULES, slotMinutes: 60, minNoticeMinutes: 0 },
        now: clock,
      };

      for (const slot of daySlots(context, date)) {
        const hour = Number(slot.startTime.slice(0, 2));
        const state = stateOf(slot.available, slot.reason);
        perHour.set(hour, strongest(perHour.get(hour), state));
      }
    }

    const cells = [...perHour.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, state]) => ({ hour, state }));

    if (cells.length > 0) result.set(studio.id, cells);
  }

  return result;
}

function stateOf(available: boolean, reason: string | undefined): HourState {
  if (available) return 'free';
  if (reason === 'booked') return 'booked';
  if (reason === 'blocked') return 'blocked';
  // Hours already gone today are not "booked" — showing them as such
  // would tell a customer the studio is busier than it is.
  return 'closed';
}

/** Free beats booked beats blocked beats closed, across a studio's spaces. */
const RANK: Record<HourState, number> = { free: 3, booked: 2, blocked: 1, closed: 0 };

function strongest(current: HourState | undefined, next: HourState): HourState {
  if (!current) return next;
  return RANK[next] > RANK[current] ? next : current;
}
