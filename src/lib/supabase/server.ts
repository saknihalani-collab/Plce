import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { requireSupabaseEnv } from '@/lib/env';

/**
 * The request-scoped Supabase client.
 *
 * It carries the signed-in user's JWT, which is what makes row-level
 * security do any work: a query issued through this client is evaluated
 * as that user. Server code deliberately does *not* reach for the service
 * role key — see `serviceClient` below for the one place that does, and
 * why.
 */
export async function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const store = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
