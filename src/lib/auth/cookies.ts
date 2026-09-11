import 'server-only';

import { cookies } from 'next/headers';

/**
 * Cookies PL·CE sets directly.
 *
 * In live mode Supabase owns the session cookie and nothing here touches
 * it; `plce_demo_session` exists only when there is no auth provider to
 * ask. `plce_org` is used in both modes — it is a preference, not a
 * credential, and every server action re-checks membership against the
 * database rather than trusting it.
 */

const DEMO_SESSION = 'plce_demo_session';
const ACTIVE_ORG = 'plce_org';

const YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function readDemoSession(): Promise<string | null> {
  const store = await cookies();
  return store.get(DEMO_SESSION)?.value ?? null;
}

export async function writeDemoSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(DEMO_SESSION, userId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: YEAR_SECONDS,
  });
}

export async function clearDemoSession(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_SESSION);
  store.delete(ACTIVE_ORG);
}

/**
 * Which organisation the person is currently working in.
 *
 * A hint only. `requireOrgAccess` looks the membership up every time, so
 * editing this cookie to another organisation's id gets you a redirect,
 * not their calendar.
 */
export async function readActiveOrganization(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_ORG)?.value ?? null;
}

export async function writeActiveOrganization(organizationId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_ORG, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: YEAR_SECONDS,
  });
}
