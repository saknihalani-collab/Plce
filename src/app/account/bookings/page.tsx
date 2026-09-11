import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { requireSession } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { formatBookingWhen, formatMoney } from '@/lib/format';
import { todayInZone } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'My bookings', robots: { index: false } };

export default async function MyBookingsPage() {
  const session = await requireSession('/account/bookings');
  const repository = await getRepository();

  const bookings = await repository.listBookingsForUser(session.user.id);
  const now = new Date().toISOString();

  const upcoming = bookings
    .filter((booking) => booking.endsAt >= now && booking.status !== 'cancelled')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = bookings.filter(
    (booking) => booking.endsAt < now || booking.status === 'cancelled',
  );

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[880px] px-5 py-10 sm:px-8">
        <p className="eyebrow">Your account</p>
        <h1 className="display mt-3 text-4xl text-ink">My bookings</h1>

        {bookings.length === 0 ? (
          <EmptyState
            className="mt-10"
            title="No bookings yet"
            description="When you book a studio on PL·CE it turns up here, with the reference and the address."
            action={
              <Button asChild>
                <Link href="/discover">Explore studios</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Group title="Upcoming" bookings={upcoming} emptyLabel="Nothing booked ahead." />
            <Group title="Past" bookings={past} emptyLabel="Nothing yet." />
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function Group({
  title,
  bookings,
  emptyLabel,
}: {
  title: string;
  bookings: Awaited<ReturnType<Awaited<ReturnType<typeof getRepository>>['listBookingsForUser']>>;
  emptyLabel: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="eyebrow mb-4">{title}</h2>

      {bookings.length === 0 ? (
        <p className="text-sm text-ink-subtle">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-line-soft rounded-[--radius] border border-line-soft bg-surface">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <Link
                href={`/bookings/${booking.reference}`}
                className="flex flex-wrap items-center justify-between gap-4 p-5 transition-colors hover:bg-surface-sunken"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">{booking.studioName}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {booking.spaceName} ·{' '}
                    {formatBookingWhen(
                      booking.startsAt,
                      booking.endsAt,
                      booking.timezone,
                      todayInZone(booking.timezone),
                    )}
                  </p>
                  <p className="tabular mt-1 text-xs text-ink-subtle">{booking.reference}</p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="tabular text-ink">{formatMoney(booking.priceAmount)}</span>
                  <BookingStatusBadge status={booking.status} />
                  <PaymentStatusBadge status={booking.paymentStatus} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
