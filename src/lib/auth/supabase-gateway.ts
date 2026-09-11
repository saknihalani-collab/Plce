import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { AuthError, type AuthGateway, type SignUpInput } from '@/lib/auth/gateway';

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
      throw new AuthError('That email and password do not match.', 'invalid_credentials');
    }
    return data.user.id;
  }

  async signUp(input: SignUpInput): Promise<string> {
    const { data, error } = await this.client.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
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

    return data.user.id;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}
