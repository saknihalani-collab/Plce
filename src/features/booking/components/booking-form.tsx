'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { createCustomerBooking } from '@/features/booking/actions';
import type { ActionResult } from '@/lib/action-result';
import type { Space, StudioDetail, UserAccount } from '@/types/domain';

export function BookingForm({
  studio,
  space,
  date,
  startTime,
  durationMinutes,
  viewer,
}: {
  studio: StudioDetail;
  space: Space;
  date: string;
  startTime: string;
  durationMinutes: number;
  viewer: UserAccount | null;
}) {
  const [state, action] = useActionState<ActionResult<{ reference: string }> | null, FormData>(
    createCustomerBooking,
    null,
  );

  const error = state && !state.ok ? state : null;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="studioId" value={studio.id} />
      <input type="hidden" name="spaceId" value={space.id} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="startTime" value={startTime} />
      <input type="hidden" name="durationMinutes" value={durationMinutes} />

      <Field label="Name" htmlFor="name" required error={fieldError(error, 'name')}>
        <Input
          id="name"
          name="name"
          required
          autoComplete="name"
          defaultValue={viewer?.fullName ?? ''}
          placeholder="Who should the studio expect?"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" required error={fieldError(error, 'email')}>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={viewer?.email ?? ''}
          />
        </Field>

        <Field label="Phone" htmlFor="phone" required error={fieldError(error, 'phone')}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            defaultValue={viewer?.phone ?? ''}
            placeholder="+91 98200 12345"
          />
        </Field>
      </div>

      <Field
        label="How many people"
        htmlFor="guestCount"
        hint={`${space.name} takes up to ${space.capacity}.`}
      >
        <Input
          id="guestCount"
          name="guestCount"
          type="number"
          min={1}
          max={space.capacity}
          defaultValue={2}
        />
      </Field>

      <Field
        label="Anything the studio should know"
        htmlFor="notes"
        hint="Load-in, equipment you are bringing, a tricky arrival time."
      >
        <Textarea id="notes" name="notes" rows={3} maxLength={600} />
      </Field>

      {error ? (
        <p
          className="rounded-[--radius-sm] border border-alert-line bg-alert-soft px-4 py-3 text-sm text-alert-ink"
          role="alert"
        >
          {error.error}
        </p>
      ) : null}

      <Submit />

      <p className="text-xs leading-relaxed text-ink-subtle">
        By booking you agree to {studio.name}&rsquo;s house rules and cancellation policy.
        {viewer ? null : ' Your booking will be found by its reference — sign in first to keep it in My bookings.'}
      </p>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" full disabled={pending}>
      {pending ? 'Confirming…' : 'Confirm booking'}
    </Button>
  );
}

function fieldError(
  error: { error: string; field?: string } | null,
  field: string,
): string | null {
  return error?.field === field ? error.error : null;
}
