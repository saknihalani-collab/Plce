import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { isDemoMode } from '@/lib/env';
import { absoluteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Where a confirmation link lands.
 *
 * Supabase verifies the token on its own side and then sends the person
 * here with a one-time `code`. That code still has to be exchanged for a
 * session, and only a route handler can do it — a Server Component
 * cannot write the cookies the session needs.
 *
 * Without this route the link "worked" in the sense that the address got
 * confirmed, and failed in every way that matters: the visitor arrived
 * at a page that ignored the code, no session was set, and they appeared
 * to be signed out immediately after clicking a link that told them they
 * were confirmed.
 *
 * Errors are deliberately vague to the visitor and specific in the log.
 * A failed exchange is almost always an expired or reused link, and the
 * useful thing to offer is the sign-in page, not a stack trace.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  // Only relative paths, so a crafted link cannot bounce someone off
  // this domain carrying a freshly minted session.
  const requested = url.searchParams.get('next');
  const next = requested && requested.startsWith('/') && !requested.startsWith('//')
    ? requested
    : '/';

  if (isDemoMode) {
    // There is no Supabase to exchange with; demo sign-up never mails.
    return NextResponse.redirect(await absoluteUrl(next));
  }

  /*
    Supabase sends one of two link shapes, depending on the email
    template the project is using:

      ?code=...                     the default ConfirmationURL, PKCE
      ?token_hash=...&type=signup   the newer server-side template

    Handling only the first leaves the second arriving here, finding no
    `code`, and being bounced to the login page with the address still
    unconfirmed — a link that appears to work and changes nothing.
    Supporting both costs a branch and removes a dependency on which
    template someone happened to pick.
  */
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  if (!code && !tokenHash) {
    return NextResponse.redirect(await absoluteUrl('/login?confirmed=0'));
  }

  const { createClient } = await import('@/lib/supabase/server');
  const client = await createClient();

  const { error } = tokenHash
    ? await client.auth.verifyOtp({
        type: (type as EmailOtpType | null) ?? 'email',
        token_hash: tokenHash,
      })
    : await client.auth.exchangeCodeForSession(code!);

  if (error) {
    // The message names the reason — expired, already used, wrong type —
    // and belongs in the log, not on a page a stranger can load.
    console.error('[auth] confirmation failed', error.message);
    return NextResponse.redirect(await absoluteUrl('/login?confirmed=0'));
  }

  return NextResponse.redirect(await absoluteUrl(next));
}
