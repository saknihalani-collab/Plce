import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { StudioImage } from '@/components/ui/studio-image';
import { BookingForm } from '@/features/booking/components/booking-form';
import { getSession } from '@/lib/auth/session';
import { checkRange, priceFor } from '@/lib/booking/availability';
import { availabilityContext } from '@/lib/booking/engine';
import { getRepository } from '@/lib/data';
import { getPaymentProvider } from '@/lib/payments/provider';
import { formatDateWithDay, formatMoney, formatTimeRange } from '@/lib/format';
import { isValidDateString, minutesToTime, timeToMinutes, zonedToInstant } from '@/lib/time';
import { parseIntOrNull } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Confirm your booking' };

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function BookPage({
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
  if (!studio) notFound();

  const spaceId = single(search.space);
  const space = studio.spaces.find((candidate) => candidate.id === spaceId);
  const date = single(search.date);
  const startTime = single(search.start);
  const durationMinutes = parseIntOrNull(single(search.duration)) ?? 60;

  // An incomplete link is a navigation mistake, not an error worth a
  // page: send them back to the panel where the choice is made.
  if (!space || !date || !isValidDateString(date) || !startTime || timeToMinutes(startTime) == null) {
    redirect(`/studios/${studio.slug}#book`);
  }

  const startsAt = zonedToInstant(date, startTime, studio.timezone);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  const endTime = minutesToTime((timeToMinutes(startTime) ?? 0) + durationMinutes);

  // Re-checked here so a stale link shows why it is stale rather than
  // failing at submit. The engine checks again at the moment of writing.
  const context = await availabilityContext(
    repository,
    studio,
    space,
    startsAt.toISOString(),
    endsAt.toISOString(),
    new Date(),
  );
  const verdict = checkRange(context, startsAt.toISOString(), endsAt.toISOString());

  const price = priceFor(space, startsAt.toISOString(), endsAt.toISOString());
  const session = await getSession();
  const payments = getPaymentProvider();

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[1000px] px-5 py-10 sm:px-8">
        <Link
          href={`/studios/${studio.slug}#book`}
          className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-clay-ink"
        >
          <ArrowLeft className="size-4" />
          Back to {studio.name}
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="eyebrow">Almost there</p>
            <h1 className="display mt-3 text-4xl text-ink">Confirm your booking</h1>

            {verdict.ok ? (
              <div className="mt-8">
                <BookingForm
                  studio={studio}
                  space={space}
                  date={date}
                  startTime={startTime}
                  durationMinutes={durationMinutes}
                  viewer={session?.user ?? null}
                />
              </div>
            ) : (
              <div className="mt-8 rounded-[--radius] border border-butter-line bg-butter-soft p-6">
                <p className="font-medium text-butter-ink">That slot has gone</p>
                <p className="mt-2 text-sm text-butter-ink/90">{verdict.message}</p>
                <Link
                  href={`/studios/${studio.slug}?space=${space.id}&date=${date}&duration=${durationMinutes}#book`}
                  className="btn btn-primary mt-5"
                >
                  Pick another time
                </Link>
              </div>
            )}
          </div>

          {/* Summary */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="card overflow-hidden">
              <div className="relative aspect-[3/2] bg-surface-sunken">
                <StudioImage
                  src={studio.coverImage?.url}
                  alt={studio.name}
                  name={studio.name}
                  sizes="360px"
                />
              </div>

              <div className="p-5">
                <p className="display text-xl text-ink">{studio.name}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {studio.location.area}, {studio.location.city}
                </p>

                <dl className="mt-5 space-y-3 border-t border-line-soft pt-5 text-sm">
                  <Row label="Space">{space.name}</Row>
                  <Row label="Date">{formatDateWithDay(date)}</Row>
                  <Row label="Time">{formatTimeRange(startTime, endTime)}</Row>
                  <Row label="Length">{durationMinutes / 60} hours</Row>
                </dl>

                <div className="mt-5 flex items-baseline justify-between border-t border-line-soft pt-5">
                  <span className="text-sm text-ink-muted">Total</span>
                  <span className="text-lg font-medium text-ink">{formatMoney(price)}</span>
                </div>

                <p className="mt-3 rounded-[--radius-sm] bg-surface-sunken px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
                  {payments.collectsOnline
                    ? 'You will be taken to a secure payment page after confirming.'
                    : 'Pay the studio directly on the day. Your booking is held either way, and the studio marks it paid once settled.'}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
