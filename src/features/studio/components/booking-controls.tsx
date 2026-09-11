'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import {
  cancelStudioBooking,
  moveBooking,
  updateBookingStatus,
  updatePaymentStatus,
} from '@/features/studio/actions';
import type { ActionResult } from '@/lib/action-result';
import { instantToZoned } from '@/lib/time';
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type BookingDetail,
  type BookingStatus,
  type PaymentStatus,
  type Space,
} from '@/types/domain';

type Result = ActionResult<null> | null;

/**
 * What an owner does to a booking after it exists.
 *
 * Status and payment are one-click, because they are corrections rather
 * than decisions. Moving it goes through the engine, so it can be
 * refused for the same reasons a new booking would be. Cancelling asks
 * for a reason, which the customer sees.
 */
export function BookingControls({
  booking,
  spaces,
}: {
  booking: BookingDetail;
  spaces: Space[];
}) {
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const start = instantToZoned(booking.startsAt, booking.timezone);
  const end = instantToZoned(booking.endsAt, booking.timezone);
  const closed = booking.status === 'cancelled';

  async function run(label: string, work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
      toast.success(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="eyebrow">Booking status</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['confirmed', 'completed', 'no_show'] as BookingStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              disabled={busy || closed || booking.status === status}
              className={`btn btn-sm ${booking.status === status ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => void run('Status updated', () => updateBookingStatus(booking.id, status))}
            >
              {BOOKING_STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        <p className="eyebrow mt-5">Payment</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['unpaid', 'partial', 'paid', 'refunded'] as PaymentStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              disabled={busy || booking.paymentStatus === status}
              className={`btn btn-sm ${
                booking.paymentStatus === status ? 'btn-secondary' : 'btn-ghost'
              }`}
              onClick={() =>
                void run('Payment updated', () => updatePaymentStatus(booking.id, status))
              }
            >
              {PAYMENT_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </div>

      {!closed ? (
        <div className="card p-5">
          <p className="eyebrow">Change the booking</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMoving(!moving)}>
              {moving ? 'Cancel move' : 'Move or reschedule'}
            </Button>
            <Button variant="danger" size="sm" onClick={() => setCancelling(!cancelling)}>
              Cancel booking
            </Button>
          </div>

          {moving ? (
            <MoveForm
              booking={booking}
              spaces={spaces}
              defaults={{ date: start.date, startTime: start.time, endTime: end.time }}
              onDone={() => setMoving(false)}
            />
          ) : null}

          {cancelling ? (
            <CancelForm
              bookingId={booking.id}
              customerName={booking.customerName}
              onDone={() => setCancelling(false)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MoveForm({
  booking,
  spaces,
  defaults,
  onDone,
}: {
  booking: BookingDetail;
  spaces: Space[];
  defaults: { date: string; startTime: string; endTime: string };
  onDone: () => void;
}) {
  const [state, action] = useActionState<Result, FormData>(
    moveBooking as (previous: Result, formData: FormData) => Promise<Result>,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success('Booking moved');
      onDone();
    }
    if (state && !state.ok) toast.error(state.error);
  }, [state, onDone]);

  const error = state && !state.ok ? state : null;

  return (
    <form action={action} className="mt-5 space-y-4 border-t border-line pt-5">
      <input type="hidden" name="bookingId" value={booking.id} />

      <Field label="Space" htmlFor="move-space" required>
        <Select id="move-space" name="spaceId" defaultValue={booking.spaceId}>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="move-date" required>
          <Input id="move-date" name="date" type="date" required defaultValue={defaults.date} />
        </Field>
        <Field label="From" htmlFor="move-start" required>
          <Input
            id="move-start"
            name="startTime"
            type="time"
            step={1800}
            required
            defaultValue={defaults.startTime}
          />
        </Field>
        <Field label="To" htmlFor="move-end" required>
          <Input
            id="move-end"
            name="endTime"
            type="time"
            step={1800}
            required
            defaultValue={defaults.endTime}
          />
        </Field>
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error.error}
        </p>
      ) : null}

      <MoveSubmit />
    </form>
  );
}

function MoveSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Checking…' : 'Move booking'}
    </Button>
  );
}

function CancelForm({
  bookingId,
  customerName,
  onDone,
}: {
  bookingId: string;
  customerName: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-5 space-y-3 border-t border-line pt-5">
      <Field
        label="Why is it cancelled?"
        htmlFor="cancel-reason"
        hint={`${customerName} sees this. The slot frees up immediately.`}
      >
        <Textarea
          id="cancel-reason"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Client postponed to next week."
        />
      </Field>

      <div className="flex gap-2">
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await cancelStudioBooking(bookingId, reason);
              toast.success('Booking cancelled');
              onDone();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'That did not go through.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Cancelling…' : 'Cancel this booking'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Keep it
        </Button>
      </div>
    </div>
  );
}
