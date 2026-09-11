import type { BookingDetail, BookingStatus, PaymentStatus } from '@/types/domain';

/**
 * One status language for the whole CRM.
 *
 * Two independent facts are being communicated and they are constantly
 * confused: *is this booking happening* and *has it been paid for*. A
 * booking can be confirmed and unpaid, pending and paid, or completed and
 * still owing money. Collapsing them into one badge is how an owner ends
 * up chasing the wrong person.
 *
 * So the pair is resolved here, once, and the calendar, the list, the
 * drawer and the dashboard all render the same answer. Nothing else in
 * the CRM decides what colour a booking is.
 */

export type StatusTone = 'settled' | 'attention' | 'waiting' | 'muted';

export interface BookingPresentation {
  tone: StatusTone;
  /** What is happening — 'Confirmed', 'Pending confirmation', 'Cancelled'. */
  statusLabel: string;
  /** What is owed — 'Paid', 'Payment pending', 'Part paid', 'Refunded'. */
  paymentLabel: string;
  /**
   * True when the owner needs to do something. Drives the dot on the
   * calendar chip and the "needs attention" counts on the dashboard.
   */
  needsAttention: boolean;
  /** One line for a tooltip or a dense row. */
  summary: string;
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pending confirmation',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Payment pending',
  partial: 'Part paid',
  paid: 'Paid',
  refunded: 'Refunded',
};

/**
 * The tone ladder, in priority order:
 *
 *   muted     — cancelled or a no-show. Over; must not compete for the eye.
 *   waiting   — not yet confirmed. The owner owes someone an answer.
 *   attention — confirmed but money is outstanding.
 *   settled   — confirmed and paid. Nothing to do.
 *
 * Cancelled outranks unpaid deliberately: an owner does not need to chase
 * payment on a booking that is not happening.
 */
export function presentBooking(
  booking: Pick<BookingDetail, 'status' | 'paymentStatus'>,
): BookingPresentation {
  const statusLabel = STATUS_LABELS[booking.status];
  const paymentLabel = PAYMENT_LABELS[booking.paymentStatus];

  if (booking.status === 'cancelled' || booking.status === 'no_show') {
    return {
      tone: 'muted',
      statusLabel,
      paymentLabel,
      needsAttention: false,
      summary: statusLabel,
    };
  }

  if (booking.status === 'pending') {
    return {
      tone: 'waiting',
      statusLabel,
      paymentLabel,
      needsAttention: true,
      summary: `${statusLabel} · ${paymentLabel}`,
    };
  }

  const owing = booking.paymentStatus === 'unpaid' || booking.paymentStatus === 'partial';

  return {
    tone: owing ? 'attention' : 'settled',
    statusLabel,
    paymentLabel,
    needsAttention: owing,
    summary: `${statusLabel} · ${paymentLabel}`,
  };
}

/**
 * Tailwind classes per tone, for the calendar chip.
 *
 * Colour is carried by a left edge and a soft wash rather than a solid
 * fill. A day of solid blocks reads as a broken system, when what it
 * actually means is "six people owe you money" — the signal has to be
 * legible without the interface shouting.
 *
 * Clay, not red, marks money owed. Red is kept for things that have gone
 * wrong, so that a normal Tuesday with three unpaid bookings does not
 * look like an outage.
 */
export const TONE_CHIP: Record<StatusTone, string> = {
  settled: 'border-l-olive bg-olive-soft hover:bg-olive-line text-ink',
  attention: 'border-l-clay bg-clay-soft hover:bg-clay-line text-ink',
  waiting: 'border-l-butter bg-butter-soft hover:bg-butter-line text-ink',
  muted: 'border-l-line-strong bg-stone/50 hover:bg-stone text-ink-soft',
};

/** The dot beside a status label. The smallest carrier of state. */
export const TONE_DOT: Record<StatusTone, string> = {
  settled: 'bg-olive',
  attention: 'bg-clay',
  waiting: 'bg-butter',
  muted: 'bg-ink-soft',
};

/** Text colour for the status line under a booking title. */
export const TONE_TEXT: Record<StatusTone, string> = {
  settled: 'text-olive-ink',
  attention: 'text-clay-ink',
  waiting: 'text-butter-ink',
  muted: 'text-ink-soft',
};
