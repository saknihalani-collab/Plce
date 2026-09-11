'use client';

import { useEffect, useState } from 'react';

/**
 * The "you are here" line.
 *
 * A studio calendar is read while standing in the studio, and the single
 * most useful thing on it is where *now* falls between the bookings. It
 * updates every half-minute, which is enough to feel live and cheap
 * enough to ignore.
 *
 * The position is computed on the client because it depends on the
 * current instant — rendering it on the server would bake in the moment
 * the page was built and quietly drift for the rest of the day.
 */
export function CurrentTimeLine({
  date,
  timezone,
  openMinutes,
  closeMinutes,
}: {
  /** The local day this column represents, 'YYYY-MM-DD'. */
  date: string;
  timezone: string;
  openMinutes: number;
  closeMinutes: number;
}) {
  const [now, setNow] = useState<{ date: string; minutes: number } | null>(null);

  useEffect(() => {
    const read = () => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date());

      const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
      setNow({
        date: `${get('year')}-${get('month')}-${get('day')}`,
        minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
      });
    };

    read();
    const timer = window.setInterval(read, 30_000);
    return () => window.clearInterval(timer);
  }, [timezone]);

  // Only ever drawn on the day it belongs to, and only inside opening
  // hours — a line pinned to the top of tomorrow would be a lie.
  if (!now || now.date !== date) return null;
  if (now.minutes < openMinutes || now.minutes > closeMinutes) return null;

  const span = closeMinutes - openMinutes;
  const top = ((now.minutes - openMinutes) / span) * 100;

  const label = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date());

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
      style={{ top: `${top}%` }}
      aria-hidden
    >
      <span className="tabular -ml-[3.25rem] w-[3rem] shrink-0 text-right text-[0.625rem] font-medium text-clay-ink">
        {label}
      </span>
      <span className="ml-1 size-1.5 shrink-0 rounded-full bg-clay" />
      <span className="h-px flex-1 bg-clay/70" />
    </div>
  );
}
