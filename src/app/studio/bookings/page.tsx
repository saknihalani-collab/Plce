import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarPlus, Search } from 'lucide-react';

import { BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { presentBooking, TONE_DOT } from '@/features/studio/lib/booking-status';
import { requireStudioContext } from '@/features/studio/lib/context';
import { formatBookingWhen, formatMoney, pluralise } from '@/lib/format';
import { todayInZone, zonedToInstant } from '@/lib/time';
import { cn, parseIntOrNull } from '@/lib/utils';
import { BOOKING_SOURCE_LABELS, type BookingStatus } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Bookings', robots: { index: false } };

const PAGE_SIZE = 25;

const TABS: Array<{ key: string; label: string; statuses?: BookingStatus[] }> = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending', statuses: ['pending'] },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled', 'no_show'] },
];

export default async function StudioBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { repository, studio, organizationId } = await requireStudioContext('/studio/bookings');
  const params = await searchParams;

  const tabKey = single(params.tab) ?? 'upcoming';
  const tab = TABS.find((candidate) => candidate.key === tabKey) ?? TABS[0]!;
  const page = Math.max(1, parseIntOrNull(single(params.page)) ?? 1);
  const spaceId = single(params.space);

  const today = todayInZone(studio.timezone);
  const dayStart = zonedToInstant(today, '00:00', studio.timezone).toISOString();

  const results = await repository.listBookings(organizationId, {
    page,
    pageSize: PAGE_SIZE,
    filters: {
      status: tab.statuses,
      spaceId: spaceId || undefined,
      from: tab.key === 'upcoming' ? dayStart : undefined,
      paymentStatus: tab.key === 'unpaid' ? ['unpaid', 'partial'] : undefined,
    },
  });

  // Upcoming reads forwards; every other view is a ledger and reads back.
  const rows =
    tab.key === 'upcoming'
      ? [...results.items].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      : results.items;

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Bookings</p>
          <h1 className="display mt-3 text-4xl text-ink">
            {pluralise(results.total, 'booking')}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action="/studio/bookings" method="get" className="flex gap-2">
            <input type="hidden" name="tab" value={tab.key} />
            <select name="space" defaultValue={spaceId ?? ''} aria-label="Space" className="field">
              <option value="">All spaces</option>
              {studio.spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary">
              <Search className="size-4" />
            </button>
          </form>

          <Button asChild size="sm">
            <Link href="/studio/bookings/new">
              <CalendarPlus className="size-4" />
              Add booking
            </Link>
          </Button>
        </div>
      </div>

      <nav className="mt-8 flex flex-wrap gap-1.5" aria-label="Filter bookings">
        {TABS.map((candidate) => (
          <Link
            key={candidate.key}
            href={`/studio/bookings?tab=${candidate.key}${spaceId ? `&space=${spaceId}` : ''}`}
            aria-current={candidate.key === tab.key ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              candidate.key === tab.key
                ? 'border-clay bg-clay/15 text-clay-ink'
                : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {candidate.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            className="border-line"
            title={tab.key === 'upcoming' ? 'Nothing booked ahead' : 'No bookings in this view'}
            description="Bookings from PL·CE, WhatsApp and walk-ins all land here."
            action={
              <Button asChild size="sm">
                <Link href="/studio/bookings/new">Add a booking</Link>
              </Button>
            }
          />
        ) : (
          <ul className="card divide-y divide-line-soft">
            {rows.map((booking) => (
              <li key={booking.id}>
                <Link
                  href={`/studio/bookings/${booking.id}`}
                  className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4 transition-colors hover:bg-stone"
                >
                  {/* The same tone the calendar uses, so a row and a chip
                      mean the same thing at a glance. */}
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      TONE_DOT[presentBooking(booking).tone],
                    )}
                  />
                  <span className="min-w-[13rem] flex-1">
                    <span className="block text-sm text-ink">{booking.customerName}</span>
                    <span className="block text-xs text-ink-soft">
                      {booking.spaceName} · {BOOKING_SOURCE_LABELS[booking.source]}
                    </span>
                  </span>

                  <span className="min-w-[11rem] text-sm text-ink-muted">
                    {formatBookingWhen(booking.startsAt, booking.endsAt, booking.timezone, today)}
                  </span>

                  <span className="tabular w-20 text-right text-sm text-ink">
                    {formatMoney(booking.priceAmount)}
                  </span>

                  <span className="flex shrink-0 gap-2">
                    <BookingStatusBadge status={booking.status} />
                    <PaymentStatusBadge status={booking.paymentStatus} />
                  </span>

                  <span className="tabular w-24 shrink-0 text-right text-xs text-ink-soft">
                    {booking.reference}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {results.total > PAGE_SIZE ? (
        <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
          {page > 1 ? (
            <Link
              href={`/studio/bookings?tab=${tab.key}&page=${page - 1}`}
              className="btn btn-secondary btn-sm"
            >
              Previous
            </Link>
          ) : (
            <span className="btn btn-secondary btn-sm opacity-40">Previous</span>
          )}
          <span className="tabular text-sm text-ink-soft">
            Page {page} of {Math.ceil(results.total / PAGE_SIZE)}
          </span>
          {results.hasMore ? (
            <Link
              href={`/studio/bookings?tab=${tab.key}&page=${page + 1}`}
              className="btn btn-secondary btn-sm"
            >
              Next
            </Link>
          ) : (
            <span className="btn btn-secondary btn-sm opacity-40">Next</span>
          )}
        </nav>
      ) : null}
    </div>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
