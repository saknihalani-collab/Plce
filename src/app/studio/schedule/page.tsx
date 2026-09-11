import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AutoRefresh } from '@/features/studio/components/auto-refresh';
import { BookingDrawerPanel } from '@/features/studio/components/booking-drawer-panel';
import { ResourceCalendar } from '@/features/studio/components/resource-calendar';
import { ScheduleDatePicker, RememberView } from '@/features/studio/components/schedule-controls';
import { presentBooking, TONE_CHIP, TONE_DOT } from '@/features/studio/lib/booking-status';
import { requireStudioContext } from '@/features/studio/lib/context';
import { formatDate, formatDateRelative, formatMoney, pluralise } from '@/lib/format';
import {
  addDaysToDateString,
  instantToZoned,
  isValidDateString,
  monthGridOf,
  todayInZone,
  weekOf,
  zonedToInstant,
} from '@/lib/time';
import { cn } from '@/lib/utils';
import type { BookingDetail } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Schedule', robots: { index: false } };

type View = 'day' | 'week' | 'month';

const VIEW_COOKIE = 'plce_schedule_view';

type SearchParams = Promise<{
  view?: string;
  date?: string;
  space?: string;
  booking?: string;
}>;

/**
 * The Schedule — the primary operational screen of PL·CE Studio.
 *
 * Day view is the default because that is what running a studio looks
 * like: which room, what time, who, and is it settled. Week and month are
 * for planning, not for operating, so neither is ever the landing view.
 *
 * Every control is a link or a GET form, so the state of the screen —
 * this day, this view, this space, this booking open — lives in the URL.
 * It survives a refresh, it can be sent to a colleague, and the back
 * button undoes exactly one decision.
 */
