import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarPlus } from 'lucide-react';

import { BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { CustomerForm } from '@/features/studio/components/customer-form';
import { requireStudioContext } from '@/features/studio/lib/context';
import {
  formatBookingWhen,
  formatDate,
  formatMoney,
  formatPhone,
  formatRelativeTime,
  pluralise,
} from '@/lib/format';
import { todayInZone } from '@/lib/time';
import { initialsOf } from '@/lib/utils';
import { BOOKING_SOURCE_LABELS } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Customer', robots: { index: false } };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repository, studio, organizationId } = await requireStudioContext('/studio/customers');

  const customer = await repository.getCustomer(organizationId, id);
  if (!customer) notFound();

  const bookings = await repository.listBookings(organizationId, {
    filters: { customerId: customer.id },
    pageSize: 50,
  });

  const today = todayInZone(studio.timezone);
  const now = new Date().toISOString();
  const upcoming = bookings.items.filter(
    (booking) => booking.startsAt >= now && booking.status !== 'cancelled',
  );

  return (
    <div className="max-w-4xl">
      <Link
        href="/studio/customers"
        className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-clay-ink"
      >
        <ArrowLeft className="size-4" />
        Customers
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-full bg-stone text-sm font-semibold text-ink">
            {initialsOf(customer.name)}
          </span>
          <div>
            <h1 className="display text-4xl text-ink">{customer.name}</h1>
            <p className="tabular mt-1 text-sm text-ink-muted">
              {formatPhone(customer.phone)}
              {customer.email ? ` · ${customer.email}` : ''}
            </p>
          </div>
        </div>

        <Button asChild size="sm">
          <Link href="/studio/bookings/new">
            <CalendarPlus className="size-4" />
            Book them in
          </Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        <Stat label="Bookings" value={String(customer.totalBookings)} />
        <Stat label="Total spend" value={formatMoney(customer.totalSpend)} />
        <Stat
          label="Last visit"
          value={customer.lastBookingAt ? formatRelativeTime(customer.lastBookingAt) : '—'}
        />
        <Stat
          label="Next visit"
          value={
            customer.nextBookingAt
              ? formatDate(customer.nextBookingAt.slice(0, 10), { year: false })
              : '—'
          }
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {upcoming.length > 0 ? (
            <section className="card p-5">
              <h2 className="eyebrow mb-4">Coming up</h2>
              <ul className="divide-y divide-line-soft">
                {upcoming.map((booking) => (
                  <li key={booking.id}>
                    <Link
                      href={`/studio/bookings/${booking.id}`}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0"
                    >
                      <span>
                        <span className="block text-sm text-ink">
                          {formatBookingWhen(
                            booking.startsAt,
                            booking.endsAt,
                            booking.timezone,
                            today,
                          )}
                        </span>
                        <span className="block text-xs text-ink-soft">
                          {booking.spaceName}
                        </span>
                      </span>
                      <span className="tabular text-sm text-ink-muted">
                        {formatMoney(booking.priceAmount)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card p-5">
            <h2 className="eyebrow mb-4">
              Booking history · {pluralise(bookings.total, 'booking')}
            </h2>

            {bookings.items.length === 0 ? (
              <EmptyState
                className="border-line"
                title="No bookings yet"
                description="Once they book, everything they have ever taken shows up here."
              />
            ) : (
              <ul className="divide-y divide-line-soft">
                {bookings.items.map((booking) => (
                  <li key={booking.id}>
                    <Link
                      href={`/studio/bookings/${booking.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0"
                    >
                      <span className="min-w-[11rem] flex-1 text-sm text-ink-muted">
                        {formatBookingWhen(
                          booking.startsAt,
                          booking.endsAt,
                          booking.timezone,
                          today,
                        )}
                      </span>
                      <span className="w-28 text-xs text-ink-soft">
                        {booking.spaceName}
                      </span>
                      <span className="w-20 text-xs text-ink-soft">
                        {BOOKING_SOURCE_LABELS[booking.source]}
                      </span>
                      <span className="tabular w-20 text-right text-sm text-ink">
                        {formatMoney(booking.priceAmount)}
                      </span>
                      <span className="flex gap-1.5">
                        <BookingStatusBadge status={booking.status} />
                        <PaymentStatusBadge status={booking.paymentStatus} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside>
          <section className="card p-5">
            <h2 className="eyebrow mb-4">Edit</h2>
            <CustomerForm customer={customer} />
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className="tabular mt-2 truncate text-xl text-ink">{value}</p>
    </div>
  );
}
