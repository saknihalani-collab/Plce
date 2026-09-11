import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, Star } from 'lucide-react';

import { Badge, ListingStatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { StudioImage } from '@/components/ui/studio-image';
import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { formatMoneyCompact, formatNumber, formatRating, pluralise } from '@/lib/format';
import { isPubliclyVisible } from '@/lib/listing/visibility';
import { cn, parseIntOrNull } from '@/lib/utils';
import type { AdminStudioFilters } from '@/lib/data/repository';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Live studios', robots: { index: false } };

const PAGE_SIZE = 20;

/**
 * The marketplace inventory.
 *
 * The distinction the filters make is the one that matters operationally:
 * approved is a decision, live is a fact, and unpublished and suspended
 * are two different reasons for the same absence.
 */
const VIEWS = [
  { key: 'all', label: 'All', filters: {} as AdminStudioFilters },
  {
    key: 'live',
    label: 'Live',
    filters: { status: ['approved'], published: true, suspended: false } as AdminStudioFilters,
  },
  {
    key: 'approved',
    label: 'Approved',
    filters: { status: ['approved'] } as AdminStudioFilters,
  },
  {
    key: 'unpublished',
    label: 'Unpublished',
    filters: { published: false, status: ['approved', 'unpublished'] } as AdminStudioFilters,
  },
  {
    key: 'suspended',
    label: 'Suspended',
    filters: { suspended: true } as AdminStudioFilters,
  },
];

export default async function AdminStudiosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin('/admin/studios');
  const params = await searchParams;

  const view = VIEWS.find((candidate) => candidate.key === single(params.view)) ?? VIEWS[0]!;
  const query = single(params.q)?.trim() ?? '';
  const city = single(params.city) ?? '';
  const categoryId = single(params.category) ?? '';
  const page = Math.max(1, parseIntOrNull(single(params.page)) ?? 1);

  const repository = await getRepository();
  const [results, categories, cities] = await Promise.all([
    repository.listStudiosForAdmin({
      filters: {
        ...view.filters,
        q: query || undefined,
        city: city || undefined,
        categoryId: categoryId || undefined,
      },
      page,
      pageSize: PAGE_SIZE,
    }),
    repository.listCategories({ includeInactive: true }),
    repository.listPublicCities(),
  ]);

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1 className="display mt-3 text-4xl text-ink">Studios</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {pluralise(results.total, 'studio')} in this view
          </p>
        </div>

        <form action="/admin/studios" method="get" className="flex w-full flex-wrap gap-2 sm:w-auto">
          {view.key !== 'all' ? <input type="hidden" name="view" value={view.key} /> : null}

          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Studio, owner, city"
              aria-label="Search studios"
              className="field pl-9"
            />
          </div>

          <select name="city" defaultValue={city} aria-label="City" className="field w-auto">
            <option value="">Any city</option>
            {cities.map((entry) => (
              <option key={entry.city} value={entry.city}>
                {entry.city}
              </option>
            ))}
          </select>

          <select
            name="category"
            defaultValue={categoryId}
            aria-label="Category"
            className="field w-auto"
          >
            <option value="">Any type</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
        </form>
      </div>

      <nav className="mt-8 flex flex-wrap gap-1.5" aria-label="Filter by state">
        {VIEWS.map((candidate) => (
          <Link
            key={candidate.key}
            href={
              candidate.key === 'all' ? '/admin/studios' : `/admin/studios?view=${candidate.key}`
            }
            aria-current={candidate.key === view.key ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              candidate.key === view.key
                ? 'border-clay bg-clay/15 text-clay-ink'
                : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {candidate.label}
          </Link>
        ))}
      </nav>

      <div className="card mt-6 overflow-hidden">
        {results.items.length === 0 ? (
          <EmptyState
            className="border-0"
            title="Nothing in this view"
            description="Try another filter, or clear the search."
          />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="data-table min-w-[880px]">
              <thead>
                <tr>
                  <th className="py-3 pl-4">Studio</th>
                  <th>Owner</th>
                  <th>Location</th>
                  <th>Visibility</th>
                  <th>Bookings</th>
                  <th>Booked value</th>
                  <th>Rating</th>
                  <th className="pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.items.map((row) => (
                  <tr key={row.studio.id}>
                    <td className="pl-4">
                      <div className="flex items-center gap-3">
                        <div className="relative size-10 shrink-0 overflow-hidden rounded-[--radius-xs] bg-stone">
                          <StudioImage
                            src={row.coverImage?.url}
                            alt={row.studio.name}
                            name={row.studio.name}
                            sizes="40px"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-medium text-ink">
                            {row.studio.name}
                            {row.studio.isFeatured ? (
                              <Star className="size-3.5 fill-clay text-clay-ink" />
                            ) : null}
                          </p>
                          <p className="text-xs text-ink-soft">
                            {row.categoryName} · {pluralise(row.spaceCount, 'space')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="truncate text-ink">{row.ownerName}</p>
                      <p className="truncate text-xs text-ink-soft">{row.ownerEmail}</p>
                    </td>
                    <td className="text-ink-muted">
                      {row.studio.location.area}
                      <span className="block text-xs text-ink-soft">
                        {row.studio.location.city}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <ListingStatusBadge status={row.studio.status} />
                        {isPubliclyVisible(row.studio) ? (
                          <Badge tone="sage">On Discovery</Badge>
                        ) : (
                          <Badge tone="neutral">Hidden</Badge>
                        )}
                      </div>
                    </td>
                    <td className="tabular text-ink-muted">{formatNumber(row.bookingCount)}</td>
                    <td className="tabular text-ink">{formatMoneyCompact(row.revenue)}</td>
                    <td className="tabular text-ink-muted">
                      {formatRating(row.ratingAverage, row.ratingCount)}
                    </td>
                    <td className="pr-4 text-right">
                      <Link
                        href={`/admin/studios/${row.studio.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        Manage
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
    <Link href={`/admin/studios?${next.toString()}`} className="btn btn-secondary btn-sm">
      {label}
    </Link>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
