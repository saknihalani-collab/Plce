import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { absoluteUrl } from '@/lib/site-url';
import {
  AuthError,
  type AuthGateway,
  type SignUpInput,
  type SignUpResult,
} from '@/lib/auth/gateway';

/**
 * Supabase Auth, behind the gateway interface.
 *
 * The profile row in `users` is created by a database trigger on
 * `auth.users` rather than here — a second network call that can fail
 * halfway would leave an account that can sign in but has no profile,
 * and that is a state worth making impossible rather than handling.
 */
export class SupabaseAuthGateway implements AuthGateway {
  constructor(private readonly client: SupabaseClient) {}

  async currentUserId(): Promise<string | null> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  }

  async signIn(email: string, password: string): Promise<string> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.user) {
      /*
        Not every refusal is a wrong password, and saying so when it is
        not is actively harmful: it sends someone to reset a password
        that already works, and hides the one action that would let them
        in. An address that has never been confirmed is the common case
        and gets its own message.
      */
      if (error && isUnconfirmedEmail(error)) {
        throw new AuthError(
          'Please confirm your email address first. Check your inbox.',
          'email_not_confirmed',
        );
      }

      throw new AuthError('That email and password do not match.', 'invalid_credentials');
    }
    return data.user.id;
  }

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    /*
      Without an explicit redirect, Supabase falls back to the Site URL
      configured in its own dashboard — which on a new project is
      `http://localhost:3000`. That is how a confirmation email sent from
      production ends up pointing at a machine the recipient does not
      have. Naming the destination here means the deployment decides,
      not a dashboard field nobody remembers changing.
    */
    const emailRedirectTo = await absoluteUrl('/auth/callback');

    const { data, error } = await this.client.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        emailRedirectTo,
        // Read by the `handle_new_user` trigger to populate `users`.
        data: { full_name: input.fullName.trim(), phone: input.phone ?? null },
      },
    });

    if (error) throw signUpFailure(error);
    if (!data.user) {
      throw new AuthError('We could not create that account. Please try again.', 'unavailable');
    }

    /*
      A user with no session means the project requires the address to be
      confirmed. The account exists — the database trigger has already
      mirrored it into `users` — but nobody is signed in, so the caller
      must not treat this as a completed sign-up.
    */
    return { userId: data.user.id, needsEmailConfirmation: !data.session };
  }

  async resendConfirmation(email: string): Promise<void> {
    const { error } = await this.client.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      // The same destination sign-up uses, so a resent link behaves
      // exactly like the original rather than falling back to whatever
      // the dashboard's Site URL happens to say.
      options: { emailRedirectTo: await absoluteUrl('/auth/callback') },
    });

    // Logged, never surfaced. "Already confirmed" and "no such user" are
    // both answers worth having in a log and not worth handing to
    // someone probing the form.
    if (error) console.error('[auth] resend confirmation failed', error.message);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}

/**
 * Whether a Supabase sign-in failure was an unconfirmed address.
 *
 * Checked by code first, since that is the stable contract, with a
 * message match behind it — the field has not always been populated
 * across supabase-js versions, and misreading this as a bad password is
 * exactly the failure this function exists to prevent.
 */
function isUnconfirmedEmail(error: { code?: string; message?: string }): boolean {
  if (error.code === 'email_not_confirmed') return true;
  return /email not confirmed/i.test(error.message ?? '');
}

/**
 * Turns a Supabase sign-up refusal into something a person can act on.
 *
 * The previous version tested the message for "already" and called
 * everything else "We could not create that account. Please try again." —
 * advice that is wrong for every cause except a transient one. Somebody
 * hitting the shared mail quota was told to retry, which consumed
 * another attempt; somebody whose trigger was failing was told the same
 * thing forever.
 *
 * The real message is always logged. It is not always shown: "Database
 * error saving new user" means something is wrong with our schema, and
 * that is an operator's problem, not a visitor's.
 */
function signUpFailure(error: { message: string; status?: number; code?: string }): AuthError {
  console.error(
    '[auth] signUp failed',
    JSON.stringify({ status: error.status, code: error.code, message: error.message }),
  );

  const message = error.message.toLowerCase();

  if (message.includes('already') || error.code === 'user_already_exists') {
    return new AuthError('An account with that email already exists.', 'email_taken');
  }

  if (message.includes('password')) {
    return new AuthError(
      'That password was rejected. Try a longer one.',
      'weak_password',
    );
  }

  /*
    Supabase's built-in mail sender allows only a few messages an hour.
    It is the likeliest reason sign-up starts failing on a project that
    was working an hour ago, and the only useful response is to wait —
    so say that rather than inviting a retry that spends another slot.
  */
  if (
    error.status === 429 ||
    message.includes('rate limit') ||
    message.includes('for security purposes')
  ) {
    return new AuthError(
      'Too many sign-up attempts just now. Wait a few minutes and try again.',
      'unavailable',
    );
  }

  if (message.includes('signups not allowed') || message.includes('signup is disabled')) {
    return new AuthError('New accounts are closed at the moment.', 'forbidden');
  }

  // "Database error saving new user" lands here: a trigger on
  // `auth.users` raised. The log line above carries the detail.
  return new AuthError('We could not create that account. Please try again.', 'unavailable');
}
