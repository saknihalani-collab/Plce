import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { availabilitySummary, HourStrip, type HourCell } from '@/components/brand/hour-strip';
import { Reveal } from '@/components/brand/reveal';
import { WhatsAppStory } from '@/components/brand/whatsapp-story';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { Button } from '@/components/ui/button';
import { StudioImage } from '@/components/ui/studio-image';
import {
  CategoryExplorer,
  type CategoryEntry,
} from '@/features/discovery/components/category-explorer';
import { HeroGallery, type HeroStudio } from '@/features/discovery/components/hero-gallery';
import { todayHourCells } from '@/features/discovery/lib/hour-cells';
import { getRepository } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { StudioSummary } from '@/types/domain';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const repository = await getRepository();

  const [featured, all, categories] = await Promise.all([
    repository.listFeaturedStudios(6),
    repository.listPublicStudios({ pageSize: 12 }),
    repository.listCategories(),
  ]);

  // Featured first, then whatever else is live — a marketplace with two
  // featured studios should still show a full spread rather than a gap.
  const seen = new Set(featured.map((studio) => studio.id));
  const showcase = [...featured, ...all.items.filter((studio) => !seen.has(studio.id))];

  /*
    The availability band shows the next day that has hours left in it.

    Someone opening PL·CE at 10 PM is not browsing tonight, and a "free
    today" list reading "closed today" four times is worse than useless.
    So if every studio's day is already spent, the same availability
    function is asked about tomorrow instead — one day forward, never
    further, because beyond that it stops being "what is open now" and
    starts being a search.
  */
  const today = await todayHourCells(repository, showcase);
  const anyFreeToday = showcase
    .slice(0, 4)
    .some((studio) => (today.get(studio.id) ?? []).some((cell) => cell.state === 'free'));

  const hours = anyFreeToday ? today : await todayHourCells(repository, showcase, new Date(), 1);
  const dayWord = anyFreeToday ? 'today' : 'tomorrow';

  const opener = showcase[0];

  // The spaces of the studio in the opener, for the calendar showcase
  // further down. Space names are public — they appear on the listing.
  const openerSpaces = opener ? await repository.listSpacesForStudios([opener.id]) : [];

  /*
    One real review, chosen rather than invented: the fullest five-star
    one. If nobody has left five stars the section does not render at
    all — a marketplace with no praise should not be quoting any.
  */
  const mostReviewed = [...showcase].sort((a, b) => b.ratingCount - a.ratingCount)[0];
  const reviews = mostReviewed ? await repository.listReviewsForStudio(mostReviewed.id) : [];
  const quote = reviews
    .filter((review) => !review.isHidden && review.rating === 5)
    .sort((a, b) => b.body.length - a.body.length)[0];

  // Areas, counted from what is actually listed.
  const areas = countBy(all.items.map((studio) => studio.area)).slice(0, 8);

  /*
    Only categories that have somewhere to send you.

    Every category in the taxonomy is real and belongs in the filters,
    but a category with nothing in it is a link to an empty result page.
    Listing it here would be advertising inventory PL·CE does not have.
  */
  const categoryEntries: CategoryEntry[] = categories
    .map((category) => {
      const inCategory = all.items.filter((studio) => studio.category.slug === category.slug);
      const studio = inCategory[0];
      return {
        slug: category.slug,
        name: category.name,
        count: inCategory.length,
        studio: studio
          ? {
              name: studio.name,
              area: studio.area,
              src: studio.coverImage?.url ?? null,
              alt: studio.coverImage?.alt ?? studio.name,
            }
          : null,
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const heroStudios: HeroStudio[] = showcase.slice(0, 3).map((studio) => ({
    slug: studio.slug,
    name: studio.name,
    area: studio.area,
    city: studio.city,
    src: studio.coverImage?.url ?? null,
    alt: studio.coverImage?.alt ?? studio.name,
  }));

  return (
    <>
      <SiteHeader transparent />

      <main>
        {/* ══ Hero ══════════════════════════════════════════════
            Typography first, then the world. The statement is
            centred and given the whole width to itself; the visual
            field below runs edge to edge, so the page opens onto a
            room rather than onto a picture of one.

            No location in the eyebrow. PL·CE starts in one city but
            is not a city — where a studio is belongs on the studio,
            and that is exactly where the gallery caption puts it. */}
        <section className="px-(--gutter) pt-20 pb-14 sm:pt-28 sm:pb-20">
          <div className="mx-auto max-w-[56rem] text-center">
            <Reveal>
              <p className="eyebrow inline-flex items-center gap-2">
                <span className="dot text-clay" />
                Creative spaces
              </p>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="display display-xl mt-8 text-ink">
                Find a place
                <br />
                to <span className="display-italic">make</span> something.
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="lede mx-auto mt-8">
                Find and book a studio for the work you want to make.
              </p>
            </Reveal>

            <Reveal delay={180}>
              <div className="mt-10">
                <Button asChild size="lg">
                  <Link href="/discover">
                    Explore studios
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>

        {heroStudios.length > 0 ? (
          <Reveal>
            <HeroGallery studios={heroStudios} />
          </Reveal>
        ) : null}

        {/* ══ The idea ══════════════════════════════════════════
            One statement and one room. Not a feature card, not a
            list — the argument for PL·CE existing at all, given the
            space to be read. */}
        <section className="border-b border-line bg-stone/45">
          <div className="mx-auto grid max-w-(--measure) items-center gap-12 px-(--gutter) py-(--section-y) lg:grid-cols-[1.05fr_0.95fr] lg:gap-24">
            <Reveal>
              <h2 className="display display-lg text-ink">
                Every idea
                <br />
                needs somewhere
                <br />
                to happen.
              </h2>
              <p className="lede mt-8">A good place can change the way the work feels.</p>
              <p className="mt-6 max-w-sm leading-relaxed text-ink-muted">
                PL·CE brings those places together — with the hours they actually have free,
                and a price before you commit to anything.
              </p>
            </Reveal>

            {showcase[1] ? (
              <Reveal delay={100}>
                <Link href={`/studios/${showcase[1].slug}`} className="group block">
                  <div className="relative aspect-4/5 overflow-hidden bg-stone-deep sm:aspect-3/2 lg:aspect-4/5">
                    <StudioImage
                      src={showcase[1].coverImage?.url}
                      alt={showcase[1].coverImage?.alt ?? showcase[1].name}
                      name={showcase[1].name}
                      sizes="(min-width: 1024px) 42vw, 100vw"
                      className="image-lift"
                    />
                  </div>
                  <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-line pt-3">
                    <p className="display display-sm text-ink transition-colors group-hover:text-clay-ink">
                      {showcase[1].name}
                    </p>
                    <p className="meta">{showcase[1].area}</p>
                  </div>
                </Link>
              </Reveal>
            ) : null}
          </div>
        </section>

        {/* ══ What are you making ═══════════════════════════════ */}
        {categoryEntries.length > 0 ? (
          <section className="mx-auto max-w-(--measure) px-(--gutter) py-(--section-y)">
            <Reveal>
              <div className="max-w-xl">
                <p className="eyebrow">Start here</p>
                <h2 className="display display-lg mt-6 text-ink">What are you making?</h2>
                <p className="lede mt-6">
                  Pick what you are making. The studios follow.
                </p>
              </div>
            </Reveal>

            <Reveal delay={100} className="mt-14">
              <CategoryExplorer categories={categoryEntries} />
            </Reveal>
          </section>
        ) : null}

        {/* ══ Discover ══════════════════════════════════════════
            An asymmetric spread rather than a grid. The lead studio
            gets the room it deserves; the others sit around it at
            their own sizes, the way a magazine lays out a feature. */}
        {showcase.length > 1 ? (
          <section className="mx-auto max-w-(--measure) px-(--gutter) pb-(--section-y)">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-6 border-b border-ink pb-6">
                <div className="max-w-lg">
                  <h2 className="display display-lg text-ink">Find the right place.</h2>
                  <p className="lede mt-5">
                    Browse by location, by availability, and by what you are making.
                  </p>
                </div>
                <Link
                  href="/discover"
                  className="group inline-flex shrink-0 items-center gap-2 pb-1 text-sm text-ink"
                >
                  <span className="border-b border-line-strong transition-colors group-hover:border-clay group-hover:text-clay-ink">
                    All {all.total} studios
                  </span>
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </Reveal>

            <div className="mt-12 grid gap-x-8 gap-y-16 lg:grid-cols-12">
              {showcase[1] ? (
                <Reveal className="lg:col-span-7">
                  <StudioObject
                    studio={showcase[1]}
                    hours={hours.get(showcase[1].id)}
                    day={dayWord}
                    ratio="aspect-4/3"
                    size="lead"
                  />
                </Reveal>
              ) : null}

              {/* Two stacked beside it, narrower and a different shape
                  — the change of proportion is what stops this reading
                  as a row of identical cards. */}
              <div className="grid gap-16 lg:col-span-5">
                {showcase.slice(2, 4).map((studio, index) => (
                  <Reveal key={studio.id} delay={80 + index * 80}>
                    <StudioObject
                      studio={studio}
                      hours={hours.get(studio.id)}
                      day={dayWord}
                      ratio="aspect-3/2"
                    />
                  </Reveal>
                ))}
              </div>

              {showcase.slice(4, 7).map((studio, index) => (
                <Reveal key={studio.id} delay={index * 80} className="lg:col-span-4">
                  <StudioObject
                    studio={studio}
                    hours={hours.get(studio.id)}
                    day={dayWord}
                    ratio="aspect-4/3"
                  />
                </Reveal>
              ))}
            </div>

            {areas.length > 0 ? (
              <Reveal delay={80}>
                <div className="mt-16 border-t border-line pt-8">
                  <p className="eyebrow">Start somewhere nearby</p>
                  <ul className="mt-6 flex flex-wrap gap-3">
                    {areas.map(([area, count]) => (
                      <li key={area}>
                        <Link
                          href={`/discover?q=${encodeURIComponent(area)}`}
                          className="inline-flex items-baseline gap-2 border border-line-strong px-4 py-2.5 transition-colors hover:border-ink hover:bg-stone"
                        >
                          <span className="text-sm text-ink">{area}</span>
                          <span className="tabular text-ink-soft">{count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ) : null}
          </section>
        ) : null}

        {/* ══ What a place is ═══════════════════════════════════
            The one bento on the site. Photography, metadata, price
            and live availability in a single composition, because
            those are the four things you actually weigh up when you
            are choosing where to work. */}
        {showcase.length >= 3 ? (
          <section className="border-y border-line bg-stone/45">
            <div className="mx-auto max-w-(--measure) px-(--gutter) py-(--section-y)">
              <Reveal>
                <div className="max-w-xl">
                  <h2 className="display display-lg text-ink">
                    A place is more
                    <br />
                    than four walls.
                  </h2>
                  <p className="lede mt-8">
                    The light at four in the afternoon. Whether the freight lift takes a
                    trolley. How quiet it goes when everyone stops talking.
                  </p>
                </div>
              </Reveal>

              <Reveal delay={100}>
                <PlaceBento
                  studios={showcase}
                  hours={hours}
                  day={dayWord}
                />
              </Reveal>
            </div>
          </section>
        ) : null}

        {/* ══ Booking ═══════════════════════════════════════════
            The hour strip is PL·CE's signature device, and this is it
            doing its actual job: real availability, read live from the
            studio's own calendar. */}
        <section className="mx-auto max-w-(--measure) px-(--gutter) py-(--section-y)">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <Reveal>
              <p className="eyebrow">Booking</p>
              <h2 className="display display-lg mt-6 text-ink">Found the place?</h2>
              <p className="lede mt-6">Pick your time. Book it. Get to work.</p>
              <p className="mt-6 max-w-sm leading-relaxed text-ink-muted">
                No enquiry forms, no waiting to hear back. You see the free hours and the price
                before you commit, because both are read from the calendar the studio actually
                runs on.
              </p>
            </Reveal>

            <Reveal delay={100}>
              <p className="eyebrow">Free {dayWord}</p>
              <ul className="mt-5 border-t border-ink">
                {showcase.slice(0, 4).map((studio) => {
                  const cells = hours.get(studio.id) ?? [];
                  return (
                    <li key={studio.id} className="border-b border-line">
                      <Link
                        href={`/studios/${studio.slug}`}
                        className="group grid items-center gap-x-8 gap-y-3 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]"
                      >
                        <div className="min-w-0">
                          <p className="display display-sm truncate text-ink transition-colors group-hover:text-clay-ink">
                            {studio.name}
                          </p>
                          <p className="meta mt-1 truncate">{studio.area}</p>
                        </div>

                        <div className="min-w-0">
                          {cells.length > 0 ? (
                            <HourStrip cells={cells} size="band" showScale />
                          ) : (
                            <p className="text-sm text-ink-soft">Hours on request</p>
                          )}
                        </div>

                        <div className="shrink-0 sm:text-right">
                          <p className="text-sm text-ink">{availabilitySummary(cells, dayWord)}</p>
                          <p className="tabular mt-1 text-ink-soft">
                            {formatMoney(studio.priceFrom)}/hr
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ══ The other side ════════════════════════════════════ */}
        <section className="mx-auto max-w-(--measure) px-(--gutter) pb-(--section-y)">
          <Reveal>
            <p className="display display-md text-ink-soft">Have a studio of your own?</p>
            <h2 className="display display-lg mt-6 max-w-2xl text-ink">
              Run it without running after it.
            </h2>
            <p className="lede mt-8">
              Bookings, customers, payments and your schedule, all in one calm place.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <CalendarShowcase spaceNames={openerSpaces.map((space) => space.name)} />
          </Reveal>
        </section>

        {/* ══ WhatsApp ══════════════════════════════════════════
            The strongest product moment, so it gets its own room, a
            change of material, and the only motion on the site. */}
        <section className="on-ink">
          <div className="mx-auto max-w-(--measure) px-(--gutter) py-(--section-y)">
            <div className="grid gap-16 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-20">
              <Reveal>
                <h2 className="display display-lg text-ink">
                  Just text
                  <br />
                  PL·CE.
                </h2>
                <p className="lede mt-8">Your studio can text back.</p>
                <p className="mt-6 max-w-sm leading-relaxed text-ink-muted">
                  Most studio bookings already happen in a chat. Send yours the same message
                  you would send a person, and it lands on the calendar as a real booking —
                  checked against the room, priced, and confirmed back to you.
                </p>
              </Reveal>

              <Reveal delay={120}>
                <WhatsAppStory />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ The loop ══════════════════════════════════════════ */}
        <section className="mx-auto max-w-(--measure) px-(--gutter) py-(--section-y)">
          <Reveal>
            <p className="eyebrow">One place</p>
          </Reveal>
          <ol className="mt-10 grid border-t border-ink sm:grid-cols-4">
            {[
              ['Discover', 'Studios, with the hours they have free.'],
              ['Book', 'The time, the price, done.'],
              ['Run', 'Every booking on one calendar.'],
              ['Return', 'The place you already know works.'],
            ].map(([title, line], index) => (
              <Reveal
                as="li"
                key={title}
                delay={index * 70}
                className="border-b border-line py-6 sm:pr-8"
              >
                <span className="dot mb-5 block text-clay" />
                <h3 className="display display-sm text-ink">{title}</h3>
                <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-ink-muted">{line}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ══ In someone else's words ═══════════════════════════
            A real review out of the database, or nothing at all. */}
        {quote && mostReviewed ? (
          <section className="border-y border-line bg-stone/45">
            <div className="mx-auto max-w-(--measure) px-(--gutter) py-(--section-y)">
              <Reveal>
                <figure className="max-w-4xl">
                  <blockquote className="display display-lg text-ink">
                    &ldquo;{quote.body}&rdquo;
                  </blockquote>
                  <figcaption className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-5">
                    <span className="text-sm text-ink">{quote.authorName}</span>
                    <span className="dot text-ink-soft" />
                    <Link
                      href={`/studios/${mostReviewed.slug}`}
                      className="meta transition-colors hover:text-clay-ink"
                    >
                      {mostReviewed.name} · {mostReviewed.area}
                    </Link>
                  </figcaption>
                </figure>
              </Reveal>
            </div>
          </section>
        ) : null}

        {/* ══ Two doors ═════════════════════════════════════════
            PL·CE has two audiences and they want opposite things.
            Asking them separately is more useful than one paragraph
            trying to address both at once. */}
        <section className="mx-auto max-w-(--measure) px-(--gutter) py-(--section-y)">
          <Reveal>
            <h2 className="display display-lg max-w-2xl text-ink">
              A better place
              <br />
              for better work.
            </h2>
          </Reveal>

          <div className="mt-16 grid border-t border-ink lg:grid-cols-2">
            <Reveal className="border-b border-line py-12 lg:border-r lg:pr-16">
              <p className="eyebrow">Looking for somewhere to make something?</p>
              <h3 className="display display-md mt-6 text-ink">Find your place.</h3>
              <Button asChild size="lg" className="mt-8">
                <Link href="/discover">
                  Explore studios
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </Reveal>

            <Reveal delay={100} className="border-b border-line py-12 lg:pl-16">
              <p className="eyebrow">Have a studio of your own?</p>
              <h3 className="display display-md mt-6 text-ink">Make it work harder.</h3>
              <Button asChild size="lg" variant="secondary" className="mt-8">
                <Link href="/studio">
                  Run your studio
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

/* ── Pieces ───────────────────────────────────────────────────── */

/**
 * A studio, presented as an object rather than as a card.
 *
 * No border, no panel, no shadow — the photograph is the object and
 * everything under it is a caption on the same paper as the page. The
 * proportion is passed in rather than fixed, because a spread where
 * every image is the same shape is a grid, and a grid is the thing we
 * are trying not to build.
 */
function StudioObject({
  studio,
  hours,
  day,
  ratio,
  size = 'normal',
  priority = false,
}: {
  studio: StudioSummary;
  hours?: HourCell[];
  day: string;
  ratio: string;
  size?: 'lead' | 'normal';
  priority?: boolean;
}) {
  return (
    <Link href={`/studios/${studio.slug}`} className="group block">
      <div className={cn('relative overflow-hidden bg-stone', ratio)}>
        <StudioImage
          src={studio.coverImage?.url}
          alt={studio.coverImage?.alt ?? studio.name}
          name={studio.name}
          sizes={
            size === 'lead' ? '(min-width: 1024px) 58vw, 100vw' : '(min-width: 1024px) 40vw, 100vw'
          }
          priority={priority}
          className="image-lift"
        />
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <h3
          className={cn(
            'display text-ink transition-colors group-hover:text-clay-ink',
            size === 'lead' ? 'display-md' : 'display-sm',
          )}
        >
          {studio.name}
        </h3>

        <p className="meta mt-2">
          {studio.area} · {studio.category.name}
        </p>

        <div className="mt-4 flex items-baseline justify-between gap-4">
          <p className="tabular text-ink">
            {formatMoney(studio.priceFrom)}
            <span className="text-ink-soft">/hr</span>
          </p>
          {hours && hours.length > 0 ? (
            <p className="text-xs text-ink-muted">{availabilitySummary(hours, day)}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/**
 * The one bento on the site.
 *
 * Used once, deliberately. A page built entirely of tiled boxes is a
 * dashboard; a page with a single composed block in it has a centrepiece.
 * The tiles are not interchangeable — each holds one of the four things
 * you actually weigh when choosing where to work: what it looks like,
 * where it is, when it is free, and what it costs.
 *
 * Everything in it is live. The availability tile is the same hour strip
 * the marketplace and the CRM draw from the booking engine.
 */
function PlaceBento({
  studios,
  hours,
  day,
}: {
  studios: StudioSummary[];
  hours: Map<string, HourCell[]>;
  day: string;
}) {
  const lead = studios[0];
  const second = studios[1];
  const third = studios[2];
  if (!lead || !second) return null;

  const leadCells = hours.get(lead.id) ?? [];

  return (
    <div className="mt-14 grid auto-rows-[8.5rem] grid-cols-2 gap-3 sm:auto-rows-[10rem] lg:grid-cols-3 lg:auto-rows-[11.5rem]">
      {/* The room itself, given the most space. */}
      <Link
        href={`/studios/${lead.slug}`}
        className="group relative col-span-2 row-span-2 overflow-hidden bg-stone-deep"
      >
        <StudioImage
          src={lead.coverImage?.url}
          alt={lead.coverImage?.alt ?? lead.name}
          name={lead.name}
          sizes="(min-width: 1024px) 58vw, 100vw"
          className="image-lift"
        />
        <div className="on-image absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/80 to-transparent p-5 pt-16">
          <p className="display display-sm text-ink">{lead.name}</p>
          <p className="mt-1 flex items-center gap-2 text-[0.6875rem] tracking-[0.16em] text-ink-muted uppercase">
            <span className="dot text-clay" />
            {lead.area} · {lead.city}
          </p>
        </div>
      </Link>

      {/* When it is free — the thing no other marketplace shows. */}
      <div className="flex flex-col justify-between border border-line bg-surface p-4">
        <p className="eyebrow">Free {day}</p>
        {leadCells.length > 0 ? (
          <>
            <div className="my-3">
              <HourStrip cells={leadCells} size="band" />
            </div>
            <p className="text-xs text-ink-muted">{availabilitySummary(leadCells, day)}</p>
          </>
        ) : (
          <p className="text-xs text-ink-soft">Hours on request</p>
        )}
      </div>

      {/* What it costs. Ink, because price is the thing people scan for. */}
      <div className="on-ink flex flex-col justify-between p-4">
        <p className="eyebrow">From</p>
        <p className="display display-md text-ink">{formatMoney(lead.priceFrom)}</p>
        <p className="text-xs text-ink-muted">
          per hour · {lead.spaceCount} {lead.spaceCount === 1 ? 'space' : 'spaces'}
        </p>
      </div>

      <Link
        href={`/studios/${second.slug}`}
        className="group relative col-span-2 overflow-hidden bg-stone-deep lg:col-span-1"
      >
        <StudioImage
          src={second.coverImage?.url}
          alt={second.coverImage?.alt ?? second.name}
          name={second.name}
          sizes="(min-width: 1024px) 30vw, 100vw"
          className="image-lift"
        />
        <span className="on-image absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/75 to-transparent p-3 pt-10 text-[0.6875rem] tracking-[0.14em] text-ink uppercase">
          {second.area}
        </span>
      </Link>

      {third ? (
        <Link
          href={`/studios/${third.slug}`}
          className="group relative col-span-2 overflow-hidden bg-stone-deep"
        >
          <StudioImage
            src={third.coverImage?.url}
            alt={third.coverImage?.alt ?? third.name}
            name={third.name}
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="image-lift"
          />
          <span className="on-image absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/75 to-transparent p-3 pt-10 text-[0.6875rem] tracking-[0.14em] text-ink uppercase">
            {third.name} · {third.area}
          </span>
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The CRM, shown rather than described.
 *
 * A depiction of the schedule, not a live one: a public page has no
 * business rendering somebody's customers. So it uses the studio's real
 * space names — which are public, they appear on the listing — with
 * illustrative times and nobody's name attached, drawn with the same
 * tokens and the same status language as the real calendar. What you
 * see here is what you get when you sign in.
 */
function CalendarShowcase({ spaceNames }: { spaceNames: string[] }) {
  const columns = (
    spaceNames.length > 0 ? spaceNames : ['Main Studio', 'Cyclorama', 'Podcast Room']
  ).slice(0, 3);

  const TONE = {
    settled: { chip: 'border-l-olive bg-olive-soft', dot: 'bg-olive', label: 'Confirmed · Paid' },
    attention: { chip: 'border-l-clay bg-clay-soft', dot: 'bg-clay', label: 'Payment pending' },
    waiting: { chip: 'border-l-butter bg-butter-soft', dot: 'bg-butter', label: 'Pending' },
    muted: { chip: 'border-l-line-strong bg-stone/60', dot: 'bg-ink-soft', label: 'Cancelled' },
  } as const;

  const blocks: Array<{
    column: number;
    top: string;
    height: string;
    time: string;
    tone: keyof typeof TONE;
  }> = [
    { column: 0, top: '4%', height: '30%', time: '10:00 — 13:00', tone: 'settled' },
    { column: 1, top: '25%', height: '30%', time: '12:00 — 15:00', tone: 'attention' },
    { column: 2, top: '60%', height: '21%', time: '16:00 — 18:00', tone: 'waiting' },
    { column: 0, top: '68%', height: '21%', time: '18:30 — 20:30', tone: 'muted' },
  ];

  return (
    <div className="mt-14 overflow-hidden border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="display display-sm text-ink">Today</p>
        <p className="meta">PL·CE Studio</p>
      </div>

      <div className="grid grid-cols-[3rem_repeat(3,minmax(0,1fr))]">
        <div className="border-r border-line" />
        {columns.map((name) => (
          <div key={name} className="border-r border-line px-3 py-2.5 last:border-r-0">
            <p className="truncate text-xs font-medium text-ink">{name}</p>
          </div>
        ))}
      </div>

      <div className="grid h-[19rem] grid-cols-[3rem_repeat(3,minmax(0,1fr))] border-t border-line">
        <div className="relative border-r border-line">
          {['10', '12', '14', '16', '18', '20'].map((hour, index) => (
            <span
              key={hour}
              className="tabular absolute right-2 -translate-y-1/2 text-[0.625rem] text-ink-soft"
              style={{ top: `${8 + index * 17}%` }}
            >
              {hour}:00
            </span>
          ))}
        </div>

        {columns.map((name, column) => (
          <div key={name} className="relative border-r border-line last:border-r-0">
            {[1, 2, 3, 4, 5].map((row) => (
              <div
                key={row}
                className="absolute inset-x-0 border-b border-line-soft"
                style={{ top: `${row * 17}%` }}
              />
            ))}

            {blocks
              .filter((block) => block.column === column)
              .map((block) => (
                <div
                  key={block.time}
                  className={cn(
                    'absolute inset-x-1 overflow-hidden border-l-2 px-2 py-1.5',
                    TONE[block.tone].chip,
                  )}
                  style={{ top: block.top, height: block.height }}
                >
                  <p className="tabular text-[0.625rem] text-ink-muted">{block.time}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[0.6875rem] text-ink">
                    <span className={cn('dot', TONE[block.tone].dot)} />
                    <span className="truncate">{TONE[block.tone].label}</span>
                  </p>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

/** Counts of each value, most common first. */
function countBy(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
