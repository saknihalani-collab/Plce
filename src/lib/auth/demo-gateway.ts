import 'server-only';

import {
  AuthError,
  type AuthGateway,
  type SignUpInput,
  type SignUpResult,
} from '@/lib/auth/gateway';
import { clearDemoSession, readDemoSession, writeDemoSession } from '@/lib/auth/cookies';
import { DemoRepository } from '@/lib/data/demo/repository';

/**
 * Sign-in without an auth provider.
 *
 * Demo mode has no password store and does not pretend to: any password
 * of a plausible length is accepted for an email that exists in the
 * seeded marketplace, and signing up creates a real user row. What it
 * does do faithfully is everything *after* authentication — roles,
 * memberships and permissions are read from the database exactly as they
 * are in live mode, because those are the parts worth demonstrating.
 */
export class DemoAuthGateway implements AuthGateway {
  private readonly repository = new DemoRepository();

  async currentUserId(): Promise<string | null> {
    const userId = await readDemoSession();
    if (!userId) return null;

    // A stale cookie pointing at a user the seed no longer has would
    // otherwise surface as a crash on every page.
    const user = await this.repository.getUser(userId);
    return user ? user.id : null;
  }

  async signIn(email: string, password: string): Promise<string> {
    if (password.trim().length < 6) {
      throw new AuthError('Passwords are at least 6 characters.', 'invalid_credentials');
    }

    const user = await this.repository.getUserByEmail(email);
    if (!user) {
      throw new AuthError('No account with that email.', 'invalid_credentials');
    }
    if (user.suspendedAt) {
      throw new AuthError('This account has been suspended.', 'forbidden');
    }

    await writeDemoSession(user.id);
    return user.id;
  }

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    if (input.password.trim().length < 6) {
      throw new AuthError('Passwords are at least 6 characters.', 'weak_password');
    }

    const existing = await this.repository.getUserByEmail(input.email);
    if (existing) {
      throw new AuthError('An account with that email already exists.', 'email_taken');
    }

    const user = await this.repository.createUser({
      email: input.email,
      fullName: input.fullName,
      phone: input.phone ?? null,
    });

    await writeDemoSession(user.id);

    // No mail is sent in demo mode, so there is nothing to confirm and
    // the session is issued immediately.
    return { userId: user.id, needsEmailConfirmation: false };
  }

  async signOut(): Promise<void> {
    await clearDemoSession();
  }
}
