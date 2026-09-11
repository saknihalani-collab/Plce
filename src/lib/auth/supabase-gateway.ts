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

    if (error) {
      const code = error.message.toLowerCase().includes('already') ? 'email_taken' : 'unavailable';
      throw new AuthError(
        code === 'email_taken'
          ? 'An account with that email already exists.'
          : 'We could not create that account. Please try again.',
        code,
      );
    }
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
