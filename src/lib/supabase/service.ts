import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { env, requireSupabaseEnv } from '@/lib/env';

/**
 * The service-role client. Bypasses row-level security entirely.
 *
 * Exactly one caller is entitled to it: the WhatsApp webhook. An inbound
 * message arrives from Meta with no browser session to borrow authority
 * from, so there is no user JWT for RLS to evaluate — the request is
 * authenticated by an HMAC signature and the sender's phone number
 * instead, and the organisation is resolved from `whatsapp_accounts`
 * before anything is read or written.
 *
 * Everywhere else must use `lib/supabase/server.ts`. Reaching for this
 * client to make an awkward query work would silently remove the
 * tenant boundary from that code path.
 */
export function createServiceClient() {
  const { url } = requireSupabaseEnv();
  const key = env.supabase.serviceRoleKey;

  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. The WhatsApp webhook cannot act on behalf of a studio without it.',
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
