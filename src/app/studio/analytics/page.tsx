import type { Metadata } from 'next';

import { requireStudioContext, assertStudioPermission } from '@/features/studio/lib/context';
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  pluralise,
} from '@/lib/format';
import { todayInZone, zonedToInstant } from '@/lib/time';
import { BOOKING_SOURCE_LABELS, type BookingSource } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Analytics', robots: { index: false } };

/**
 * The studio's own numbers.
 *
 * The headline is where bookings come from. Every booking records its
 * source at creation — `plce`, `whatsapp`, `instagram`, `phone`,
 * `walk_in`, `manual` — so "most of our bookings come in over WhatsApp"
 * stops being a hunch an owner has and becomes a number they can act on.
 */
export default async function StudioAnalyticsPage() {
  const context = await requireStudioContext('/studio/analytics');
  assertStudioPermission(context, 'billing.view');

  const { repository, studio, organizationId } = context;
  const now = new Date();
  const today = todayInZone(studio.timezone, now);

  const ninetyDaysAgo = new Date(
    zonedToInstant(today, '00:00', studio.timezone).getTime() - 90 * 86_400_000,
  ).toISOString();

  const [stats, bookings, customers] = await Promise.all([
    repository.getStudioStats(organizationId, now),
    repository.listBookings(organizationId, { pageSize: 100, filters: { from: ninetyDaysAgo } }),
    repository.listCustomers(organizationId, { pageSize: 100 }),
  ]);

  const counted = bookings.items.filter((booking) => booking.status !== 'cancelled');
  const revenue = counted.reduce((total, booking) => total + booking.priceAmount, 0);

  const bySource = counted.reduce<Partial<Record<BookingSource, { count: number; value: number }>>>(
    (accumulator, booking) => {
      const entry = accumulator[booking.source] ?? { count: 0, value: 0 };
      entry.count += 1;
      entry.value += booking.priceAmount;
      accumulator[booking.source] = entry;
      return accumulator;
    },
    {},
  );

  const sources = Object.entries(bySource)
    .map(([source, entry]) => ({
      source: source as BookingSource,
      count: entry!.count,
      value: entry!.value,
      share: counted.length === 0 ? 0 : entry!.count / counted.length,
    }))
    .sort((a, b) => b.count - a.count);

  const bySpace = studio.spaces
    .map((space) => {
      const rows = counted.filter((booking) => booking.spaceId === space.id);
      return {
        name: space.name,
        count: rows.length,
        value: rows.reduce((total, booking) => total + booking.priceAmount, 0),
      };
    })
    .sort((a, b) => b.value - a.value);

  const repeat = customers.items.filter((customer) => customer.totalBookings > 1).length;
  const topCustomers = [...customers.items]
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 5);

  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Last 90 days</p>
      <h1 className="display mt-3 text-4xl text-ink">Analytics</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        Everything here is counted from your real bookings — the same rows the calendar
        renders. Nothing is estimated.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Bookings" value={formatNumber(counted.length)} />
        <Stat label="Booked value" value={formatMoneyCompact(revenue)} />
        <Stat
          label="Average booking"
          value={counted.length === 0 ? '—' : formatMoney(revenue / counted.length)}
        />
        <Stat
          label="Occupancy"
          value={formatPercent(stats.occupancyRate)}
          hint="Booked hours over open hours, last 7 days"
        />
      </div>

      {/* Where bookings come from — the reason source is recorded. */}
      <section className="mt-10">
        <h2 className="eyebrow mb-4">Where your bookings come from</h2>

        {sources.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No bookings in the last 90 days yet. Once there are, this is where you will see
            how many arrive over WhatsApp versus PL·CE.
          </p>
        ) : (
          <div className="card space-y-4 p-5">
            {sources.map((entry) => (
              <div key={entry.source}>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-ink">{BOOKING_SOURCE_LABELS[entry.source]}</span>
                  <span className="tabular text-ink-muted">
                    {formatPercent(entry.share)} · {pluralise(entry.count, 'booking')} ·{' '}
                    {formatMoneyCompact(entry.value)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone">
                  <div
                    className={
                      entry.source === 'whatsapp'
                        ? 'h-full rounded-full bg-olive'
                        : 'h-full rounded-full bg-clay'
                    }
                    style={{ width: `${Math.round(entry.share * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="eyebrow mb-4">By space</h2>
          <ul className="card divide-y divide-line-soft">
            {bySpace.length === 0 ? (
              <li className="p-4 text-sm text-ink-soft">No spaces yet.</li>
            ) : (
              bySpace.map((space) => (
                <li key={space.name} className="flex justify-between gap-4 p-4 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{space.name}</span>
                    <span className="block text-xs text-ink-soft">
                      {pluralise(space.count, 'booking')}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-ink-muted">
                    {formatMoneyCompact(space.value)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section>
          <h2 className="eyebrow mb-4">Best customers</h2>
          <ul className="card divide-y divide-line-soft">
            {topCustomers.length === 0 ? (
              <li className="p-4 text-sm text-ink-soft">No customers yet.</li>
            ) : (
              topCustomers.map((customer) => (
                <li key={customer.id} className="flex justify-between gap-4 p-4 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{customer.name}</span>
                    <span className="block text-xs text-ink-soft">
                      {pluralise(customer.totalBookings, 'booking')}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-ink-muted">
                    {formatMoneyCompact(customer.totalSpend)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        <Stat label="Customers" value={formatNumber(customers.total)} />
        <Stat
          label="Who came back"
          value={
            customers.items.length === 0 ? '—' : formatPercent(repeat / customers.items.length)
          }
          hint={`${repeat} with more than one booking`}
        />
        <Stat
          label="Awaiting payment"
          value={formatMoney(stats.pendingPaymentAmount)}
          hint={pluralise(stats.pendingPayments, 'booking')}
        />
      </div>

      <p className="mt-10 border-t border-line pt-6 text-xs leading-relaxed text-ink-soft">
        Counted over the last 90 days, in {studio.timezone.replace('_', ' ')}. Cancelled
        bookings are excluded from every figure except the customer count.
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className="tabular mt-2 truncate text-2xl text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}
