import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DiscoveryFilters } from '@/features/discovery/components/discovery-filters';
import { StudioCard } from '@/features/discovery/components/studio-card';
import { todayHourCells } from '@/features/discovery/lib/hour-cells';
import { getRepository } from '@/lib/data';
import { formatDate, pluralise } from '@/lib/format';
import { parseIntOrNull } from '@/lib/utils';
import type { DiscoveryFilters as Filters, StudioSort } from '@/types/domain';
import { STUDIO_SORT_LABELS } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Explore studios',
  description:
    'Photography, video, podcast, music, dance and rehearsal spaces — with real availability.',
};

const PAGE_SIZE = 12;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const page = Math.max(1, parseIntOrNull(single(params.page)) ?? 1);

  const repository = await getRepository();

  const [results, categories, amenities, cities] = await Promise.all([
    repository.listPublicStudios({ filters, page, pageSize: PAGE_SIZE }),
    repository.listCategories(),
    repository.listAmenities(),
    repository.listPublicCities(),
  ]);

  const hours = await todayHourCells(repository, results.items);
  const activeCategory = categories.find((category) => category.slug === filters.categorySlug);

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[1320px] px-5 py-10 sm:px-8 sm:py-16">
        <div className="flex flex-col gap-6 border-b border-ink pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow flex items-center gap-2">
              <span className="dot text-clay" />
              {filters.city ?? cities[0]?.city ?? 'Mumbai'}
            </p>
            <h1 className="display mt-4 text-[clamp(2.25rem,5vw,3.5rem)] text-ink">
              {activeCategory ? activeCategory.name : 'Places to make something'}
            </h1>
            <p className="mt-3 text-sm text-ink-muted">
              {results.total === 0
                ? 'No studios match those filters yet.'
                : `${pluralise(results.total, 'studio')}${
                    filters.date
                      ? ` free on ${formatDate(filters.date, { year: false })} between ${filters.startTime} and ${filters.endTime}`
                      : ''
                  }`}
            </p>
          </div>

          {/* Search is its own form so a query survives every filter
              change and vice versa. */}
          <form action="/discover" method="get" className="relative w-full sm:w-80">
            {carry(filters).map(([name, value]) => (
              <input key={`${name}-${value}`} type="hidden" name={name} value={value} />
            ))}
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
            <input
              type="search"
              name="q"
              defaultValue={filters.q ?? ''}
              placeholder="Cyclorama, podcast room, Bandra…"
              className="field pl-9"
              aria-label="Search studios"
            />
          </form>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[248px_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <details className="lg:hidden" open={false}>
              <summary className="btn btn-secondary w-full cursor-pointer list-none">
                <SlidersHorizontal className="size-4" />
                Filters
              </summary>
              <div className="mt-5">
                <DiscoveryFilters
                  categories={categories}
                  amenities={amenities}
                  cities={cities}
                  filters={filters}
                  maxPrice={5000}
                />
              </div>
            </details>

            <div className="hidden lg:block">
              <DiscoveryFilters
                categories={categories}
                amenities={amenities}
                cities={cities}
                filters={filters}
                maxPrice={5000}
              />
            </div>
          </aside>

          <div>
            {results.items.length === 0 ? (
              <EmptyState
                title="Nothing matches yet"
                description="Try widening the price, dropping an amenity, or clearing the date. New studios are approved every week."
                action={
                  <Button asChild variant="secondary">
                    <Link href="/discover">Clear all filters</Link>
                  </Button>
                }
              />
            ) : (
              <>
                <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
                  {results.items.map((studio, index) => (
                    <StudioCard
                      key={studio.id}
                      studio={studio}
                      hours={hours.get(studio.id)}
                      priority={index < 3}
                    />
                  ))}
                </div>

                {results.total > PAGE_SIZE ? (
                  <nav
                    className="mt-10 flex items-center justify-between border-t border-line-soft pt-6"
                    aria-label="Pagination"
                  >
                    <PageLink
                      params={params}
                      page={page - 1}
                      disabled={page === 1}
                      label="Previous"
                    />
                    <p className="tabular text-ink-subtle">
                      Page {page} of {Math.ceil(results.total / PAGE_SIZE)}
                    </p>
                    <PageLink
                      params={params}
                      page={page + 1}
                      disabled={!results.hasMore}
                      label="Next"
                    />
                  </nav>
                ) : null}
              </>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function PageLink({
  params,
  page,
  disabled,
  label,
}: {
  params: SearchParams;
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
    for (const item of Array.isArray(value) ? value : [value]) next.append(key, item);
  }
  next.set('page', String(page));

  return (
    <Link href={`/discover?${next.toString()}`} className="btn btn-secondary btn-sm">
      {label}
    </Link>
  );
}

/* ── Params ─────────────────────────────────────────────────────── */

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * URL to filters, once.
 *
 * Anything unparseable is dropped rather than defaulted, so a
 * hand-edited query string produces a broader search, never an error
 * page.
 */
function parseFilters(params: SearchParams): Filters {
  const amenity = params.amenity;
  const sort = single(params.sort);
  const date = single(params.date);

  return {
    q: single(params.q)?.trim() || undefined,
    city: single(params.city) || undefined,
    categorySlug: single(params.category) || undefined,
    maxPrice: parseIntOrNull(single(params.maxPrice)) ?? undefined,
    minCapacity: parseIntOrNull(single(params.capacity)) ?? undefined,
    amenitySlugs: amenity ? (Array.isArray(amenity) ? amenity : [amenity]) : undefined,
    date: date || undefined,
    // A date with no window is not an availability question, so the
    // window falls back to a working afternoon rather than being ignored.
    startTime: date ? (single(params.start) || '10:00') : undefined,
    endTime: date ? (single(params.end) || '14:00') : undefined,
    sort: sort && sort in STUDIO_SORT_LABELS ? (sort as StudioSort) : undefined,
  };
}

/** The filter values the search box has to carry through with it. */
function carry(filters: Filters): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  if (filters.city) pairs.push(['city', filters.city]);
  if (filters.categorySlug) pairs.push(['category', filters.categorySlug]);
  if (filters.maxPrice) pairs.push(['maxPrice', String(filters.maxPrice)]);
  if (filters.minCapacity) pairs.push(['capacity', String(filters.minCapacity)]);
  if (filters.sort) pairs.push(['sort', filters.sort]);
  if (filters.date) pairs.push(['date', filters.date]);
  if (filters.startTime) pairs.push(['start', filters.startTime]);
  if (filters.endTime) pairs.push(['end', filters.endTime]);
  for (const slug of filters.amenitySlugs ?? []) pairs.push(['amenity', slug]);
  return pairs;
}
