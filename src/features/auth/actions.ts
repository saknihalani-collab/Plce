'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { fail, fromZodError, ok, runAction, type ActionResult } from '@/lib/action-result';
import { clearDemoSession } from '@/lib/auth/cookies';
import { AuthError } from '@/lib/auth/gateway';
import { getAuthGateway, getRepository } from '@/lib/data';
import { isDemoMode } from '@/lib/env';

/**
 * Sign in, sign up, sign out.
 *
 * The gateway does the credential work; this layer decides where someone
 * lands afterwards. `next` is checked rather than trusted — an open
 * redirect on a sign-in form is how phishing links get to look
 * legitimate.
 */

const credentials = z.object({
  email: z.string().trim().email('Enter the email you signed up with'),
  password: z.string().min(6, 'Passwords are at least 6 characters'),
  next: z.string().optional(),
});

const signUpSchema = credentials.extend({
  fullName: z.string().trim().min(2, 'Tell us your name'),
  phone: z.string().trim().max(20).optional(),
});

/**
 * What the login and signup forms render besides an error.
 *
 * `null` is the ordinary case — both actions redirect on success, so the
 * form only ever sees this when something is left to say. Today that is
 * one thing: the account exists but the address has to be confirmed
 * before it can be used.
 */
export type AuthPending = { awaitingConfirmation: true; email: string } | null;

export async function signIn(
  _previous: ActionResult<AuthPending> | null,
  formData: FormData,
): Promise<ActionResult<AuthPending>> {
  let destination: string | null = null;

  const result = await runAction(async () => {
    const parsed = credentials.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);

    const gateway = await getAuthGateway();

    let userId: string;
    try {
      userId = await gateway.signIn(parsed.data.email, parsed.data.password);
    } catch (error) {
      /*
        An unconfirmed address is not a failed login, it is an unfinished
        one — the credentials were right. Showing it as a red error next
        to a password field invites people to change a password that
        works. The form gets the same "check your email" panel sign-up
        uses, which is also where the resend button lives.
      */
      if (error instanceof AuthError && error.code === 'email_not_confirmed') {
        return ok({ awaitingConfirmation: true as const, email: parsed.data.email });
      }
      throw error;
    }

    destination = await landingFor(userId, parsed.data.next);
    return ok(null);
  });

  if (destination) redirect(destination);
  return result;
}

export async function signUp(
  _previous: ActionResult<AuthPending> | null,
  formData: FormData,
): Promise<ActionResult<AuthPending>> {
  let destination: string | null = null;

  const result = await runAction(async () => {
    const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);

    const gateway = await getAuthGateway();
    const { userId, needsEmailConfirmation } = await gateway.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone || null,
    });

    /*
      No session means the address has to be confirmed first. Redirecting
      here would drop someone into the product unauthenticated, bounce
      them to the login they cannot yet pass, and tell them their
      password was wrong — which is precisely how a working account looks
      broken.
    */
    if (needsEmailConfirmation) {
      return ok({ awaitingConfirmation: true as const, email: parsed.data.email });
    }

    destination = await landingFor(userId, parsed.data.next);
    return ok(null);
  });

  if (destination) redirect(destination);
  return result;
}

export async function signOut(): Promise<void> {
  const gateway = await getAuthGateway();
  await gateway.signOut();
  if (isDemoMode) await clearDemoSession();
  redirect('/');
}

/**
 * Demo mode only: switch identity without a password, so the whole
 * marketplace loop can be walked in one sitting.
 *
 * Guarded at the top rather than by hiding the button, because a
 * dev-only affordance that is merely invisible is not guarded at all.
 */
/**
 * Sends the confirmation email again.
 *
 * Unauthenticated by necessity — the person cannot sign in yet, which is
 * the whole problem. It therefore reports the same success whatever
 * happened, so it cannot be used to discover which addresses have
 * accounts. Supabase rate-limits the underlying send.
 */
export async function resendConfirmation(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const email = String(formData.get('email') ?? '').trim();
    if (!email) return fail('Enter your email address first.', 'email');

    const gateway = await getAuthGateway();
    await gateway.resendConfirmation(email);

    return ok(null);
  });
}

export async function signInAsDemoUser(email: string): Promise<void> {
  if (!isDemoMode) {
    throw new AuthError('Demo sign-in is not available here.', 'forbidden');
  }

  const gateway = await getAuthGateway();
  const userId = await gateway.signIn(email, 'demo-password');
  redirect(await landingFor(userId, null));
}

/**
 * Where someone belongs after signing in.
 *
 * A studio owner wants their calendar, an admin wants the review queue,
 * everyone else wants what they were doing. Only relative paths are
 * honoured.
 */
async function landingFor(userId: string, next: string | undefined | null): Promise<string> {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;

  const repository = await getRepository();
  const user = await repository.getUser(userId);
  if (user?.platformRole === 'admin') return '/admin';

  const memberships = await repository.listMembershipsForUser(userId);
  if (memberships.length > 0) return '/studio';

  return '/account/bookings';
}

export async function requireEmailAvailable(email: string): Promise<ActionResult<null>> {
  const repository = await getRepository();
  const existing = await repository.getUserByEmail(email);
  return existing ? fail('An account with that email already exists.', 'email') : ok(null);
}
