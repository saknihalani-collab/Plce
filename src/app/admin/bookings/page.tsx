import type { Metadata } from 'next';
import { Search } from 'lucide-react';

import { BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { formatBookingWhen, formatMoney, pluralise } from '@/lib/format';
import { parseIntOrNull } from '@/lib/utils';
import { BOOKING_SOURCE_LABELS } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Bookings', robots: { index: false } };

const PAGE_SIZE = 30;

/**
 * Platform-wide bookings.
 *
 * Read-only on purpose. PL·CE can see every booking for support and for
 * disputes, but moving or cancelling someone's booking belongs to the
 * studio that took it — an admin reaching into a studio's calendar is a
 * different product decision, and not one this build makes.
 */
export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin('/admin/bookings');
  const params = await searchParams;

  const query = single(params.q)?.trim() ?? '';
  const page = Math.max(1, parseIntOrNull(single(params.page)) ?? 1);

  const repository = await getRepository();
  const results = await repository.listBookingsForAdmin({
    filters: { q: query || undefined },
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Across PL·CE</p>
          <h1 className="display mt-3 text-4xl text-ink">Bookings</h1>
          <p className="mt-2 text-sm text-ink-muted">{pluralise(results.total, 'booking')}</p>
        </div>

        <form action="/admin/bookings" method="get" className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Booking reference"
            aria-label="Search bookings by reference"
            className="field pl-9"
          />
        </form>
      </div>

      <div className="card mt-8 overflow-hidden">
        {results.items.length === 0 ? (
          <EmptyState
            className="border-0"
            title="No bookings match"
            description="Search by reference — PLCE-8F42K, or just the last few characters."
          />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th className="py-3 pl-4">Reference</th>
                  <th>Studio</th>
                  <th>Space</th>
                  <th>Customer</th>
                  <th>When</th>
                  <th>Source</th>
                  <th>Value</th>
                  <th className="pr-4">State</th>
                </tr>
              </thead>
              <tbody>
                {results.items.map((booking) => (
                  <tr key={booking.id}>
                    <td className="tabular pl-4 text-ink">{booking.reference}</td>
                    <td className="text-ink-muted">
                      {booking.studioName}
                      <span className="block text-xs text-ink-soft">{booking.studioCity}</span>
                    </td>
                    <td className="text-ink-muted">{booking.spaceName}</td>
                    <td className="text-ink-muted">
                      {booking.customerName}
                      <span className="tabular block text-xs text-ink-soft">
                        {booking.customerPhone ?? '—'}
                      </span>
                    </td>
                    <td className="text-ink-muted">
                      {formatBookingWhen(booking.startsAt, booking.endsAt, booking.timezone)}
                    </td>
                    <td className="text-ink-soft">
                      {BOOKING_SOURCE_LABELS[booking.source]}
                    </td>
                    <td className="tabular text-ink">{formatMoney(booking.priceAmount)}</td>
                    <td className="pr-4">
                      <div className="flex flex-col items-start gap-1">
                        <BookingStatusBadge status={booking.status} />
                        <PaymentStatusBadge status={booking.paymentStatus} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {results.total > PAGE_SIZE ? (
        <p className="tabular mt-6 text-center text-sm text-ink-soft">
          Page {page} of {Math.ceil(results.total / PAGE_SIZE)}
        </p>
      ) : null}
    </div>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
