import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarPlus, Ban, UserPlus, Clock3 } from 'lucide-react';

import { HourStrip } from '@/components/brand/hour-strip';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { AutoRefresh } from '@/features/studio/components/auto-refresh';
import {
  presentBooking,
  TONE_DOT,
  TONE_TEXT,
} from '@/features/studio/lib/booking-status';
import { requireStudioContext } from '@/features/studio/lib/context';
import { todayHourCells } from '@/features/discovery/lib/hour-cells';
import {
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  formatRelativeTime,
  pluralise,
} from '@/lib/format';
import { instantToZoned, todayInZone, zonedToInstant } from '@/lib/time';
import { cn } from '@/lib/utils';
import { BOOKING_SOURCE_LABELS } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Today', robots: { index: false } };

export default async function StudioDashboardPage() {
  const { repository, studio, organizationId } = await requireStudioContext();

  const now = new Date();
  const today = todayInZone(studio.timezone, now);
  const dayStart = zonedToInstant(today, '00:00', studio.timezone).toISOString();
  const dayEnd = new Date(Date.parse(dayStart) + 86_400_000).toISOString();

  const [stats, todayBookings, upcoming, customers, hours] = await Promise.all([
    repository.getStudioStats(organizationId, now),
    repository.listBookings(organizationId, {
      filters: { from: dayStart, to: dayEnd },
      pageSize: 20,
    }),
    repository.listBookings(organizationId, {
      filters: { from: dayEnd, status: ['pending', 'confirmed'] },
      pageSize: 6,
    }),
    repository.listCustomers(organizationId, { pageSize: 5 }),
    todayHourCells(repository, [{ id: studio.id, timezone: studio.timezone }], now),
  ]);

  // Both lists read chronologically. `listBookings` returns newest
  // first, which is right for a ledger and wrong for a day plan.
  const sortedToday = [...todayBookings.items].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const nextUp = [...upcoming.items].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const cells = hours.get(studio.id) ?? [];

  return (
    <div className="max-w-5xl">
      {/* A WhatsApp booking must land here without a reload. */}
      <AutoRefresh />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: studio.timezone,
            })}
          </p>
          <h1 className="display mt-3 text-4xl text-ink">Today at {studio.name}</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/studio/bookings/new">
              <CalendarPlus className="size-4" />
              Add booking
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link href="/studio/availability#block">
              <Ban className="size-4" />
              Block time
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link href="/studio/customers/new">
              <UserPlus className="size-4" />
              Add customer
            </Link>
          </Button>
        </div>
      </div>

      {/* The day, at a glance — the signature device at band scale. */}
      {cells.length > 0 ? (
        <div className="mt-10 border-t border-ink pt-4">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow">The floor today</p>
            <p className="text-xs text-ink-soft">
              Across {pluralise(studio.spaces.length, 'space')}
            </p>
          </div>
          <div className="mt-4">
            {/* An all-closed strip is fifteen empty boxes, which says
                less than one sentence does. */}
            {cells.every((cell) => cell.state === 'closed') ? (
              <p className="py-2 text-sm text-ink-muted">
                Today&rsquo;s hours have gone. The floor reopens in the morning.
              </p>
            ) : (
              <HourStrip cells={cells} size="band" showScale />
            )}
          </div>
        </div>
      ) : null}

      {/*
        The numbers, as a table rather than as eight boxes.

        Boxing each figure gives all eight the same weight and turns the
        top of the screen into a wall of identical tiles. Ruled columns
        let the figures themselves carry the hierarchy, and leave the
        only coloured number on the page — money someone still owes —
        actually meaning something.
      */}
      <dl className="mt-10 grid grid-cols-2 border-t border-ink sm:grid-cols-4">
        <Stat label="Bookings today" value={String(stats.todayBookings)} />
        <Stat label="Today's revenue" value={formatMoney(stats.todayRevenue)} />
        <Stat label="This week" value={formatMoneyCompact(stats.weekRevenue)} />
        <Stat
          label="Occupancy"
          value={formatPercent(stats.occupancyRate)}
          hint="Booked over open hours, last 7 days"
        />
        <Stat label="Upcoming" value={String(stats.upcomingBookings)} />
        <Stat
          label="Awaiting payment"
          value={formatMoney(stats.pendingPaymentAmount)}
          hint={pluralise(stats.pendingPayments, 'booking')}
          tone={stats.pendingPayments > 0 ? 'attention' : 'neutral'}
        />
        <Stat label="Active customers" value={String(stats.activeCustomers)} hint="Last 30 days" />
        <Stat label="This month" value={formatMoneyCompact(stats.monthRevenue)} />
      </dl>

      {/* ── Today, as a timeline ──────────────────────────────
          A list of rows makes an owner reconstruct their day in their
          head. A rail with the times running down it shows the shape of
          it — including the gaps, which is where the next booking goes. */}
      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="eyebrow">
            Today&rsquo;s schedule
            {sortedToday.length > 0 ? (
              <span className="ml-2 normal-case tracking-normal text-ink-soft">
                {pluralise(sortedToday.length, 'booking')}
              </span>
            ) : null}
          </h2>
          <Link
            href="/studio/schedule"
            className="text-xs text-ink-muted transition-colors hover:text-clay-ink"
          >
            View full schedule →
          </Link>
        </div>

        {sortedToday.length === 0 ? (
          <EmptyState
            className="border-line"
            icon={<Clock3 className="size-6" />}
            title="No bookings today"
            description="Your studio is free. Add a booking by hand, or block the time out if you are closed."
            action={
              <Button asChild size="sm">
                <Link href="/studio/bookings/new">New booking</Link>
              </Button>
            }
          />
        ) : (
          <ol className="card p-5">
            {sortedToday.map((booking, index) => {
              const start = instantToZoned(booking.startsAt, studio.timezone);
              const end = instantToZoned(booking.endsAt, studio.timezone);
              const presentation = presentBooking(booking);
              const last = index === sortedToday.length - 1;

              return (
                <li key={booking.id} className="relative flex gap-4">
                  {/* Time rail */}
                  <div className="flex w-16 shrink-0 flex-col items-end pt-0.5">
                    <span className="tabular text-sm text-ink">{start.time}</span>
                    <span className="tabular text-[0.625rem] text-ink-soft">
                      {end.time}
                    </span>
                  </div>

                  <div className="relative flex flex-col items-center">
                    <span
                      aria-hidden
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full ring-4 ring-stone',
                        TONE_DOT[presentation.tone],
                      )}
                    />
                    {last ? null : (
                      <span aria-hidden className="w-px flex-1 bg-stone-deep" />
                    )}
                  </div>

                  <Link
                    href={`/studio/schedule?view=day&booking=${booking.id}`}
                    scroll={false}
                    className={cn(
                      '-mx-2 mb-4 min-w-0 flex-1 rounded-[--radius-sm] px-2 py-1 transition-colors hover:bg-stone',
                      last ? 'mb-0' : '',
                    )}
                  >
                    <span
                      className={cn(
                        'block truncate text-sm',
                        booking.status === 'cancelled'
                          ? 'text-ink-muted line-through'
                          : 'text-ink',
                      )}
                    >
                      {booking.customerName}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">
                      {booking.spaceName} · {BOOKING_SOURCE_LABELS[booking.source]} ·{' '}
                      {formatMoney(booking.priceAmount)}
                    </span>
                    <span className={cn('mt-0.5 block text-xs', TONE_TEXT[presentation.tone])}>
                      {presentation.tone === 'settled'
                        ? presentation.paymentLabel
                        : presentation.summary}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {/* Next up */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="eyebrow">Coming up</h2>
            <Link
              href="/studio/bookings"
              className="text-xs text-ink-muted hover:text-clay-ink"
            >
              All bookings →
            </Link>
          </div>

          {nextUp.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing booked ahead yet.</p>
          ) : (
            <ul className="card divide-y divide-line-soft">
              {nextUp.map((booking) => (
                <li key={booking.id}>
                  <Link
                    href={`/studio/bookings/${booking.id}`}
                    className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-stone"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">
                        {booking.customerName}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {booking.spaceName} ·{' '}
                        {new Date(booking.startsAt).toLocaleDateString('en-IN', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          timeZone: studio.timezone,
                        })}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-sm text-ink-muted">
                      {formatMoney(booking.priceAmount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Customers */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="eyebrow">Recent customers</h2>
            <Link
              href="/studio/customers"
              className="text-xs text-ink-muted hover:text-clay-ink"
            >
              All customers →
            </Link>
          </div>

          {customers.items.length === 0 ? (
            <p className="text-sm text-ink-soft">No customers yet.</p>
          ) : (
            <ul className="card divide-y divide-line-soft">
              {customers.items.map((customer) => (
                <li key={customer.id}>
                  <Link
                    href={`/studio/customers/${customer.id}`}
                    className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-stone"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{customer.name}</span>
                      <span className="block text-xs text-ink-soft">
                        {pluralise(customer.totalBookings, 'booking')}
                        {customer.lastBookingAt
                          ? ` · last ${formatRelativeTime(customer.lastBookingAt)}`
                          : ''}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-sm text-ink-muted">
                      {formatMoney(customer.totalSpend)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * One figure in the band.
 *
 * The value is set in the display serif because these are the headline
 * numbers of the day, not table data — mono is kept for the times and
 * amounts inside the lists below, where digits have to line up.
 */
function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'attention';
}) {
  return (
    <div className="border-b border-line py-5 pr-6">
      <dt className="eyebrow">{label}</dt>
      <dd
        className={cn(
          'display mt-2.5 text-[1.875rem] leading-none',
          tone === 'attention' ? 'text-clay-ink' : 'text-ink',
        )}
      >
        {value}
      </dd>
      {hint ? <p className="mt-2 text-xs leading-snug text-ink-soft">{hint}</p> : null}
    </div>
  );
}
