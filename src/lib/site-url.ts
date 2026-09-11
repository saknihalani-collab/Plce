import 'server-only';

import { headers } from 'next/headers';

/**
 * The origin this deployment is actually reachable at.
 *
 * `env.siteUrl` exists for this, but it falls back to
 * `http://localhost:3000` when `NEXT_PUBLIC_SITE_URL` is unset — which
 * is correct on a laptop and quietly wrong everywhere else. A hosted
 * deployment that never had the variable set will happily put localhost
 * into a confirmation email, and the person who clicks it gets
 * "localhost refused to connect" with nothing to explain why.
 *
 * So the configured value wins when it exists, and the request's own
 * origin stands in when it does not. A server cannot be wrong about the
 * host it was just asked for.
 *
 * On the safety of trusting a header: `x-forwarded-host` is attacker
 * controllable in principle, so this must never be the *only* thing
 * guarding a redirect. It is not. Supabase only honours an
 * `emailRedirectTo` that matches its configured Redirect URLs and falls
 * back to the project's Site URL otherwise, so a forged host produces a
 * link to the real site rather than to the attacker's.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return stripTrailingSlash(configured);

  const inbound = await headers();
  const host = inbound.get('x-forwarded-host') ?? inbound.get('host');

  if (host) {
    // Hosts terminate TLS at the edge, so the inbound request is plain
    // HTTP and only the forwarded header knows the real scheme.
    const forwarded = inbound.get('x-forwarded-proto');
    const protocol = forwarded ?? (isLocal(host) ? 'http' : 'https');
    return `${protocol}://${host}`;
  }

  // No configuration and no request to learn from: development.
  return 'http://localhost:3000';
}

/** An absolute URL for a path on this deployment. */
export async function absoluteUrl(path: string): Promise<string> {
  const origin = await siteOrigin();
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isLocal(host: string): boolean {
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}
