import Link from 'next/link';

import { CurrentTimeLine } from '@/features/studio/components/current-time-line';
import { presentBooking, TONE_CHIP, TONE_DOT } from '@/features/studio/lib/booking-status';
import { formatMoney } from '@/lib/format';
import { formatTimeLabel, instantToZoned, minutesToTime, timeToMinutes } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { AvailabilityRule, BlockedTime, BookingDetail, Space } from '@/types/domain';

/**
 * The resource calendar — the screen an owner actually runs the studio from.
 *
 * One column per space, one row per hour. A studio owner's mental model of
 * the day is "which room, what time", and every other layout makes them do
 * that translation in their head.
 *
 * Three things are readable without clicking anything:
 *   • what is booked, and in which room
 *   • whether each booking is settled, owed for, or unconfirmed (colour)
 *   • where the gaps are — because empty space is the thing being sold
 *
 * Blocks are positioned by percentage within the day's open window, so a
 * studio open 07:00–23:00 and one open 10:00–18:00 both fill the same
 * height without a scrollbar or a fixed pixel grid.
 */

export interface CalendarDay {
  date: string;
  timezone: string;
  spaces: Space[];
  bookings: BookingDetail[];
  blocked: BlockedTime[];
  rules: AvailabilityRule[];
  /** Where a click on empty time goes. */
  newBookingHref: (spaceId: string, startTime: string, endTime: string) => string;
  /** Where a click on a booking goes — the drawer, not another page. */
  bookingHref: (bookingId: string) => string;
}

const FALLBACK_WINDOW = { open: 8 * 60, close: 22 * 60 };
const ROW_HEIGHT_REM = 3.5;

