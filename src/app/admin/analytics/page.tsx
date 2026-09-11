import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  pluralise,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Analytics', robots: { index: false } };

/**
 * Marketplace analytics.
 *
 * Deliberately a small set of true numbers rather than a wall of charts.
 * Each one is computed from the same tables the rest of the product
 * reads, so nothing here can drift from what an owner sees in their own
 * dashboard.
 */
export default async function AdminAnalyticsPage() {
  await requireAdmin('/admin/analytics');
  const repository = await getRepository();

  const [stats, applications] = await Promise.all([
    repository.getMarketplaceStats(),
    repository.listApplicationsForAdmin({ pageSize: 100 }),
  ]);

  const byStatus = applications.items.reduce<Record<string, number>>((counts, row) => {
    counts[row.application.status] = (counts[row.application.status] ?? 0) + 1;
    return counts;
  }, {});

  const funnel = [
    { label: 'Applications received', value: applications.total },
    { label: 'Approved', value: (byStatus.approved ?? 0) + (byStatus.suspended ?? 0) + (byStatus.unpublished ?? 0) },
    { label: 'Live on Discovery', value: stats.liveStudios },
  ];
  const top = Math.max(...funnel.map((step) => step.value), 1);

  return (
    <div className="max-w-5xl">
      <p className="eyebrow">Marketplace</p>
      <h1 className="display mt-3 text-4xl text-ink">Analytics</h1>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Live studios" value={formatNumber(stats.liveStudios)} />
        <Stat label="Total studios" value={formatNumber(stats.totalStudios)} />
        <Stat label="Approval rate" value={formatPercent(stats.approvalRate)} />
        <Stat label="Suspended" value={formatNumber(stats.suspendedStudios)} />
        <Stat label="Bookings" value={formatNumber(stats.totalBookings)} />
        <Stat label="This month" value={formatNumber(stats.bookingsThisMonth)} />
        <Stat label="Gross booked" value={formatMoneyCompact(stats.grossRevenue)} />
        <Stat label="Booked this month" value={formatMoneyCompact(stats.revenueThisMonth)} />
      </div>

      <section className="mt-10">
        <h2 className="eyebrow mb-4">Supply funnel</h2>
        <div className="card space-y-4 p-5">
          {funnel.map((step) => (
            <div key={step.label}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-ink-muted">{step.label}</span>
                <span className="tabular text-ink">{formatNumber(step.value)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone">
                <div
                  className="h-full rounded-full bg-clay"
                  style={{ width: `${Math.round((step.value / top) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="eyebrow mb-4">Top cities</h2>
          <ul className="card divide-y divide-line-soft">
            {stats.topCities.length === 0 ? (
              <li className="p-4 text-sm text-ink-soft">No live studios yet.</li>
            ) : (
              stats.topCities.map((city) => (
                <li key={city.city} className="flex justify-between p-4 text-sm">
                  <span className="text-ink">{city.city}</span>
                  <span className="tabular text-ink-muted">
                    {pluralise(city.count, 'studio')}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section>
          <h2 className="eyebrow mb-4">Top categories</h2>
          <ul className="card divide-y divide-line-soft">
            {stats.topCategories.length === 0 ? (
              <li className="p-4 text-sm text-ink-soft">No live studios yet.</li>
            ) : (
              stats.topCategories.map((category) => (
                <li key={category.name} className="flex justify-between p-4 text-sm">
                  <span className="text-ink">{category.name}</span>
                  <span className="tabular text-ink-muted">
                    {pluralise(category.count, 'studio')}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="eyebrow mb-4">Demand</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Active customers" value={formatNumber(stats.activeCustomers)} />
          <Stat label="Accounts" value={formatNumber(stats.totalUsers)} />
          <Stat
            label="Average booking"
            value={
              stats.totalBookings === 0
                ? '—'
                : formatMoney(stats.grossRevenue / stats.totalBookings)
            }
          />
        </div>
      </section>

      <p className="mt-10 border-t border-line pt-6 text-xs leading-relaxed text-ink-soft">
        Search-to-booking conversion, studio utilisation and repeat-customer rate need
        event tracking that this build does not collect yet. They are not shown here rather
        than shown as guesses.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className="tabular mt-2 text-2xl text-ink">{value}</p>
    </div>
  );
}
