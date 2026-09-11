/**
 * The authentication seam.
 *
 * Two implementations satisfy it — Supabase Auth (live) and a cookie-backed
 * demo gateway — and which one is in play is decided once, in
 * `lib/data/index.ts`. Nothing above this line knows about either.
 *
 * The gateway deals only in *credentials and identity*. Roles,
 * memberships and permissions are domain data and live in the repository,
 * because "is this person a studio owner?" is a question about the
 * marketplace, not about the login provider.
 */

export type AuthErrorCode =
  | 'invalid_credentials'
  /**
   * The credentials were right but the address has never been confirmed.
   * Deliberately distinct from `invalid_credentials`: telling someone
   * their password is wrong when it is not sends them to reset a
   * password that was never the problem.
   */
  | 'email_not_confirmed'
  | 'not_authenticated'
  | 'email_taken'
  | 'weak_password'
  | 'forbidden'
  | 'unavailable';

/** Thrown for expected, user-facing auth failures (not bugs). */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: AuthErrorCode = 'unavailable',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
}

/**
 * The outcome of creating an account.
 *
 * Signing up does not always sign you in. When a provider requires the
 * address to be confirmed it creates the user and withholds the session,
 * and the caller has to be able to tell the difference — otherwise it
 * redirects into the product as though authenticated and the person
 * bounces straight back to a login they cannot pass.
 */
export interface SignUpResult {
  userId: string;
  needsEmailConfirmation: boolean;
}

export interface AuthGateway {
  /** The signed-in user's id, or null. Never throws for anonymous. */
  currentUserId(): Promise<string | null>;
  /** Returns the user id on success. */
  signIn(email: string, password: string): Promise<string>;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  /**
   * Sends the confirmation email again.
   *
   * Deliberately silent about whether the address exists or was already
   * confirmed: this is reachable without signing in, and an endpoint
   * that answers "no such account" is an endpoint for enumerating
   * accounts.
   */
  resendConfirmation(email: string): Promise<void>;
  signOut(): Promise<void>;
}
