'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import {
  resendConfirmation,
  signIn,
  signUp,
  type AuthPending,
} from '@/features/auth/actions';
import type { ActionResult } from '@/lib/action-result';

export function AuthForm({ mode, next }: { mode: 'sign-in' | 'sign-up'; next?: string }) {
  const action = mode === 'sign-in' ? signIn : signUp;
  const [state, submit] = useActionState<ActionResult<AuthPending> | null, FormData>(
    action,
    null,
  );
  const error = state && !state.ok ? state : null;

  /*
    Signing up does not always sign you in. When the address has to be
    confirmed there is no session to redirect with, so the form stays
    where it is and says what happened — the alternative is bouncing
    someone into a login that will reject them for a reason nothing on
    screen explains.
  */
  if (state?.ok && state.data?.awaitingConfirmation) {
    return <ConfirmEmailNotice email={state.data.email} next={next} />;
  }

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

/** The one thing left to do, and where to do it. */
function ConfirmEmailNotice({ email, next }: { email: string; next?: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="display display-md text-ink">Check your email.</h2>
        <p className="lede mt-4 text-base">
          We have sent a confirmation link to <span className="text-ink">{email}</span>. Open it
          to finish setting up your account.
        </p>
      </div>

      <p className="rounded-[--radius-sm] border border-line bg-stone/50 px-4 py-3 text-sm leading-relaxed text-ink-muted">
        Your account exists, but you cannot sign in until the address is confirmed. If the email
        has not arrived in a few minutes, check your spam folder.
      </p>

      <ResendConfirmation email={email} />

      <Button asChild size="lg" full variant="secondary">
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>
          Back to sign in
        </Link>
      </Button>
    </div>
  );
}

/**
 * A second chance at the link.
 *
 * The first email expires, gets filed as spam, or is opened on a phone
 * that is not the machine someone wants to work on — and a confirmation
 * flow with no way to ask again is a dead end that ends in a support
 * message. Sent state is kept locally rather than re-rendering the
 * panel, so the address stays on screen.
 */
function ResendConfirmation({ email }: { email: string }) {
  const [state, submit] = useActionState<ActionResult<null> | null, FormData>(
    resendConfirmation as (previous: ActionResult<null> | null, formData: FormData) => Promise<ActionResult<null>>,
    null,
  );

  if (state?.ok) {
    return (
      <p className="text-sm text-olive-ink" role="status">
        Sent. Give it a minute, then check your inbox and spam folder.
      </p>
    );
  }

  return (
    <form action={submit}>
      <input type="hidden" name="email" value={email} />
      {state && !state.ok ? (
        <p className="mb-2 text-sm text-alert-ink" role="alert">
          {state.error}
        </p>
      ) : null}
      <ResendButton />
    </form>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? 'Sending…' : 'Resend confirmation email'}
    </Button>
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
