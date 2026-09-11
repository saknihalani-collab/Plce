import Link from 'next/link';

import { HourStrip } from '@/components/brand/hour-strip';
import { Button } from '@/components/ui/button';
import type { DayAvailability } from '@/features/booking/lib/day-availability';
import { priceFor } from '@/lib/booking/availability';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Space, StudioDetail } from '@/types/domain';

/**
 * The booking panel.
 *
 * Every control is a link or a GET form, so the state of a half-made
 * booking — this space, this date, three hours — lives in the URL. Send
 * someone the link and they see the same slots you did, and the back
 * button undoes exactly one decision.
 */
export function BookingPanel({
  studio,
  space,
  availability,
  days,
  durationMinutes,
  date,
}: {
  studio: StudioDetail;
  space: Space;
  availability: DayAvailability;
  days: Array<{ date: string; freeCount: number; isOpen: boolean }>;
  durationMinutes: number;
  date: string;
}) {
  const base = `/studios/${studio.slug}`;
  const href = (patch: Record<string, string | number>) => {
    const params = new URLSearchParams({
      space: space.id,
      date,
      duration: String(durationMinutes),
    });
    for (const [key, value] of Object.entries(patch)) params.set(key, String(value));
    return `${base}?${params.toString()}#book`;
  };

  const durations = durationOptions(space.minBookingMinutes);
  const available = availability.startTimes.filter((slot) => slot.available);

  return (
    <div className="card p-5" id="book">
      {/* Space */}
      {studio.spaces.length > 1 ? (
        <div className="mb-5">
          <p className="eyebrow mb-2">Space</p>
          <div className="flex flex-wrap gap-1.5">
            {studio.spaces.map((option) => (
              <Link
                key={option.id}
                href={href({ space: option.id })}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition-colors',
                  option.id === space.id
                    ? 'border-clay bg-clay-soft text-clay-hover'
                    : 'border-line-strong bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {option.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between">
        <p className="text-sm text-ink-muted">
          <span className="text-lg font-medium text-ink">{formatMoney(space.hourlyRate)}</span> /hr
        </p>
        <p className="text-xs text-ink-subtle">
          Up to {space.capacity} · {space.sizeSqft ? `${space.sizeSqft} sq ft` : 'flexible'}
        </p>
      </div>

      {/* Duration */}
      <div className="mt-5">
        <p className="eyebrow mb-2">How long</p>
        <div className="flex flex-wrap gap-1.5">
          {durations.map((minutes) => (
            <Link
              key={minutes}
              href={href({ duration: minutes })}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                minutes === durationMinutes
                  ? 'border-clay bg-clay-soft text-clay-hover'
                  : 'border-line-strong bg-surface text-ink-muted hover:text-ink',
              )}
            >
              {minutes / 60} hr
            </Link>
          ))}
        </div>
      </div>

      {/* Date rail */}
      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="eyebrow">Day</p>
          {availability.openingLabel ? (
            <span className="tabular text-ink-subtle">Open {availability.openingLabel}</span>
          ) : (
            <span className="text-xs text-ink-subtle">Closed</span>
          )}
        </div>

        <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
          {days.map((day) => (
            <Link
              key={day.date}
              href={href({ date: day.date })}
              className={cn(
                'flex min-w-[3.25rem] shrink-0 flex-col items-center rounded-[--radius-sm] border px-2 py-2 transition-colors',
                day.date === date
                  ? 'border-clay bg-clay-soft'
                  : day.freeCount === 0
                    ? 'border-line-soft bg-surface-sunken text-ink-subtle'
                    : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <span className="text-[0.625rem] uppercase tracking-wider text-ink-subtle">
                {new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  timeZone: 'UTC',
                })}
              </span>
              <span
                className={cn(
                  'tabular mt-0.5 text-base',
                  day.date === date ? 'text-clay-hover' : 'text-ink',
                )}
              >
                {Number(day.date.slice(8))}
              </span>
              <span className="mt-1 text-[0.625rem] text-ink-subtle">
                {day.isOpen ? (day.freeCount > 0 ? `${day.freeCount} free` : 'full') : '—'}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Hours */}
      <div className="mt-4">
        <HourStrip cells={availability.hours} size="band" showScale />
      </div>

      {/* Start times */}
      <div className="mt-5">
        <p className="eyebrow mb-2">Start at</p>
        {available.length === 0 ? (
          <p className="rounded-[--radius-sm] border border-dashed border-line px-3 py-4 text-center text-sm text-ink-muted">
            {availability.openingLabel
              ? `Nothing ${durationMinutes / 60} hours long is free on ${formatDate(date, { year: false })}. Try a shorter booking or another day.`
              : `${space.name} is closed on ${formatDate(date, { year: false })}.`}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {available.map((slot) => (
              <Link
                key={slot.startTime}
                href={`/studios/${studio.slug}/book?space=${space.id}&date=${date}&start=${slot.startTime}&duration=${durationMinutes}`}
                className="tabular rounded-[--radius-xs] border border-line-strong bg-surface py-2 text-center text-ink transition-colors hover:border-clay hover:bg-clay-soft hover:text-clay-hover"
              >
                {slot.startTime}
              </Link>
            ))}
          </div>
        )}
      </div>

      {available.length > 0 ? (
        <>
          <div className="mt-5 flex items-baseline justify-between border-t border-line-soft pt-4 text-sm">
            <span className="text-ink-muted">
              {durationMinutes / 60} hours in {space.name}
            </span>
            <span className="font-medium text-ink">
              {formatMoney(
                priceFor(
                  space,
                  available[0]!.startsAt,
                  new Date(Date.parse(available[0]!.startsAt) + durationMinutes * 60_000).toISOString(),
                ),
              )}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-subtle">
            Pick a start time above. You confirm details on the next screen — nothing is
            booked yet.
          </p>
        </>
      ) : (
        <Button asChild variant="secondary" full className="mt-5">
          <Link href={href({ date: nextOpenDate(days, date) ?? date })}>
            Show the next open day
          </Link>
        </Button>
      )}

      <p className="mt-4 border-t border-line-soft pt-4 text-xs leading-relaxed text-ink-subtle">
        {studio.cancellationPolicy}
      </p>
    </div>
  );
}

/** Whole-hour options from the space's own minimum up to a full day. */
function durationOptions(minBookingMinutes: number): number[] {
  const minimum = Math.max(60, Math.ceil(minBookingMinutes / 60) * 60);
  const options: number[] = [];
  for (let minutes = minimum; minutes <= Math.max(minimum + 60, 480); minutes += 60) {
    options.push(minutes);
    if (options.length >= 6) break;
  }
  return options;
}

function nextOpenDate(
  days: Array<{ date: string; freeCount: number }>,
  current: string,
): string | null {
  return days.find((day) => day.date > current && day.freeCount > 0)?.date ?? null;
}
