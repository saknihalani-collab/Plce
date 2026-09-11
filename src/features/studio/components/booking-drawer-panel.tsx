import Link from 'next/link';

import { BookingDrawer, DrawerActions } from '@/features/studio/components/booking-drawer';
import { StatusPair } from '@/features/studio/components/status-pair';
import { getRepository } from '@/lib/data';
import {
  formatBookingWhen,
  formatDuration,
  formatMoney,
  formatPhone,
  formatRelativeTime,
} from '@/lib/format';
import { todayInZone } from '@/lib/time';
import { BOOKING_SOURCE_LABELS } from '@/types/domain';

/**
 * Everything about one booking, without leaving the schedule.
 *
 * Rendered on the server from the same repository the calendar used, so
 * the drawer cannot disagree with the grid behind it. The booking is
 * re-checked against the organisation here rather than trusted from the
 * URL — a booking id in a query string is an input like any other.
 */
export async function BookingDrawerPanel({
  bookingId,
  organizationId,
  closeHref,
}: {
  bookingId: string;
  organizationId: string;
  closeHref: string;
}) {
  const repository = await getRepository();
  const booking = await repository.getBooking(bookingId);

  if (!booking || booking.organizationId !== organizationId) {
    return (
      <BookingDrawer closeHref={closeHref} title="Not found">
        <p className="text-sm text-ink-muted">
          That booking is no longer here. It may have been cancelled and removed, or it
          belongs to another studio.
        </p>
      </BookingDrawer>
    );
  }

  const [events, customer] = await Promise.all([
    repository.listBookingEvents(booking.id),
    repository.getCustomer(organizationId, booking.customerId),
  ]);

  const today = todayInZone(booking.timezone);
  /*
    There is no `amount_paid` column — payment is tracked as a status,
    not a ledger. So "outstanding" is only knowable at the two ends, and
    a part-paid booking says so rather than inventing a figure the studio
    never told us.
  */
  const settled = booking.paymentStatus === 'paid' || booking.paymentStatus === 'refunded';
  const partial = booking.paymentStatus === 'partial';

  return (
    <BookingDrawer closeHref={closeHref} title={booking.customerName}>
      <div className="space-y-6">
        <StatusPair booking={booking} />

        {/* When */}
        <Section title="Booking">
          <Row label="When">
            {formatBookingWhen(booking.startsAt, booking.endsAt, booking.timezone, today)}
          </Row>
          <Row label="Length">{formatDuration(booking.startsAt, booking.endsAt)}</Row>
          <Row label="Space">{booking.spaceName}</Row>
          <Row label="Reference">
            <span className="tabular">{booking.reference}</span>
          </Row>
          <Row label="Source">{BOOKING_SOURCE_LABELS[booking.source]}</Row>
          {booking.guestCount ? <Row label="People">{booking.guestCount}</Row> : null}
        </Section>

        {/* Money */}
        <Section title="Payment">
          <Row label="Total">{formatMoney(booking.priceAmount)}</Row>
          <Row label="Outstanding">
            {partial ? (
              <span className="text-butter-ink">Part paid — balance not recorded</span>
            ) : (
              <span className={settled ? 'text-olive-ink' : 'text-alert-ink'}>
                {settled ? formatMoney(0) : formatMoney(booking.priceAmount)}
              </span>
            )}
          </Row>
        </Section>

        {/* Who */}
        <Section title="Customer">
          <Row label="Name">
            {customer ? (
              <Link
                href={`/studio/customers/${customer.id}`}
                className="hover:text-clay-ink"
              >
                {booking.customerName}
              </Link>
            ) : (
              booking.customerName
            )}
          </Row>
          <Row label="Phone">
            {booking.customerPhone ? (
              <a href={`tel:${booking.customerPhone}`} className="hover:text-clay-ink">
                {formatPhone(booking.customerPhone)}
              </a>
            ) : (
              '—'
            )}
          </Row>
          <Row label="Email">
            {booking.customerEmail ? (
              <a href={`mailto:${booking.customerEmail}`} className="hover:text-clay-ink">
                {booking.customerEmail}
              </a>
            ) : (
              '—'
            )}
          </Row>
          {customer ? (
            <Row label="History">
              {customer.totalBookings} bookings · {formatMoney(customer.totalSpend)}
            </Row>
          ) : null}
        </Section>

        {booking.notes ? (
          <Section title="Note">
            <p className="text-sm leading-relaxed text-ink-muted">{booking.notes}</p>
          </Section>
        ) : null}

        {booking.cancellationReason ? (
          <Section title="Cancellation reason">
            <p className="text-sm leading-relaxed text-ink-muted">
              {booking.cancellationReason}
            </p>
          </Section>
        ) : null}

        <Section title="Actions">
          <DrawerActions
            bookingId={booking.id}
            status={booking.status}
            paymentStatus={booking.paymentStatus}
            customerName={booking.customerName}
            phone={booking.customerPhone}
            email={booking.customerEmail}
          />
        </Section>

        {events.length > 0 ? (
          <Section title="History">
            <ol className="space-y-2">
              {events.slice(-4).map((event) => (
                <li key={event.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-ink-muted">
                    {event.type.replace('booking.', '').replace(/_/g, ' ')}
                    <span className="text-ink-soft"> · {event.actorName}</span>
                  </span>
                  <span className="shrink-0 text-[0.625rem] text-ink-soft">
                    {formatRelativeTime(event.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}
      </div>
    </BookingDrawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-2.5">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="shrink-0 text-ink-soft">{label}</span>
      <span className="min-w-0 text-right text-ink">{children}</span>
    </div>
  );
}
