'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckCircle2, Mail, Phone, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  cancelStudioBooking,
  updateBookingStatus,
  updatePaymentStatus,
} from '@/features/studio/actions';
import { cn } from '@/lib/utils';

/**
 * The booking drawer.
 *
 * Opening a booking must not cost the owner their place in the day. The
 * drawer is driven by a `?booking=` search param, which means the panel's
 * contents are rendered on the server from the same query the calendar
 * used — no second fetch, no client cache to go stale, and a link to a
 * specific booking that survives a refresh.
 *
 * Closing simply drops the param.
 */
export function BookingDrawer({
  closeHref,
  title,
  children,
}: {
  closeHref: string;
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);

  const close = () => {
    if (closing) return;
    setClosing(true);
    router.push(closeHref, { scroll: false });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    // The page behind the drawer should not scroll under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal aria-label={title}>
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-stone-deep/70 backdrop-blur-[2px]"
      />

      <aside
        className={cn(
          'relative flex h-full w-full max-w-[26rem] flex-col overflow-y-auto border-l border-line bg-paper shadow-lg',
          'animate-in slide-in-from-right duration-200',
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-paper px-5 py-4">
          <div className="min-w-0">
            <p className="eyebrow">Booking</p>
            <h2 className="display mt-1 truncate text-2xl text-ink">{title}</h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close booking"
            className="-mr-1 shrink-0 rounded-[--radius-xs] p-1.5 text-ink-soft transition-colors hover:bg-stone hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}

/**
 * The actions an owner takes most often, in the order they take them.
 *
 * Deliberately not every action: rescheduling and editing open the full
 * booking page, which already owns those forms. Duplicating the move
 * form here would be a second place for the same rule to drift.
 */
export function DrawerActions({
  bookingId,
  status,
  paymentStatus,
  customerName,
  phone,
  email,
}: {
  bookingId: string;
  status: string;
  paymentStatus: string;
  customerName: string;
  phone: string | null;
  email: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const closed = status === 'cancelled';
  const settled = paymentStatus === 'paid';

  async function run(label: string, work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
      toast.success(label);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {!closed && !settled ? (
        <Button
          full
          disabled={busy}
          onClick={() =>
            void run('Marked as paid', () => updatePaymentStatus(bookingId, 'paid'))
          }
        >
          <CheckCircle2 className="size-4" />
          Mark as paid
        </Button>
      ) : null}

      {!closed && status === 'pending' ? (
        <Button
          variant="secondary"
          full
          disabled={busy}
          onClick={() =>
            void run('Booking confirmed', () => updateBookingStatus(bookingId, 'confirmed'))
          }
        >
          Confirm booking
        </Button>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="secondary">
          <Link href={`/studio/bookings/${bookingId}`}>Reschedule</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/studio/bookings/${bookingId}`}>Edit booking</Link>
        </Button>
      </div>

      {phone || email ? (
        <div className="grid grid-cols-2 gap-2">
          {phone ? (
            <Button asChild variant="ghost">
              <a href={`tel:${phone}`}>
                <Phone className="size-4" />
                Call
              </a>
            </Button>
          ) : null}
          {email ? (
            <Button asChild variant="ghost">
              <a href={`mailto:${email}`}>
                <Mail className="size-4" />
                Email
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}

      {!closed ? (
        <Button
          variant="danger"
          full
          disabled={busy}
          onClick={() => {
            if (
              !window.confirm(
                `Cancel ${customerName}'s booking? The slot frees up immediately.`,
              )
            ) {
              return;
            }
            void run('Booking cancelled', () =>
              cancelStudioBooking(bookingId, 'Cancelled from the schedule'),
            );
          }}
        >
          Cancel booking
        </Button>
      ) : null}
    </div>
  );
}