export default async function SchedulePage({ searchParams }: { searchParams: SearchParams }) {
  const { repository, studio, organizationId } = await requireStudioContext('/studio/schedule');
  const params = await searchParams;

  const today = todayInZone(studio.timezone);
  const date = params.date && isValidDateString(params.date) ? params.date : today;

  // The view the owner last chose, unless this URL says otherwise.
  const remembered = (await cookies()).get(VIEW_COOKIE)?.value;
  const view = asView(params.view) ?? asView(remembered) ?? 'day';

  const activeSpaces = studio.spaces.filter((space) => space.isActive);
  const filtered = params.space
    ? activeSpaces.filter((space) => space.id === params.space)
    : activeSpaces;
  const spaces = filtered.length > 0 ? filtered : activeSpaces;

  const spaceIds = activeSpaces.map((space) => space.id);
  const range = rangeFor(view, date);
  const from = zonedToInstant(range.from, '00:00', studio.timezone).toISOString();
  const to = zonedToInstant(
    addDaysToDateString(range.to, 1),
    '00:00',
    studio.timezone,
  ).toISOString();

  const [bookings, blocked, rules] = await Promise.all([
    // Cancellations belong on the calendar — muted, but present. An owner
    // needs to see that the 3pm they remember is off, not just gone.
    repository.listBookingsInRange({
      spaceIds,
      from,
      to,
      statuses: ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'],
    }),
    repository.listBlockedTimes({ spaceIds, from, to }),
    repository.listAvailabilityRules(spaceIds),
  ]);

  const visible = params.space
    ? bookings.filter((booking) => booking.spaceId === params.space)
    : bookings;

  const dayBookings = visible.filter((booking) =>
    onDate(booking.startsAt, date, studio.timezone),
  );

  const base = (patch: Record<string, string | undefined>) =>
    hrefFor({ view, date, space: params.space, ...patch });

  return (
    <div className="max-w-6xl">
      {/* A booking can arrive from WhatsApp while this is open. */}
      <AutoRefresh />
      <RememberView view={view} cookieName={VIEW_COOKIE} />

      {/* ── Controls ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Schedule</p>
          <h1 className="display mt-2 text-3xl text-ink sm:text-4xl">{heading(view, date, today)}</h1>
          {view === 'day' ? (
            <p className="mt-1 text-sm text-ink-muted">{formatDate(date)}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Link
              href={base({ date: step(view, date, -1) })}
              aria-label="Previous"
              className="btn btn-secondary btn-icon"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <Link href={base({ date: today })} className="btn btn-secondary btn-sm">
              Today
            </Link>
            <Link
              href={base({ date: step(view, date, 1) })}
              aria-label="Next"
              className="btn btn-secondary btn-icon"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>

          <ScheduleDatePicker value={date} view={view} space={params.space} />

          <div className="flex items-center gap-0.5 rounded-[--radius-sm] border border-line p-0.5">
            {(['day', 'week', 'month'] as View[]).map((option) => (
              <Link
                key={option}
                href={hrefFor({ view: option, date, space: params.space })}
                aria-current={option === view ? 'page' : undefined}
                className={cn(
                  'rounded-[--radius-xs] px-3 py-1.5 text-sm capitalize transition-colors',
                  option === view
                    ? 'bg-stone text-ink'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {option}
              </Link>
            ))}
          </div>

          <Button asChild size="sm">
            <Link href={`/studio/bookings/new?date=${date}`}>
              <CalendarPlus className="size-4" />
              New booking
            </Link>
          </Button>
        </div>
      </div>

      {/* Space filter — only worth showing when there is a choice. */}
      {activeSpaces.length > 1 ? (
        <nav className="mt-5 flex flex-wrap gap-1.5" aria-label="Filter by space">
          <Link
            href={hrefFor({ view, date })}
            aria-current={params.space ? undefined : 'page'}
            className={chip(!params.space)}
          >
            All spaces
          </Link>
          {activeSpaces.map((space) => (
            <Link
              key={space.id}
              href={hrefFor({ view, date, space: space.id })}
              aria-current={params.space === space.id ? 'page' : undefined}
              className={chip(params.space === space.id)}
            >
              {space.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {/* ── Day summary ───────────────────────────────────────── */}
      {view === 'day' ? (
        <DaySummary bookings={dayBookings} timezone={studio.timezone} date={date} today={today} />
      ) : null}

      {/* ── The calendar ──────────────────────────────────────── */}
      <div className="mt-5">
        {view === 'day' ? (
          spaces.length === 0 ? (
            <NoSpaces />
          ) : (
            <ResourceCalendar
              day={{
                date,
                timezone: studio.timezone,
                spaces,
                bookings: dayBookings,
                blocked: blocked.filter((block) =>
                  onDate(block.startsAt, date, studio.timezone),
                ),
                rules,
                newBookingHref: (spaceId, startTime, endTime) =>
                  `/studio/bookings/new?date=${date}&space=${spaceId}&start=${startTime}&end=${endTime}`,
                bookingHref: (bookingId) => base({ booking: bookingId }),
              }}
            />
          )
        ) : null}

        {view === 'week' ? (
          <WeekView
            date={date}
            today={today}
            timezone={studio.timezone}
            bookings={visible}
            hrefFor={(bookingId) => base({ booking: bookingId })}
            dayHref={(day) => hrefFor({ view: 'day', date: day, space: params.space })}
          />
        ) : null}

        {view === 'month' ? (
          <MonthView
            date={date}
            today={today}
            timezone={studio.timezone}
            bookings={visible}
            dayHref={(day) => hrefFor({ view: 'day', date: day, space: params.space })}
          />
        ) : null}
      </div>

      <p className="mt-6 text-xs text-ink-soft">
        Every booking here came through the same engine — PL·CE, WhatsApp, or typed in by
        hand. Click an empty hour to book it.
      </p>

      {/* ── Drawer ────────────────────────────────────────────── */}
      {params.booking ? (
        <BookingDrawerPanel
          bookingId={params.booking}
          organizationId={organizationId}
          closeHref={base({ booking: undefined })}
        />
      ) : null}
    </div>
  );
}

/* ── Day summary ────────────────────────────────────────────────── */

/**
 * The four questions an owner asks before they have finished sitting
 * down: how busy, how much, what is next, and what needs chasing.
 */
function DaySummary({
  bookings,
  timezone,
  date,
  today,
}: {
  bookings: BookingDetail[];
  timezone: string;
  date: string;
  today: string;
}) {
  const live = bookings.filter(
    (booking) => booking.status !== 'cancelled' && booking.status !== 'no_show',
  );
  const revenue = live.reduce((total, booking) => total + booking.priceAmount, 0);
  const attention = live.filter((booking) => presentBooking(booking).needsAttention);

  const now = new Date().toISOString();
  const next = [...live]
    .filter((booking) => booking.startsAt >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  if (live.length === 0) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-line py-3 text-sm">
      <span className="text-ink">{pluralise(live.length, 'booking')}</span>
      <span className="tabular text-ink-muted">{formatMoney(revenue)}</span>

      {next ? (
        <span className="text-ink-muted">
          Next{' '}
          <span className="tabular text-ink">
            {instantToZoned(next.startsAt, timezone).time}
          </span>{' '}
          · {next.customerName}
          {date !== today ? '' : ''}
        </span>
      ) : (
        <span className="text-ink-soft">Nothing left today</span>
      )}

      {attention.length > 0 ? (
        <span className="flex items-center gap-1.5 text-alert-ink">
          <span aria-hidden className="size-1.5 rounded-full bg-alert" />
          {attention.length} need{attention.length === 1 ? 's' : ''} attention
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-olive-ink">
          <span aria-hidden className="size-1.5 rounded-full bg-olive" />
          All settled
        </span>
      )}
    </div>
  );
}

/* ── Week ───────────────────────────────────────────────────────── */

function WeekView({
  date,
  today,
  timezone,
  bookings,
  hrefFor: bookingHref,
  dayHref,
}: {
  date: string;
  today: string;
  timezone: string;
  bookings: BookingDetail[];
  hrefFor: (bookingId: string) => string;
  dayHref: (day: string) => string;
}) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div className="grid min-w-[900px] grid-cols-7 gap-2">
        {weekOf(date).map((day) => {
          const rows = bookings
            .filter((booking) => onDate(booking.startsAt, day, timezone))
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

          const live = rows.filter(
            (booking) => booking.status !== 'cancelled' && booking.status !== 'no_show',
          );
          const revenue = live.reduce((total, booking) => total + booking.priceAmount, 0);

          return (
            <div
              key={day}
              className={cn(
                'card flex min-h-[17rem] flex-col p-3',
                day === today ? 'border-clay/50' : '',
              )}
            >
              <Link href={dayHref(day)} className="block hover:opacity-80">
                <p className="text-xs uppercase tracking-wider text-ink-soft">
                  {new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    timeZone: 'UTC',
                  })}
                </p>
                <p
                  className={cn(
                    'tabular text-lg',
                    day === today ? 'text-clay-ink' : 'text-ink',
                  )}
                >
                  {Number(day.slice(8))}
                </p>
              </Link>

              <ul className="mt-3 flex-1 space-y-1.5">
                {rows.slice(0, 5).map((booking) => {
                  const presentation = presentBooking(booking);
                  return (
                    <li key={booking.id}>
                      <Link
                        href={bookingHref(booking.id)}
                        scroll={false}
                        title={`${booking.customerName} · ${presentation.summary}`}
                        className={cn(
                          'block rounded-[--radius-xs] border border-l-2 border-line px-2 py-1 transition-colors',
                          TONE_CHIP[presentation.tone],
                        )}
                      >
                        <span className="tabular block text-[0.625rem] text-ink-muted">
                          {instantToZoned(booking.startsAt, timezone).time}
                        </span>
                        <span
                          className={cn(
                            'block truncate text-xs',
                            booking.status === 'cancelled' ? 'line-through' : '',
                          )}
                        >
                          {booking.customerName}
                        </span>
                        <span className="block truncate text-[0.625rem] text-ink-soft">
                          {booking.spaceName}
                        </span>
                      </Link>
                    </li>
                  );
                })}

                {rows.length > 5 ? (
                  <li>
                    <Link
                      href={dayHref(day)}
                      className="block text-[0.625rem] text-ink-soft hover:text-clay-ink"
                    >
                      +{rows.length - 5} more
                    </Link>
                  </li>
                ) : null}

                {rows.length === 0 ? (
                  <li className="text-[0.6875rem] text-ink-soft">Free</li>
                ) : null}
              </ul>

              {revenue > 0 ? (
                <p className="tabular mt-3 border-t border-line-soft pt-2 text-xs text-ink-muted">
                  {formatMoney(revenue)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Month ──────────────────────────────────────────────────────── */

function MonthView({
  date,
  today,
  timezone,
  bookings,
  dayHref,
}: {
  date: string;
  today: string;
  timezone: string;
  bookings: BookingDetail[];
  dayHref: (day: string) => string;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
          <div key={label} className="eyebrow px-3 py-2.5">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {monthGridOf(date).map((day) => {
          const rows = bookings.filter((booking) =>
            onDate(booking.startsAt, day, timezone),
          );
          const live = rows.filter(
            (booking) => booking.status !== 'cancelled' && booking.status !== 'no_show',
          );
          const attention = live.filter(
            (booking) => presentBooking(booking).needsAttention,
          ).length;
          const revenue = live.reduce((total, booking) => total + booking.priceAmount, 0);
          const inMonth = day.slice(0, 7) === date.slice(0, 7);

          return (
            <Link
              key={day}
              href={dayHref(day)}
              className={cn(
                'min-h-[6.5rem] border-b border-r border-line-soft p-2 transition-colors hover:bg-stone',
                inMonth ? '' : 'opacity-40',
                day === today ? 'bg-clay/10' : '',
              )}
            >
              <span
                className={cn(
                  'tabular text-sm',
                  day === today ? 'text-clay-ink' : 'text-ink-muted',
                )}
              >
                {Number(day.slice(8))}
              </span>

              {live.length > 0 ? (
                <>
                  <span className="mt-1.5 flex items-center gap-1.5 text-xs text-ink">
                    <span
                      aria-hidden
                      className={cn(
                        'size-1.5 rounded-full',
                        attention > 0 ? TONE_DOT.attention : TONE_DOT.settled,
                      )}
                    />
                    {live.length}
                  </span>
                  <span className="tabular block text-[0.625rem] text-ink-soft">
                    {formatMoney(revenue)}
                  </span>
                </>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Bits ───────────────────────────────────────────────────────── */

function NoSpaces() {
  return (
    <div className="rounded-[--radius] border border-dashed border-line px-6 py-14 text-center">
      <p className="display text-xl text-ink">No bookable spaces yet</p>
      <p className="mt-2 text-sm text-ink-muted">
        Add a room people can book by the hour and it will appear here.
      </p>
      <Button asChild className="mt-5" size="sm">
        <Link href="/studio/spaces">Add a space</Link>
      </Button>
    </div>
  );
}

function chip(active: boolean): string {
  return cn(
    'rounded-full border px-3 py-1.5 text-sm transition-colors',
    active
      ? 'border-clay bg-clay/15 text-clay-ink'
      : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
  );
}

function hrefFor(state: {
  view: View;
  date: string;
  space?: string;
  booking?: string;
}): string {
  const params = new URLSearchParams({ view: state.view, date: state.date });
  if (state.space) params.set('space', state.space);
  if (state.booking) params.set('booking', state.booking);
  return `/studio/schedule?${params.toString()}`;
}

function asView(value: string | undefined): View | null {
  return value === 'day' || value === 'week' || value === 'month' ? value : null;
}

function heading(view: View, date: string, today: string): string {
  if (view === 'day') return formatDateRelative(date, today);
  if (view === 'week') return `Week of ${formatDate(weekOf(date)[0]!, { year: false })}`;
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function rangeFor(view: View, date: string): { from: string; to: string } {
  if (view === 'day') return { from: date, to: date };
  if (view === 'week') {
    const week = weekOf(date);
    return { from: week[0]!, to: week[6]! };
  }
  const grid = monthGridOf(date);
  return { from: grid[0]!, to: grid[grid.length - 1]! };
}

function step(view: View, date: string, direction: 1 | -1): string {
  if (view === 'day') return addDaysToDateString(date, direction);
  if (view === 'week') return addDaysToDateString(date, 7 * direction);

  const [year, month] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1 + direction, 1)).toISOString().slice(0, 10);
}

function onDate(instant: string, date: string, timezone: string): boolean {
  return (
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(instant)) === date
  );
}
