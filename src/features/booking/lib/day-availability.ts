import 'server-only';

import type { HourCell, HourState } from '@/components/brand/hour-strip';
import {
  daySlots,
  openingHoursLabel,
  startTimesFor,
  type AvailabilityContext,
  type Slot,
} from '@/lib/booking/availability';
import type { DataRepository } from '@/lib/data/repository';
import { addDaysToDateString, DAY_MS, zonedToInstant } from '@/lib/time';
import type { Space, StudioDetail } from '@/types/domain';

/**
 * One day of one space, ready to render.
 *
 * The booking form, the listing page and the owner's calendar all ask
 * this same question, so they ask it in the same place — and get the
 * same answer, computed by the same pure function.
 */
export interface DayAvailability {
  date: string;
  openingLabel: string | null;
  /** Hour cells for the strip. */
  hours: HourCell[];
  /** Start times that would fit a booking of the chosen duration. */
  startTimes: Slot[];
}

export async function dayAvailability(
  repository: DataRepository,
  studio: StudioDetail,
  space: Space,
  date: string,
  durationMinutes: number,
  now: Date = new Date(),
): Promise<DayAvailability> {
  const context = await contextFor(repository, studio, space, date, now);

  return {
    date,
    openingLabel: openingHoursLabel(context, date),
    hours: hourCellsFrom(daySlots(context, date)),
    startTimes: startTimesFor(context, date, durationMinutes),
  };
}

/** The next `count` days, for the date rail on a listing page. */
export async function upcomingDays(
  repository: DataRepository,
  studio: StudioDetail,
  space: Space,
  fromDate: string,
  count: number,
  durationMinutes: number,
  now: Date = new Date(),
): Promise<Array<{ date: string; freeCount: number; isOpen: boolean }>> {
  const dates = Array.from({ length: count }, (_, index) =>
    addDaysToDateString(fromDate, index),
  );

  // One context load covers the whole rail rather than one per day.
  const context = await contextFor(repository, studio, space, fromDate, now, count + 1);

  return dates.map((date) => {
    const starts = startTimesFor(context, date, durationMinutes);
    return {
      date,
      isOpen: starts.length > 0,
      freeCount: starts.filter((slot) => slot.available).length,
    };
  });
}

async function contextFor(
  repository: DataRepository,
  studio: StudioDetail,
  space: Space,
  date: string,
  now: Date,
  spanDays = 1,
): Promise<AvailabilityContext> {
  const start = zonedToInstant(date, '00:00', studio.timezone);
  const from = new Date(start.getTime() - DAY_MS).toISOString();
  const to = new Date(start.getTime() + (spanDays + 1) * DAY_MS).toISOString();

  const [rules, blocked, bookings] = await Promise.all([
    repository.listAvailabilityRules([space.id]),
    repository.listBlockedTimes({ spaceIds: [space.id], from, to }),
    repository.listBookingsInRange({ spaceIds: [space.id], from, to }),
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

/** Grid slots → hour cells, collapsing sub-hour slots into their hour. */
export function hourCellsFrom(slots: Slot[]): HourCell[] {
  const byHour = new Map<number, HourState>();
  const rank: Record<HourState, number> = { free: 3, booked: 2, blocked: 1, closed: 0 };

  for (const slot of slots) {
    const hour = Number(slot.startTime.slice(0, 2));
    const state: HourState = slot.available
      ? 'free'
      : slot.reason === 'booked'
        ? 'booked'
        : slot.reason === 'blocked'
          ? 'blocked'
          : 'closed';

    const current = byHour.get(hour);
    if (!current || rank[state] > rank[current]) byHour.set(hour, state);
  }

  return [...byHour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, state]) => ({ hour, state }));
}
