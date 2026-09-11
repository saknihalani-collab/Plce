import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarCheck, MapPin } from 'lucide-react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getRepository } from '@/lib/data';
import {
  formatBookingWhen,
  formatDuration,
  formatMoney,
  formatPhone,
} from '@/lib/format';
import { normaliseBookingReference } from '@/lib/ids';
import { todayInZone } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your booking', robots: { index: false } };

export default async function BookingConfirmationPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const repository = await getRepository();

  const booking = await repository.getBookingByReference(
    normaliseBookingReference(decodeURIComponent(reference)),
  );
  if (!booking) notFound();

  const studio = await repository.getPublicStudio(booking.studioId);
  const today = todayInZone(booking.timezone);

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[720px] px-5 py-12 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-olive-soft text-olive-ink">
            <CalendarCheck className="size-5" />
          </span>
          <div>
            <p className="eyebrow">Booking {booking.reference}</p>
            <h1 className="display mt-1 text-3xl text-ink">
              {booking.status === 'cancelled'
                ? 'This booking was cancelled'
                : booking.status === 'pending'
                  ? "You're on the list"
                  : "You're booked"}
            </h1>
          </div>
        </div>

        <p className="mt-4 text-ink-muted">
          {booking.status === 'pending'
            ? `${booking.studioName} confirms bookings by hand. They will be in touch shortly.`
            : booking.status === 'cancelled'
              ? booking.cancellationReason ?? 'The studio cancelled this booking.'
              : `${booking.studioName} is expecting you. Keep this reference — it is how the studio finds your booking.`}
        </p>

        <div className="card mt-8 divide-y divide-line-soft">
          <div className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="display text-2xl text-ink">{booking.studioName}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
                  <MapPin className="size-4 text-ink-subtle" />
                  {booking.spaceName} · {booking.studioCity}
                </p>
              </div>
              <div className="flex gap-2">
                <BookingStatusBadge status={booking.status} />
                <PaymentStatusBadge status={booking.paymentStatus} />
              </div>
            </div>
          </div>

          <dl className="grid gap-x-8 gap-y-4 p-6 sm:grid-cols-2">
            <Row label="When">
              {formatBookingWhen(booking.startsAt, booking.endsAt, booking.timezone, today)}
            </Row>
            <Row label="How long">{formatDuration(booking.startsAt, booking.endsAt)}</Row>
            <Row label="Reference">
              <span className="tabular">{booking.reference}</span>
            </Row>
            <Row label="Total">{formatMoney(booking.priceAmount)}</Row>
            <Row label="Booked for">{booking.customerName}</Row>
            <Row label="Contact">{formatPhone(booking.customerPhone)}</Row>
            {booking.guestCount ? <Row label="People">{booking.guestCount}</Row> : null}
          </dl>

          {booking.notes ? (
            <div className="p-6">
              <p className="eyebrow mb-2">Your note to the studio</p>
              <p className="text-sm text-ink-muted">{booking.notes}</p>
            </div>
          ) : null}

          {booking.paymentStatus === 'unpaid' && booking.status !== 'cancelled' ? (
            <div className="bg-surface-sunken p-6">
              <p className="text-sm font-medium text-ink">Payment</p>
              <p className="mt-1 text-sm text-ink-muted">
                Settle {formatMoney(booking.priceAmount)} with the studio on the day. They
                will mark it paid here once it is.
              </p>
            </div>
          ) : null}
        </div>

        {studio ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link href={`/studios/${studio.slug}`}>View the studio</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/account/bookings">All my bookings</Link>
            </Button>
          </div>
        ) : null}

        {studio?.rules.length ? (
          <section className="mt-10 border-t border-line-soft pt-8">
            <h2 className="eyebrow mb-3">Before you arrive</h2>
            <ul className="space-y-2 text-sm text-ink-muted">
              {studio.rules.map((rule) => (
                <li key={rule} className="flex gap-2">
                  <span className="text-ink-subtle">·</span>
                  {rule}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <SiteFooter />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  );
}
