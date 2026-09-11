import 'server-only';

import { DemoAuthGateway } from '@/lib/auth/demo-gateway';
import type { AuthGateway } from '@/lib/auth/gateway';
import { SupabaseAuthGateway } from '@/lib/auth/supabase-gateway';
import { DemoRepository } from '@/lib/data/demo/repository';
import type { DataRepository } from '@/lib/data/repository';
import { isDemoMode } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

/**
 * Composition root.
 *
 * The only place in the codebase that knows which implementation is in
 * play. Everything above this line programs against the interfaces, which
 * is what lets the whole marketplace be exercised end to end with no
 * credentials and no code changes.
 */

export async function getRepository(): Promise<DataRepository> {
  if (isDemoMode) return new DemoRepository();

  const { SupabaseRepository } = await import('@/lib/data/supabase/repository');
  return new SupabaseRepository(await createClient());
}

/**
 * The repository for work with no signed-in user behind it.
 *
 * Exactly one caller is entitled to it: the WhatsApp webhook. An inbound
 * message arrives from Meta with no browser session, so there is no JWT
 * for row-level security to evaluate — the request is authenticated by
 * an HMAC signature and the sender's phone number instead, and the
 * organisation is resolved from `whatsapp_accounts` before anything is
 * read or written.
 *
 * Everywhere else must use `getRepository`. Reaching for this to make an
 * awkward query work would silently remove the tenant boundary from that
 * code path.
 */
export async function getServiceRepository(): Promise<DataRepository> {
  if (isDemoMode) return new DemoRepository();

  const [{ SupabaseRepository }, { createServiceClient }] = await Promise.all([
    import('@/lib/data/supabase/repository'),
    import('@/lib/supabase/service'),
  ]);
  return new SupabaseRepository(createServiceClient());
}

export async function getAuthGateway(): Promise<AuthGateway> {
  if (isDemoMode) return new DemoAuthGateway();
  return new SupabaseAuthGateway(await createClient());
}

export type { DataRepository } from '@/lib/data/repository';
export { RepositoryError } from '@/lib/data/repository';
