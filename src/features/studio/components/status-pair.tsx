import { presentBooking, TONE_DOT, TONE_TEXT } from '@/features/studio/lib/booking-status';
import { cn } from '@/lib/utils';
import type { BookingDetail } from '@/types/domain';

/**
 * Booking status and payment status, together but never merged.
 *
 * "Confirmed / Payment pending" is two facts and reads as two lines. The
 * dot carries the tone so the pair can be scanned at a glance without
 * reading either word.
 */
export function StatusPair({
  booking,
  size = 'sm',
  className,
}: {
  booking: Pick<BookingDetail, 'status' | 'paymentStatus'>;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const presentation = presentBooking(booking);

  return (
    <span className={cn('flex flex-col gap-0.5', className)}>
      <span
        className={cn(
          'flex items-center gap-1.5',
          size === 'xs' ? 'text-[0.6875rem]' : 'text-xs',
          TONE_TEXT[presentation.tone],
        )}
      >
        <span
          aria-hidden
          className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[presentation.tone])}
        />
        {presentation.statusLabel}
      </span>
      <span
        className={cn(
          'pl-3',
          size === 'xs' ? 'text-[0.6875rem]' : 'text-xs',
          presentation.needsAttention && presentation.tone === 'attention'
            ? TONE_TEXT.attention
            : 'text-ink-soft',
        )}
      >
        {presentation.paymentLabel}
      </span>
    </span>
  );
}
