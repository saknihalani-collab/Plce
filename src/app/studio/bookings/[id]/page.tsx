import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/badge';
import { BookingControls } from '@/features/studio/components/booking-controls';
import { requireStudioContext } from '@/features/studio/lib/context';
import {
  formatBookingWhen,
  formatDuration,
  formatMoney,
  formatPhone,
  formatRelativeTime,
} from '@/lib/format';
import { todayInZone } from '@/lib/time';
import { BOOKING_SOURCE_LABELS } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Booking', robots: { index: false } };

export default async function StudioBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { repository, studio, organizationId } = await requireStudioContext('/studio/bookings');

  const booking = await repository.getBooking(id);
  // A booking id from another organisation is a 404 here, not a
  // permission error — this studio has no business knowing it exists.
  if (!booking || booking.organizationId !== organizationId) notFound();

  const [events, customer] = await Promise.all([
    repository.listBookingEvents(booking.id),
    repository.getCustomer(organizationId, booking.customerId),
  ]);

  const today = todayInZone(booking.timezone);

  return (
    <div className="max-w-4xl">
      <Link
        href="/studio/bookings"
        className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-clay-ink"
      >
        <ArrowLeft className="size-4" />
        Bookings
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="tabular eyebrow">{booking.reference}</p>
          <h1 className="display mt-3 text-4xl text-ink">{booking.customerName}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {booking.spaceName} ·{' '}
            {formatBookingWhen(booking.startsAt, booking.endsAt, booking.timezone, today)} ·{' '}
            {formatDuration(booking.startsAt, booking.endsAt)}
          </p>
        </div>

        <div className="flex gap-2">
          <BookingStatusBadge status={booking.status} />
          <PaymentStatusBadge status={booking.paymentStatus} />
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="eyebrow mb-4">Details</h2>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Detail label="Value">{formatMoney(booking.priceAmount)}</Detail>
              <Detail label="Came from">{BOOKING_SOURCE_LABELS[booking.source]}</Detail>
              <Detail label="People">{booking.guestCount ?? '—'}</Detail>
              <Detail label="Booked">{formatRelativeTime(booking.createdAt)}</Detail>
              <Detail label="Phone">{formatPhone(booking.customerPhone)}</Detail>
              <Detail label="Email">{booking.customerEmail ?? '—'}</Detail>
            </dl>

            {booking.notes ? (
              <div className="mt-5 border-t border-line pt-4">
                <p className="eyebrow mb-1.5">Note</p>
                <p className="text-sm leading-relaxed text-ink-muted">{booking.notes}</p>
              </div>
            ) : null}

            {booking.cancellationReason ? (
              <div className="mt-5 border-t border-line pt-4">
                <p className="eyebrow mb-1.5">Cancellation reason</p>
                <p className="text-sm leading-relaxed text-ink-muted">
                  {booking.cancellationReason}
                </p>
              </div>
            ) : null}
          </section>

          {customer ? (
            <section className="card p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="eyebrow">Customer</h2>
                <Link
                  href={`/studio/customers/${customer.id}`}
                  className="text-xs text-ink-muted hover:text-clay-ink"
                >
                  Open record →
                </Link>
              </div>

              <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-3">
                <Detail label="Bookings">{customer.totalBookings}</Detail>
                <Detail label="Spend">{formatMoney(customer.totalSpend)}</Detail>
                <Detail label="Last visit">
                  {customer.lastBookingAt ? formatRelativeTime(customer.lastBookingAt) : '—'}
                </Detail>
              </dl>

              {customer.notes ? (
                <p className="mt-4 rounded-[--radius-sm] bg-stone px-3 py-2.5 text-sm text-ink-muted">
                  {customer.notes}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="card p-5">
            <h2 className="eyebrow mb-4">History</h2>
            <ol className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">
                      {event.type.replace('booking.', '').replace(/_/g, ' ')}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {event.actorName}
                      {event.message ? ` · ${event.message}` : ''}
                    </span>
                    {/*
                      Provenance for anything the owner did not type in
                      themselves. A booking that arrived by text can be
                      traced back to the message that made it.
                    */}
                    {whatsappMessageId(event.metadata) ? (
                      <span className="tabular mt-0.5 block text-[0.625rem] text-ink-soft">
                        WhatsApp message {whatsappMessageId(event.metadata)}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {formatRelativeTime(event.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <BookingControls
            booking={booking}
            spaces={studio.spaces.filter((space) => space.isActive)}
          />
        </aside>
      </div>
    </div>
  );
}

/** The Meta (or console) message id recorded on a WhatsApp booking event. */
function whatsappMessageId(metadata: Record<string, unknown> | null): string | null {
  if (!metadata || metadata.channel !== 'whatsapp') return null;
  const id = metadata.whatsappMessageId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="tabular mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}
