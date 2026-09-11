'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { signIn, signUp } from '@/features/auth/actions';
import type { ActionResult } from '@/lib/action-result';

export function AuthForm({ mode, next }: { mode: 'sign-in' | 'sign-up'; next?: string }) {
  const action = mode === 'sign-in' ? signIn : signUp;
  const [state, submit] = useActionState<ActionResult<null> | null, FormData>(action, null);
  const error = state && !state.ok ? state : null;

  return (
    <form action={submit} className="space-y-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {mode === 'sign-up' ? (
        <Field label="Name" htmlFor="fullName" required error={pick(error, 'fullName')}>
          <Input id="fullName" name="fullName" required autoComplete="name" />
        </Field>
      ) : null}

      <Field label="Email" htmlFor="email" required error={pick(error, 'email')}>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@studio.in"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        required
        error={pick(error, 'password')}
        hint={mode === 'sign-up' ? 'At least 6 characters.' : undefined}
      >
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
        />
      </Field>

      {mode === 'sign-up' ? (
        <Field
          label="Phone"
          htmlFor="phone"
          hint="Studios use this to reach you about a booking."
        >
          <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+91 98200 12345" />
        </Field>
      ) : null}

      {error && !error.field ? (
        <p
          className="rounded-[--radius-sm] border border-alert-line bg-alert-soft px-4 py-3 text-sm text-alert-ink"
          role="alert"
        >
          {error.error}
        </p>
      ) : null}

      <Submit label={mode === 'sign-in' ? 'Sign in' : 'Create account'} />

      <p className="text-center text-sm text-ink-muted">
        {mode === 'sign-in' ? (
          <>
            New to PL·CE?{' '}
            <Link
              href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
              className="text-clay-ink hover:underline"
            >
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have one?{' '}
            <Link
              href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
              className="text-clay-ink hover:underline"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" full disabled={pending}>
      {pending ? 'One moment…' : label}
    </Button>
  );
}

function pick(error: { error: string; field?: string } | null, field: string): string | null {
  return error?.field === field ? error.error : null;
}
