import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ClipboardCheck, PauseCircle, PencilLine } from 'lucide-react';

import { ListingStatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { StudioImage } from '@/components/ui/studio-image';
import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import {
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  pluralise,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Overview', robots: { index: false } };

/**
 * "What is happening across PL·CE?"
 *
 * The action queue comes before the numbers, because the numbers do not
 * need anyone and the queue does. Every item in it is a link straight
 * into the work.
 */
export default async function AdminOverviewPage() {
  await requireAdmin();
  const repository = await getRepository();

  const [stats, waiting, changesRequested, suspended, recent] = await Promise.all([
    repository.getMarketplaceStats(),
    repository.listApplicationsForAdmin({
      filters: { status: ['submitted', 'under_review'] },
      pageSize: 6,
    }),
    repository.listApplicationsForAdmin({
      filters: { status: ['changes_requested'] },
      pageSize: 5,
    }),
    repository.listStudiosForAdmin({ filters: { suspended: true }, pageSize: 5 }),
    repository.listAdminActions({ pageSize: 8 }),
  ]);

  const queues = [
    {
      href: '/admin/applications?status=submitted',
      label: 'Studio applications',
      count: stats.pendingApplications,
      blurb: 'awaiting review',
      icon: ClipboardCheck,
      urgent: stats.pendingApplications > 0,
    },
    {
      href: '/admin/applications?status=changes_requested',
      label: 'Waiting on owners',
      count: stats.changesRequested,
      blurb: 'changes requested',
      icon: PencilLine,
      urgent: false,
    },
    {
      href: '/admin/studios?suspended=true',
      label: 'Suspended listings',
      count: stats.suspendedStudios,
      blurb: 'off Discovery',
      icon: PauseCircle,
      urgent: stats.suspendedStudios > 0,
    },
  ];

  return (
    <div className="max-w-6xl">
      <p className="eyebrow">PL·CE Admin</p>
      <h1 className="display mt-3 text-4xl text-ink">The marketplace today</h1>

      {/* Action queue */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {queues.map((queue) => {
          const Icon = queue.icon;
          return (
            <Link
              key={queue.href}
              href={queue.href}
              className="card group p-5 transition-colors hover:border-clay/50"
            >
              <div className="flex items-start justify-between">
                <Icon
                  className={`size-5 ${queue.urgent ? 'text-clay-ink' : 'text-ink-soft'}`}
                />
                <ArrowRight className="size-4 text-ink-soft transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="tabular mt-4 text-3xl text-ink">{queue.count}</p>
              <p className="mt-1 text-sm text-ink">{queue.label}</p>
              <p className="text-xs text-ink-soft">{queue.blurb}</p>
            </Link>
          );
        })}
      </div>

      {/* The queue itself */}
      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="eyebrow">Applications waiting</h2>
          <Link
            href="/admin/applications"
            className="text-xs text-ink-muted hover:text-clay-ink"
          >
            Full queue →
          </Link>
        </div>

        {waiting.items.length === 0 ? (
          <EmptyState
            className="border-line"
            title="The queue is clear"
            description="Nothing is waiting on PL·CE. New applications appear here the moment they are submitted."
          />
        ) : (
          <ul className="card divide-y divide-line-soft">
            {waiting.items.map((row) => (
              <li key={row.application.id}>
                <Link
                  href={`/admin/applications/${row.application.id}`}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-stone"
                >
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-[--radius-xs] bg-stone">
                    <StudioImage
                      src={row.coverImage?.url}
                      alt={row.studioName}
                      name={row.studioName}
                      sizes="56px"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{row.studioName}</p>
                    <p className="truncate text-sm text-ink-muted">
                      {row.city} · {row.categoryName} · {pluralise(row.spaceCount, 'space')}
                    </p>
                    <p className="truncate text-xs text-ink-soft">
                      {row.ownerName} · {row.ownerEmail}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <ListingStatusBadge status={row.application.status} />
                    <p className="mt-1.5 text-xs text-ink-soft">
                      {row.application.submittedAt
                        ? formatRelativeTime(row.application.submittedAt)
                        : 'not submitted'}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Numbers — ruled columns, the same table the studio
          dashboard uses. Eight identical boxes would give every figure
          the same weight and none of them any. */}
      <section className="mt-12">
        <h2 className="eyebrow">Marketplace</h2>
        <dl className="mt-4 grid grid-cols-2 border-t border-ink sm:grid-cols-4">
          <Stat label="Live studios" value={formatNumber(stats.liveStudios)} hint={`of ${stats.totalStudios} total`} />
          <Stat label="Approval rate" value={formatPercent(stats.approvalRate)} hint="of decided applications" />
          <Stat label="Bookings" value={formatNumber(stats.totalBookings)} hint={`${stats.bookingsThisMonth} this month`} />
          <Stat label="Gross booked" value={formatMoneyCompact(stats.grossRevenue)} hint={`${formatMoneyCompact(stats.revenueThisMonth)} this month`} />
          <Stat label="Active customers" value={formatNumber(stats.activeCustomers)} />
          <Stat label="Accounts" value={formatNumber(stats.totalUsers)} />
          <Stat
            label="Top city"
            value={stats.topCities[0]?.city ?? '—'}
            hint={stats.topCities[0] ? pluralise(stats.topCities[0].count, 'studio') : undefined}
          />
          <Stat
            label="Top category"
            value={stats.topCategories[0]?.name ?? '—'}
            hint={
              stats.topCategories[0]
                ? pluralise(stats.topCategories[0].count, 'studio')
                : undefined
            }
          />
        </dl>
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        {/* Waiting on owners */}
        <section>
          <h2 className="eyebrow mb-4">Waiting on owners</h2>
          {changesRequested.items.length === 0 ? (
            <p className="text-sm text-ink-soft">No listings are waiting on their owners.</p>
          ) : (
            <ul className="card divide-y divide-line-soft">
              {changesRequested.items.map((row) => (
                <li key={row.application.id}>
                  <Link
                    href={`/admin/applications/${row.application.id}`}
                    className="block p-4 transition-colors hover:bg-stone"
                  >
                    <p className="text-sm text-ink">{row.studioName}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">
                      {row.application.adminFeedback ?? 'Changes requested.'}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent admin activity */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="eyebrow">Recent decisions</h2>
            <Link href="/admin/audit" className="text-xs text-ink-muted hover:text-clay-ink">
              Audit log →
            </Link>
          </div>

          {recent.items.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing yet.</p>
          ) : (
            <ul className="card divide-y divide-line-soft">
              {recent.items.map((action) => (
                <li key={action.id} className="flex items-baseline justify-between gap-4 p-3.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{action.entityLabel}</span>
                    <span className="block text-xs text-ink-soft">
                      {action.adminName} · {action.action.replace('admin.', '').replace(/_/g, ' ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {formatRelativeTime(action.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {suspended.items.length > 0 ? (
        <section className="mt-10">
          <h2 className="eyebrow mb-4">Suspended</h2>
          <ul className="card divide-y divide-line-soft">
            {suspended.items.map((row) => (
              <li key={row.studio.id}>
                <Link
                  href={`/admin/studios/${row.studio.id}`}
                  className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-stone"
                >
                  <span>
                    <span className="block text-sm text-ink">{row.studio.name}</span>
                    <span className="block text-xs text-ink-soft">
                      {row.studio.location.city} · {row.ownerName}
                    </span>
                  </span>
                  <ListingStatusBadge status={row.studio.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-b border-line py-5 pr-6">
      <dt className="eyebrow">{label}</dt>
      <dd className="display mt-2.5 truncate text-[1.875rem] leading-none text-ink">{value}</dd>
      {hint ? <p className="mt-2 text-xs leading-snug text-ink-soft">{hint}</p> : null}
    </div>
  );
}
