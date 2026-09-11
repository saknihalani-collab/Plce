import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';
import type { BookingStatus, ListingStatus, PaymentStatus } from '@/types/domain';
import {
  BOOKING_STATUS_LABELS,
  LISTING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/types/domain';

const badge = cva('badge', {
  variants: {
    tone: {
      neutral: 'badge-neutral',
      sage: 'badge-olive',
      amber: 'badge-butter',
      brand: 'badge-clay',
      critical: 'badge-alert',
      ink: 'badge-ink',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

/**
 * Status colour is a product decision, not a styling one, so it is made
 * once — here — rather than at each of the dozen places a status is
 * shown. Sage is settled, amber is waiting on someone, red is a problem,
 * grey is over.
 */

const LISTING_TONE: Record<ListingStatus, BadgeProps['tone']> = {
  draft: 'neutral',
  submitted: 'amber',
  under_review: 'amber',
  changes_requested: 'brand',
  approved: 'sage',
  rejected: 'critical',
  suspended: 'critical',
  unpublished: 'neutral',
};

export function ListingStatusBadge({
  status,
  className,
}: {
  status: ListingStatus;
  className?: string;
}) {
  return (
    <Badge tone={LISTING_TONE[status]} className={className}>
      {LISTING_STATUS_LABELS[status]}
    </Badge>
  );
}

const BOOKING_TONE: Record<BookingStatus, BadgeProps['tone']> = {
  pending: 'amber',
  confirmed: 'sage',
  completed: 'neutral',
  cancelled: 'critical',
  no_show: 'critical',
};

export function BookingStatusBadge({
  status,
  className,
}: {
  status: BookingStatus;
  className?: string;
}) {
  return (
    <Badge tone={BOOKING_TONE[status]} className={className}>
      {BOOKING_STATUS_LABELS[status]}
    </Badge>
  );
}

const PAYMENT_TONE: Record<PaymentStatus, BadgeProps['tone']> = {
  unpaid: 'amber',
  partial: 'amber',
  paid: 'sage',
  refunded: 'neutral',
};

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: PaymentStatus;
  className?: string;
}) {
  return (
    <Badge tone={PAYMENT_TONE[status]} className={className}>
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
