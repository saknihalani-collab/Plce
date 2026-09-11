import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';

import { ListingStatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { StudioImage } from '@/components/ui/studio-image';
import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { formatDate, formatRelativeTime, pluralise } from '@/lib/format';
import { cn, parseIntOrNull } from '@/lib/utils';
import type { ListingStatus } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Applications', robots: { index: false } };

const TABS: Array<{ key: string; label: string; statuses?: ListingStatus[] }> = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'New', statuses: ['submitted'] },
  { key: 'under_review', label: 'Under review', statuses: ['under_review'] },
  { key: 'changes_requested', label: 'Changes requested', statuses: ['changes_requested'] },
  { key: 'approved', label: 'Approved', statuses: ['approved', 'suspended', 'unpublished'] },
  { key: 'rejected', label: 'Rejected', statuses: ['rejected'] },
];

const PAGE_SIZE = 20;

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin('/admin/applications');
  const params = await searchParams;

  const status = single(params.status) ?? 'all';
  const query = single(params.q)?.trim() ?? '';
  const page = Math.max(1, parseIntOrNull(single(params.page)) ?? 1);
  const tab = TABS.find((candidate) => candidate.key === status) ?? TABS[0]!;

  const repository = await getRepository();
  const results = await repository.listApplicationsForAdmin({
    filters: { status: tab.statuses, q: query || undefined },
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Review queue</p>
          <h1 className="display mt-3 text-4xl text-ink">Studio applications</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {results.total === 0
              ? 'Nothing here yet.'
              : `${pluralise(results.total, 'application')} in this view`}
          </p>
        </div>

        <form action="/admin/applications" method="get" className="relative w-full sm:w-72">
          {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Studio, owner, phone, email, city"
            aria-label="Search applications"
            className="field pl-9"
          />
        </form>
      </div>

      {/* Filters */}
      <nav className="mt-8 flex flex-wrap gap-1.5" aria-label="Filter by status">
        {TABS.map((candidate) => {
          const href =
            candidate.key === 'all'
              ? `/admin/applications${query ? `?q=${encodeURIComponent(query)}` : ''}`
              : `/admin/applications?status=${candidate.key}${query ? `&q=${encodeURIComponent(query)}` : ''}`;

          return (
            <Link
              key={candidate.key}
              href={href}
              aria-current={candidate.key === status ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                candidate.key === status
                  ? 'border-clay bg-clay/15 text-clay-ink'
                  : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {candidate.label}
            </Link>
          );
        })}
      </nav>

      {/* Table */}
      <div className="card mt-6 overflow-hidden">
        {results.items.length === 0 ? (
          <EmptyState
            className="border-0"
            title={query ? 'No applications match that search' : 'Nothing in this queue'}
            description={
              query
                ? 'Try the studio name, the owner’s email, or the city.'
                : 'Applications land here the moment an owner submits one.'
            }
          />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="data-table min-w-[820px]">
              <thead>
                <tr>
                  <th className="py-3 pl-4">Studio</th>
                  <th>Owner</th>
                  <th>Location</th>
                  <th>Category</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th className="pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.items.map((row) => (
                  <tr key={row.application.id}>
                    <td className="pl-4">
                      <div className="flex items-center gap-3">
                        <div className="relative size-10 shrink-0 overflow-hidden rounded-[--radius-xs] bg-stone">
                          <StudioImage
                            src={row.coverImage?.url}
                            alt={row.studioName}
                            name={row.studioName}
                            sizes="40px"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{row.studioName}</p>
                          <p className="text-xs text-ink-soft">
                            {pluralise(row.spaceCount, 'space')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="truncate text-ink">{row.ownerName}</p>
                      <p className="truncate text-xs text-ink-soft">{row.ownerEmail}</p>
                    </td>
                    <td className="text-ink-muted">
                      {row.area}
                      <span className="block text-xs text-ink-soft">{row.city}</span>
                    </td>
                    <td className="text-ink-muted">{row.categoryName}</td>
                    <td className="text-ink-muted">
                      {row.application.submittedAt ? (
                        <>
                          {formatDate(row.application.submittedAt.slice(0, 10), { year: false })}
                          <span className="block text-xs text-ink-soft">
                            {formatRelativeTime(row.application.submittedAt)}
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-soft">—</span>
                      )}
                    </td>
                    <td>
                      <ListingStatusBadge status={row.application.status} />
                    </td>
                    <td className="pr-4 text-right">
                      <Link
                        href={`/admin/applications/${row.application.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {results.total > PAGE_SIZE ? (
        <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
          <PageLink params={params} page={page - 1} disabled={page === 1} label="Previous" />
          <p className="tabular text-sm text-ink-soft">
            Page {page} of {Math.ceil(results.total / PAGE_SIZE)}
          </p>
          <PageLink params={params} page={page + 1} disabled={!results.hasMore} label="Next" />
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({
  params,
  page,
  disabled,
  label,
}: {
  params: Record<string, string | string[] | undefined>;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="btn btn-secondary btn-sm opacity-40" aria-disabled>
        {label}
      </span>
    );
  }

  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page' || value == null) continue;
    next.set(key, Array.isArray(value) ? (value[0] ?? '') : value);
  }
  next.set('page', String(page));

  return (
    <Link href={`/admin/applications?${next.toString()}`} className="btn btn-secondary btn-sm">
      {label}
    </Link>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