export function ResourceCalendar({ day }: { day: CalendarDay }) {
  const window = dayWindow(day);
  const span = window.close - window.open;
  const height = `${(span / 60) * ROW_HEIGHT_REM}rem`;

  const hours: number[] = [];
  for (let minutes = window.open; minutes <= window.close; minutes += 60) hours.push(minutes);

  // With a single room the column heading is noise — the studio name is
  // already at the top of the page, and there is nothing to compare it to.
  const single = day.spaces.length === 1;

  return (
    <div className="card overflow-hidden">
      <div className="scrollbar-thin overflow-x-auto">
        <div className={cn(single ? 'min-w-0' : 'min-w-[640px]')}>
          {/* Space headings */}
          {single ? null : (
            <div
              className="grid border-b border-line"
              style={{ gridTemplateColumns: columns(day.spaces.length) }}
            >
              <div className="px-2 py-3" />
              {day.spaces.map((space) => (
                <div key={space.id} className="border-l border-line px-3 py-3">
                  <p className="truncate text-sm font-medium text-ink">{space.name}</p>
                  <p className="tabular text-xs text-ink-soft">
                    {formatMoney(space.hourlyRate)}/hr · up to {space.capacity}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="grid" style={{ gridTemplateColumns: columns(day.spaces.length) }}>
            {/* Hour gutter */}
            <div className="relative" style={{ height }}>
              {hours.map((minutes) => (
                <div
                  key={minutes}
                  className="tabular absolute -translate-y-1/2 pr-2 text-right text-[0.6875rem] text-ink-soft"
                  style={{
                    top: `${((minutes - window.open) / span) * 100}%`,
                    width: '3.5rem',
                  }}
                >
                  {formatTimeLabel(minutesToTime(minutes))}
                </div>
              ))}
            </div>

            {day.spaces.map((space) => {
              const closed = isClosed(day, space.id);
              const spaceBookings = day.bookings.filter(
                (booking) => booking.spaceId === space.id,
              );

              return (
                <div
                  key={space.id}
                  className="relative border-l border-line"
                  style={{ height }}
                >
                  {hours.slice(0, -1).map((minutes) => (
                    <div
                      key={minutes}
                      className="absolute inset-x-0 border-t border-line-soft"
                      style={{ top: `${((minutes - window.open) / span) * 100}%` }}
                    />
                  ))}

                  {closed ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-stone-deep/60">
                      <span className="text-xs text-ink-soft">Closed</span>
                    </div>
                  ) : (
                    <>
                      {/*
                        Empty hours are clickable, and they sit *under*
                        the bookings so a click only ever lands on free
                        time. This is the fastest path to a booking in
                        the product: click the gap you are looking at.
                      */}
                      {hours.slice(0, -1).map((minutes) => {
                        const startTime = minutesToTime(minutes);
                        const endTime = minutesToTime(
                          Math.min(minutes + 60, window.close),
                        );

                        return (
                          <Link
                            key={`slot-${minutes}`}
                            href={day.newBookingHref(space.id, startTime, endTime)}
                            aria-label={`Book ${space.name} at ${formatTimeLabel(startTime)}`}
                            title={`Book ${space.name} · ${formatTimeLabel(startTime)}`}
                            className="group absolute inset-x-0 z-0 flex items-center justify-center transition-colors hover:bg-clay/10"
                            style={{
                              top: `${((minutes - window.open) / span) * 100}%`,
                              height: `${(60 / span) * 100}%`,
                            }}
                          >
                            <span className="text-xs text-clay-ink opacity-0 transition-opacity group-hover:opacity-100">
                              + Book
                            </span>
                          </Link>
                        );
                      })}

                      <ClosedEdges day={day} spaceId={space.id} window={window} />

                      {day.blocked
                        .filter((block) => block.spaceId === space.id)
                        .map((block) => {
                          const position = place(
                            block.startsAt,
                            block.endsAt,
                            day.timezone,
                            window,
                          );
                          if (!position) return null;

                          return (
                            <div
                              key={block.id}
                              className="absolute inset-x-1 z-10 overflow-hidden rounded-[--radius-xs] border border-line bg-[repeating-linear-gradient(-45deg,var(--line-strong)_0_3px,transparent_3px_7px)] px-2 py-1"
                              style={position}
                              title={block.reason ?? 'Blocked'}
                            >
                              <p className="truncate text-[0.6875rem] text-ink-muted">
                                {block.reason ?? 'Blocked'}
                              </p>
                            </div>
                          );
                        })}

                      {spaceBookings.map((booking) => (
                        <BookingChip
                          key={booking.id}
                          booking={booking}
                          timezone={day.timezone}
                          window={window}
                          href={day.bookingHref(booking.id)}
                        />
                      ))}

                      {spaceBookings.length === 0 && day.spaces.length > 1 ? (
                        <p className="pointer-events-none absolute inset-x-0 top-1/2 z-0 -translate-y-1/2 text-center text-xs text-ink-soft">
                          Nothing scheduled
                        </p>
                      ) : null}
                    </>
                  )}

                  <CurrentTimeLine
                    date={day.date}
                    timezone={day.timezone}
                    openMinutes={window.open}
                    closeMinutes={window.close}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One booking on the grid.
 *
 * Short bookings get less inside them rather than a squashed version of
 * the same thing — an hour-tall chip that tries to show three lines is
 * unreadable, and the tooltip carries the rest.
 */
function BookingChip({
  booking,
  timezone,
  window,
  href,
}: {
  booking: BookingDetail;
  timezone: string;
  window: { open: number; close: number };
  href: string;
}) {
  const position = place(booking.startsAt, booking.endsAt, timezone, window);
  if (!position) return null;

  const start = instantToZoned(booking.startsAt, timezone);
  const end = instantToZoned(booking.endsAt, timezone);
  const presentation = presentBooking(booking);

  const minutes =
    (Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 60_000;
  const roomy = minutes >= 90;

  return (
    <Link
      href={href}
      scroll={false}
      style={position}
      title={`${booking.customerName} · ${start.time}–${end.time} · ${presentation.summary}`}
      className={cn(
        'absolute inset-x-1 z-10 overflow-hidden rounded-[--radius-xs] border border-l-2 border-line px-2 py-1 transition-colors',
        TONE_CHIP[presentation.tone],
        booking.status === 'cancelled' ? 'opacity-60' : '',
      )}
    >
      <p className="tabular truncate text-[0.6875rem] text-ink-muted">
        {start.time}–{end.time}
      </p>
      <p
        className={cn(
          'truncate text-xs font-medium',
          booking.status === 'cancelled' ? 'text-ink-muted line-through' : 'text-ink',
        )}
      >
        {booking.customerName}
      </p>

      {roomy ? (
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[0.6875rem] text-ink-muted">
          <span
            aria-hidden
            className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[presentation.tone])}
          />
          {presentation.tone === 'settled'
            ? presentation.paymentLabel
            : presentation.tone === 'muted'
              ? presentation.statusLabel
              : presentation.tone === 'waiting'
                ? 'Pending'
                : presentation.paymentLabel}
        </p>
      ) : null}
    </Link>
  );
}

/**
 * Shades the hours before opening and after closing.
 *
 * A space that opens later than the studio's earliest room should look
 * shut, not merely empty — otherwise the first thing an owner does is
 * book something into a closed hour.
 */
function ClosedEdges({
  day,
  spaceId,
  window,
}: {
  day: CalendarDay;
  spaceId: string;
  window: { open: number; close: number };
}) {
  const rule = ruleFor(day, spaceId);
  if (!rule) return null;

  const opens = timeToMinutes(rule.opensAt) ?? window.open;
  const closes = timeToMinutes(rule.closesAt) ?? window.close;
  const span = window.close - window.open;

  return (
    <>
      {opens > window.open ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[5] bg-stone-deep/60"
          style={{ height: `${((opens - window.open) / span) * 100}%` }}
        />
      ) : null}
      {closes < window.close ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-stone-deep/60"
          style={{ height: `${((window.close - closes) / span) * 100}%` }}
        />
      ) : null}
    </>
  );
}

function columns(spaceCount: number): string {
  return `3.5rem repeat(${spaceCount}, minmax(0, 1fr))`;
}

function ruleFor(day: CalendarDay, spaceId: string): AvailabilityRule | undefined {
  const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
  return day.rules.find((rule) => rule.spaceId === spaceId && rule.weekday === weekday);
}

function isClosed(day: CalendarDay, spaceId: string): boolean {
  const rule = ruleFor(day, spaceId);
  return !rule || rule.isClosed;
}

/** The open window across every space, so all columns share one scale. */
function dayWindow(day: CalendarDay): { open: number; close: number } {
  const opens: number[] = [];
  const closes: number[] = [];

  for (const space of day.spaces) {
    const rule = ruleFor(day, space.id);
    if (!rule || rule.isClosed) continue;
    const open = timeToMinutes(rule.opensAt);
    const close = rule.closesAt === '24:00' ? 1440 : timeToMinutes(rule.closesAt);
    if (open != null) opens.push(open);
    if (close != null) closes.push(close);
  }

  if (opens.length === 0 || closes.length === 0) return FALLBACK_WINDOW;

  // Bookings that run outside opening hours — moved by hand, or made
  // before the hours changed — still have to be visible.
  for (const booking of day.bookings) {
    opens.push(instantToZoned(booking.startsAt, day.timezone).minutes);
    closes.push(instantToZoned(booking.endsAt, day.timezone).minutes || 1440);
  }

  return {
    open: Math.max(0, Math.floor(Math.min(...opens) / 60) * 60),
    close: Math.min(1440, Math.ceil(Math.max(...closes) / 60) * 60),
  };
}

function place(
  startsAt: string,
  endsAt: string,
  timezone: string,
  window: { open: number; close: number },
): { top: string; height: string } | null {
  const start = instantToZoned(startsAt, timezone).minutes;
  const endZoned = instantToZoned(endsAt, timezone);
  // Midnight comes back as 0; as an end time that means the end of the
  // day, not the start of it.
  const end = endZoned.minutes === 0 ? 1440 : endZoned.minutes;

  const span = window.close - window.open;
  const top = ((start - window.open) / span) * 100;
  const height = ((end - start) / span) * 100;

  if (top > 100 || top + height < 0) return null;

  return {
    top: `${Math.max(0, top)}%`,
    height: `${Math.max(2.2, Math.min(100 - Math.max(0, top), height))}%`,
  };
}
