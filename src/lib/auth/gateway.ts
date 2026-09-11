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

export interface AuthGateway {
  /** The signed-in user's id, or null. Never throws for anonymous. */
  currentUserId(): Promise<string | null>;
  /** Returns the user id on success. */
  signIn(email: string, password: string): Promise<string>;
  signUp(input: SignUpInput): Promise<string>;
  signOut(): Promise<void>;
}
