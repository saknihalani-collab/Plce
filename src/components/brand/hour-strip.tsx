import { cn } from '@/lib/utils';

/**
 * The hour strip — PL·CE's signature device.
 *
 * A row of cells, one per bookable hour of a day, each coloured by what
 * is in it. It appears at three scales and always means the same thing:
 *
 *   sliver   on a discovery card — "free from 6"
 *   band     on a listing page — the day at a glance
 *   grid     in the CRM — the resource calendar is this device, full size
 *
 * It is not decoration. Every cell is a real availability answer from
 * `lib/booking/availability`, which is why the marketplace and the
 * owner's calendar cannot disagree about whether Saturday is free.
 */

export type HourState = 'free' | 'booked' | 'blocked' | 'closed';

export interface HourCell {
  /** Local hour, 0–23. */
  hour: number;
  state: HourState;
  label?: string;
}

const STATE_WORDS: Record<HourState, string> = {
  free: 'free',
  booked: 'booked',
  blocked: 'blocked off',
  closed: 'closed',
};

export function HourStrip({
  cells,
  className,
  size = 'sliver',
  showScale = false,
}: {
  cells: HourCell[];
  className?: string;
  size?: 'sliver' | 'band';
  showScale?: boolean;
}) {
  if (cells.length === 0) return null;

  const first = cells[0]!;
  const last = cells[cells.length - 1]!;
  const freeCount = cells.filter((cell) => cell.state === 'free').length;

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn('hour-strip', size === 'sliver' ? 'h-1.5' : 'h-8')}
        role="img"
        aria-label={
          freeCount === 0
            ? `Fully booked between ${hourLabel(first.hour)} and ${hourLabel(last.hour + 1)}`
            : `${freeCount} of ${cells.length} hours free between ${hourLabel(first.hour)} and ${hourLabel(last.hour + 1)}`
        }
      >
        {cells.map((cell) => (
          <div
            key={cell.hour}
            data-state={cell.state}
            className="hour-cell"
            title={`${hourLabel(cell.hour)} — ${cell.label ?? STATE_WORDS[cell.state]}`}
          />
        ))}
      </div>

      {showScale ? (
        <div className="tabular mt-1.5 flex justify-between text-[0.6875rem] text-ink-subtle">
          <span>{hourLabel(first.hour)}</span>
          <span>{hourLabel(last.hour + 1)}</span>
        </div>
      ) : null}
    </div>
  );
}

/** '9 AM', '6 PM' — the same short form the rest of the product uses. */
function hourLabel(hour: number): string {
  const normalised = ((hour % 24) + 24) % 24;
  const suffix = normalised >= 12 ? 'PM' : 'AM';
  const twelve = normalised % 12 === 0 ? 12 : normalised % 12;
  return `${twelve} ${suffix}`;
}

/**
 * A one-line summary of the same data, for places where the strip needs
 * words next to it: "Free from 6 PM", "3 hours free today", "Closed".
 *
 * `day` names the day the cells describe, so the landing page can roll
 * its availability band forward to tomorrow without the sentence
 * underneath it still claiming to be about today.
 */
export function availabilitySummary(cells: HourCell[], day: string = 'today'): string {
  if (cells.length === 0) return 'Hours not set';
  if (cells.every((cell) => cell.state === 'closed')) return `Closed ${day}`;

  const free = cells.filter((cell) => cell.state === 'free');
  if (free.length === 0) return `Fully booked ${day}`;

  // A single unbroken run reads better as "free from X" than as a count.
  const firstFree = free[0]!;
  const isUnbroken = free.every(
    (cell, index) => index === 0 || cell.hour === free[index - 1]!.hour + 1,
  );
  const runsToClose = isUnbroken && free[free.length - 1]!.hour === cells[cells.length - 1]!.hour;

  if (runsToClose) return `Free from ${hourLabel(firstFree.hour)}`;
  return `${free.length} ${free.length === 1 ? 'hour' : 'hours'} free ${day}`;
}
