'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { saveCustomer } from '@/features/studio/actions';
import type { ActionResult } from '@/lib/action-result';
import type { Customer } from '@/types/domain';

type Result = ActionResult<null> | null;

export function CustomerForm({ customer }: { customer?: Customer }) {
  const [state, action] = useActionState<Result, FormData>(
    saveCustomer as (previous: Result, formData: FormData) => Promise<Result>,
    null,
  );
  const error = state && !state.ok ? state : null;

  return (
    <form action={action} className="space-y-5">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

      <Field label="Name" htmlFor="name" required error={pick(error, 'name')}>
        <Input id="name" name="name" required defaultValue={customer?.name ?? ''} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Phone"
          htmlFor="phone"
          hint="How most studios find someone again."
          error={pick(error, 'phone')}
        >
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={customer?.phone ?? ''}
            placeholder="+91 98200 12345"
          />
        </Field>

        <Field label="Email" htmlFor="email" error={pick(error, 'email')}>
          <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ''} />
        </Field>
      </div>

      <Field
        label="Notes"
        htmlFor="notes"
        hint="Only your team sees this. What they shoot, how they pay, whether they run over."
      >
        <Textarea id="notes" name="notes" rows={4} defaultValue={customer?.notes ?? ''} />
      </Field>

      {error && !error.field ? (
        <p
          className="rounded-[--radius-sm] border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-alert-ink"
          role="alert"
        >
          {error.error}
        </p>
      ) : null}

      <Submit label={customer ? 'Save changes' : 'Add customer'} />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

function pick(error: { error: string; field?: string } | null, field: string): string | null {
  return error?.field === field ? error.error : null;
}
