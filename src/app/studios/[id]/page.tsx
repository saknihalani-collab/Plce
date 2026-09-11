import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Instagram, Globe, MapPin, Star } from 'lucide-react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { Badge } from '@/components/ui/badge';
import { StudioImage } from '@/components/ui/studio-image';
import { BookingPanel } from '@/features/booking/components/booking-panel';
import { dayAvailability, upcomingDays } from '@/features/booking/lib/day-availability';
import { getRepository } from '@/lib/data';
import { formatDate, formatMoney, formatRating, pluralise } from '@/lib/format';
import { isValidDateString, todayInZone } from '@/lib/time';
import { parseIntOrNull } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const repository = await getRepository();
  const studio = await repository.getPublicStudio(id);
  if (!studio) return { title: 'Studio not found' };

  return {
    title: studio.name,
    description: studio.tagline ?? studio.description.slice(0, 155),
    openGraph: {
      title: `${studio.name} · ${studio.location.area}`,
      description: studio.tagline ?? studio.description.slice(0, 155),
      images: studio.coverImage ? [{ url: studio.coverImage.url }] : undefined,
    },
  };
}

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { id } = await params;
  const search = await searchParams;
  const repository = await getRepository();

  const studio = await repository.getPublicStudio(id);
  // A studio that exists but is not approved-and-published is a 404 to
  // the public, not a "you can't see this" — the marketplace does not
  // confirm the existence of listings it has not published.
  if (!studio) notFound();

  const reviews = await repository.listReviewsForStudio(studio.id);

  const bookable = studio.spaces.filter((space) => space.isActive);
  const space =
    bookable.find((candidate) => candidate.id === single(search.space)) ?? bookable[0] ?? null;

  const today = todayInZone(studio.timezone);
  const requestedDate = single(search.date);
  const date = requestedDate && isValidDateString(requestedDate) ? requestedDate : today;
  const durationMinutes = clampDuration(
    parseIntOrNull(single(search.duration)),
    space?.minBookingMinutes ?? 60,
  );

  const [availability, days] = space
    ? await Promise.all([
        dayAvailability(repository, studio, space, date, durationMinutes),
        upcomingDays(repository, studio, space, today, 14, durationMinutes),
      ])
    : [null, []];

  const gallery = studio.images.filter((image) => image.id !== studio.coverImage?.id).slice(0, 4);

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8">
        <nav className="mb-6 text-sm text-ink-subtle" aria-label="Breadcrumb">
          <Link href="/discover" className="transition-colors hover:text-clay-ink">
            Discover
          </Link>
          <span className="mx-2">·</span>
          <Link
            href={`/discover?category=${studio.category.slug}`}
            className="transition-colors hover:text-clay-ink"
          >
            {studio.category.name}
          </Link>
          <span className="mx-2">·</span>
          <span className="text-ink-muted">{studio.location.area}</span>
        </nav>

        {/* Gallery */}
        <div className="grid gap-2 overflow-hidden rounded-[--radius-lg] sm:grid-cols-[2fr_1fr]">
          <div className="relative aspect-[4/3] bg-surface-sunken sm:aspect-[3/2]">
            <StudioImage
              src={studio.coverImage?.url}
              alt={studio.coverImage?.alt ?? studio.name}
              name={studio.name}
              priority
              sizes="(min-width: 640px) 66vw, 100vw"
            />
          </div>
          {gallery.length > 0 ? (
            <div className="hidden grid-rows-2 gap-2 sm:grid">
              {gallery.slice(0, 2).map((image) => (
                <div key={image.id} className="relative bg-surface-sunken">
                  <StudioImage
                    src={image.url}
                    alt={image.alt}
                    name={studio.name}
                    sizes="33vw"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_380px]">
          {/* ── Left: the listing ─────────────────────────────── */}
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="display text-4xl text-ink sm:text-5xl">{studio.name}</h1>
                {studio.tagline ? (
                  <p className="display-italic mt-3 max-w-xl text-lg text-ink-muted">
                    {studio.tagline}
                  </p>
                ) : null}
                <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                  <MapPin className="size-4 text-ink-subtle" />
                  {studio.location.area}, {studio.location.city}
                  <span className="text-ink-subtle">·</span>
                  {studio.category.name}
                  <span className="text-ink-subtle">·</span>
                  {pluralise(studio.spaces.length, 'space')}
                </p>
              </div>

              <div className="text-right">
                <p className="flex items-center justify-end gap-1.5 text-sm">
                  <Star className="size-4 fill-clay text-clay-ink" />
                  <span className="tabular text-ink">
                    {formatRating(studio.ratingAverage, studio.ratingCount)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-ink-subtle">
                  {pluralise(studio.bookingCount, 'booking')} on PL·CE
                </p>
              </div>
            </div>

            <p className="mt-8 max-w-2xl whitespace-pre-line leading-relaxed text-ink">
              {studio.description}
            </p>

            {/* Spaces */}
            <Section title="Spaces">
              <ul className="divide-y divide-line-soft">
                {studio.spaces.map((studioSpace) => (
                  <li
                    key={studioSpace.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4 first:pt-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">
                        {studioSpace.name}
                        {!studioSpace.isActive ? (
                          <Badge tone="neutral" className="ml-2">
                            Not bookable
                          </Badge>
                        ) : null}
                      </p>
                      {studioSpace.description ? (
                        <p className="mt-1 text-sm text-ink-muted">{studioSpace.description}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-ink-subtle">
                        Up to {studioSpace.capacity}
                        {studioSpace.sizeSqft ? ` · ${studioSpace.sizeSqft} sq ft` : ''} ·{' '}
                        {studioSpace.minBookingMinutes / 60} hr minimum
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-ink">{formatMoney(studioSpace.hourlyRate)}/hr</p>
                      {studioSpace.fullDayRate ? (
                        <p className="mt-0.5 text-xs text-ink-subtle">
                          {formatMoney(studioSpace.fullDayRate)} full day
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>

            {studio.amenities.length > 0 ? (
              <Section title="What's here">
                <ul className="flex flex-wrap gap-2">
                  {studio.amenities.map((amenity) => (
                    <li
                      key={amenity.id}
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted"
                    >
                      {amenity.name}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {studio.equipment.length > 0 ? (
              <Section title="Equipment on site">
                <ul className="grid gap-x-8 gap-y-1.5 text-sm text-ink-muted sm:grid-cols-2">
                  {studio.equipment.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-ink-subtle">·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {studio.rules.length > 0 ? (
              <Section title="House rules">
                <ul className="space-y-2 text-sm text-ink-muted">
                  {studio.rules.map((rule) => (
                    <li key={rule} className="flex gap-2">
                      <span className="text-ink-subtle">·</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            <Section title="Cancellation">
              <p className="text-sm leading-relaxed text-ink-muted">
                {studio.cancellationPolicy || 'Ask the studio.'}
              </p>
            </Section>

            <Section title="Your host">
              <p className="font-medium text-ink">{studio.host.organizationName}</p>
              <p className="mt-1 text-sm text-ink-muted">
                On PL·CE since {formatDate(studio.host.memberSince.slice(0, 10))}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {studio.instagram ? (
                  <a
                    href={`https://instagram.com/${studio.instagram}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-ink-muted transition-colors hover:text-clay-ink"
                  >
                    <Instagram className="size-4" />@{studio.instagram}
                  </a>
                ) : null}
                {studio.website ? (
                  <a
                    href={studio.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-ink-muted transition-colors hover:text-clay-ink"
                  >
                    <Globe className="size-4" />
                    Website
                  </a>
                ) : null}
              </div>
            </Section>

            {reviews.length > 0 ? (
              <Section title={`${pluralise(reviews.length, 'review')}`}>
                <ul className="space-y-6">
                  {reviews.slice(0, 6).map((review) => (
                    <li key={review.id} className="border-l-2 border-line pl-4">
                      <div className="flex items-center gap-2">
                        <span className="tabular text-sm text-clay-ink">
                          {'★'.repeat(review.rating)}
                          <span className="text-line-strong">{'★'.repeat(5 - review.rating)}</span>
                        </span>
                        <span className="text-sm font-medium text-ink">{review.authorName}</span>
                        <span className="text-xs text-ink-subtle">
                          {formatDate(review.createdAt.slice(0, 10))}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{review.body}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>

          {/* ── Right: booking ────────────────────────────────── */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            {space && availability ? (
              <BookingPanel
                studio={studio}
                space={space}
                availability={availability}
                days={days}
                durationMinutes={durationMinutes}
                date={date}
              />
            ) : (
              <div className="card p-5 text-sm text-ink-muted">
                This studio has no bookable spaces at the moment.
              </div>
            )}
          </aside>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-line-soft pt-8">
      <h2 className="eyebrow mb-4">{title}</h2>
      {children}
    </section>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Whole hours only, never below the space's own minimum. */
function clampDuration(requested: number | null, minBookingMinutes: number): number {
  const minimum = Math.max(60, Math.ceil(minBookingMinutes / 60) * 60);
  if (!requested || requested < minimum) return minimum;
  return Math.min(720, Math.round(requested / 60) * 60);
}
