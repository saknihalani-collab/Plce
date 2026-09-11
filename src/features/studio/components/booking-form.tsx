'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { createManualBooking } from '@/features/studio/actions';
import type { ActionResult } from '@/lib/action-result';
import { formatMoney } from '@/lib/format';
import { timeToMinutes } from '@/lib/time';
import { BOOKING_SOURCE_LABELS, PAYMENT_STATUS_LABELS } from '@/types/domain';
import type { Customer, Space } from '@/types/domain';

type Result = ActionResult<null> | null;

/**
 * Manual booking.
 *
 * The owner's version of the booking form: same engine, more control.
 * They can name a price, mark it paid, and record where it came from —
 * because a booking taken on Instagram is still a booking, and the
 * calendar is worthless if it only knows about the ones PL·CE took.
 */
export function StudioBookingForm({
  spaces,
  customers,
  defaultDate,
  defaultSpaceId,
  defaultStart,
  defaultEnd,
}: {
  spaces: Space[];
  customers: Customer[];
  defaultDate: string;
  defaultSpaceId?: string;
  /** Prefilled when the owner arrived by clicking an empty calendar slot. */
  defaultStart?: string;
  defaultEnd?: string;
}) {
  const [state, action] = useActionState<Result, FormData>(
    createManualBooking as (previous: Result, formData: FormData) => Promise<Result>,
    null,
  );

  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? spaces[0]?.id ?? '');
  const [startTime, setStartTime] = useState(defaultStart ?? '10:00');
  const [endTime, setEndTime] = useState(defaultEnd ?? '13:00');
  const [existing, setExisting] = useState(customers.length > 0);

  const space = spaces.find((candidate) => candidate.id === spaceId);
  const hours = durationHours(startTime, endTime);
  const suggested = space && hours > 0 ? Math.round(space.hourlyRate * hours) : 0;

  const error = state && !state.ok ? state : null;

  return (
    <form action={action} className="space-y-6">
      <Field label="Space" htmlFor="spaceId" required error={pick(error, 'spaceId')}>
        <Select
          id="spaceId"
          name="spaceId"
          required
          value={spaceId}
          onChange={(event) => setSpaceId(event.target.value)}
        >
          {spaces.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} — {formatMoney(option.hourlyRate)}/hr
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Date" htmlFor="date" required error={pick(error, 'date')}>
          <Input id="date" name="date" type="date" required defaultValue={defaultDate} />
        </Field>

        <Field label="From" htmlFor="startTime" required error={pick(error, 'startTime')}>
          <Input
            id="startTime"
            name="startTime"
            type="time"
            step={1800}
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </Field>

        <Field label="To" htmlFor="endTime" required error={pick(error, 'endTime')}>
          <Input
            id="endTime"
            name="endTime"
            type="time"
            step={1800}
            required
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </Field>
      </div>

      {space && hours > 0 ? (
        <p className="rounded-[--radius-sm] bg-stone px-4 py-3 text-sm text-ink-muted">
          {hours} {hours === 1 ? 'hour' : 'hours'} in {space.name} ·{' '}
          <span className="tabular text-ink">{formatMoney(suggested)}</span> at the listed
          rate
          {space.minBookingMinutes > hours * 60
            ? ` · below the ${space.minBookingMinutes / 60}-hour minimum`
            : ''}
        </p>
      ) : null}

      {/* Customer */}
      <fieldset className="rounded-[--radius-sm] border border-line p-4">
        <legend className="px-1 text-sm text-ink">Customer</legend>

        {customers.length > 0 ? (
          <div className="mb-4 flex gap-1.5">
            <button
              type="button"
              onClick={() => setExisting(true)}
              className={`btn btn-sm ${existing ? 'btn-secondary' : 'btn-ghost'}`}
            >
              Existing
            </button>
            <button
              type="button"
              onClick={() => setExisting(false)}
              className={`btn btn-sm ${existing ? 'btn-ghost' : 'btn-secondary'}`}
            >
              Someone new
            </button>
          </div>
        ) : null}

        {existing && customers.length > 0 ? (
          <Field label="Who" htmlFor="customerId" required error={pick(error, 'customerId')}>
            <Select id="customerId" name="customerId" required>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                  {customer.phone ? ` · ${customer.phone}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="space-y-5">
            <Field
              label="Name"
              htmlFor="customerName"
              required
              error={pick(error, 'customerName')}
            >
              <Input id="customerName" name="customerName" required placeholder="Rahul Menon" />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Phone" htmlFor="customerPhone" error={pick(error, 'customerPhone')}>
                <Input
                  id="customerPhone"
                  name="customerPhone"
                  type="tel"
                  placeholder="+91 98200 12345"
                />
              </Field>
              <Field label="Email" htmlFor="customerEmail">
                <Input id="customerEmail" name="customerEmail" type="email" />
              </Field>
            </div>
          </div>
        )}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Price"
          htmlFor="price"
          hint="Leave as suggested, or set your own."
          error={pick(error, 'price')}
        >
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            key={suggested}
            defaultValue={suggested || undefined}
          />
        </Field>

        <Field label="People" htmlFor="guestCount">
          <Input id="guestCount" name="guestCount" type="number" min={1} max={space?.capacity} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Booking status" htmlFor="status" required>
          <Select id="status" name="status" defaultValue="confirmed">
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
          </Select>
        </Field>

        <Field label="Payment" htmlFor="paymentStatus" required>
          <Select id="paymentStatus" name="paymentStatus" defaultValue="unpaid">
            {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Came from" htmlFor="source" required>
          <Select id="source" name="source" defaultValue="manual">
            {Object.entries(BOOKING_SOURCE_LABELS)
              .filter(([value]) => value !== 'admin')
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </Select>
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes" hint="Load-in, kit, anything the team should know.">
        <Textarea id="notes" name="notes" rows={3} maxLength={600} />
      </Field>

      {error && !error.field ? (
        <p
          className="rounded-[--radius-sm] border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-alert-ink"
          role="alert"
        >
          {error.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? 'Checking the calendar…' : 'Create booking'}
    </Button>
  );
}

function durationHours(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  // Midnight as an end time means the end of the day, not the start.
  const end = endTime === '00:00' ? 1440 : timeToMinutes(endTime);
  if (start == null || end == null || end <= start) return 0;
  return (end - start) / 60;
}

function pick(error: { error: string; field?: string } | null, field: string): string | null {
  return error?.field === field ? error.error : null;
}
