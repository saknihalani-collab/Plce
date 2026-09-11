import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { env, isDemoMode } from '@/lib/env';

/**
 * Refreshes the Supabase session on every request.
 *
 * Access tokens are short-lived. Server Components cannot write cookies,
 * so without this the refreshed token would be discarded and an owner
 * would be silently signed out mid-session. Middleware is the one place
 * that can both read the request's cookies and write the response's.
 */
export async function refreshSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  if (isDemoMode || !env.supabase.url || !env.supabase.anonKey) return response;

  const client = createServerClient(env.supabase.url, env.supabase.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Calling `getUser` is what triggers the refresh; the result is not
  // needed here, only the cookie it may have rewritten.
  await client.auth.getUser();

  return response;
}
