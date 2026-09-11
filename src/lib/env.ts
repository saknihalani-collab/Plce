/**
 * Environment access, in one place.
 *
 * PL·CE runs in one of two modes:
 *   • live — Supabase is configured; everything hits real infrastructure.
 *   • demo — no credentials present; a seeded in-memory database stands in.
 *
 * Demo mode exists so the whole marketplace loop — apply, review, approve,
 * discover, book, manage, WhatsApp — can be run and judged with
 * `npm run dev` and nothing else. It is chosen by configuration, never by
 * a code path, so the live implementation stays the only one feature code
 * is written against.
 */

const read = (value: string | undefined) => value?.trim() || null;

const supabaseUrl = read(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = read(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const env = {
  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: read(process.env.SUPABASE_SERVICE_ROLE_KEY),
  },
  whatsapp: {
    phoneNumberId: read(process.env.WHATSAPP_PHONE_NUMBER_ID),
    accessToken: read(process.env.WHATSAPP_ACCESS_TOKEN),
    verifyToken: read(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecret: read(process.env.WHATSAPP_APP_SECRET),
  },
  ai: {
    provider: read(process.env.AI_PROVIDER) ?? 'anthropic',
    anthropicKey: read(process.env.ANTHROPIC_API_KEY),
    anthropicModel: read(process.env.ANTHROPIC_MODEL) ?? 'claude-sonnet-5',
  },
  maps: {
    mapboxToken: read(process.env.NEXT_PUBLIC_MAPBOX_TOKEN),
  },
  payments: {
    provider: read(process.env.PAYMENTS_PROVIDER) ?? 'razorpay',
    razorpayKeyId: read(process.env.RAZORPAY_KEY_ID),
    razorpayKeySecret: read(process.env.RAZORPAY_KEY_SECRET),
  },
  siteUrl: read(process.env.NEXT_PUBLIC_SITE_URL) ?? 'http://localhost:3000',
} as const;

export const isSupabaseConfigured = Boolean(env.supabase.url && env.supabase.anonKey);
export const isDemoMode = !isSupabaseConfigured;

export const isMapsConfigured = Boolean(env.maps.mapboxToken);
export const isPaymentsConfigured = Boolean(env.payments.razorpayKeyId && env.payments.razorpayKeySecret);

/** The webhook cannot run at all without a secret to verify signatures with. */
export const isWhatsAppConfigured = Boolean(
  env.whatsapp.appSecret && env.whatsapp.verifyToken && env.whatsapp.accessToken,
);

export const isAiConfigured = Boolean(env.ai.anthropicKey);

/**
 * Demo mode is a development convenience, and falling into it silently in
 * production is the worst possible failure: the site comes up, looks
 * entirely healthy, and quietly serves an in-memory marketplace that
 * resets on every cold start — including the approval decisions an admin
 * thought they had made. A mistyped environment variable on the host
 * would do exactly that.
 *
 * So a production deployment refuses to serve data in demo mode unless it
 * is asked for explicitly.
 *
 * This is a function, called from the composition root, rather than a
 * check that runs when this module is first imported. Module-level
 * throwing looks tidier and behaves far worse: `env` is also imported by
 * the Supabase middleware, so on a host with no credentials the failure
 * landed in edge middleware *before any page rendered*. Every route
 * returned an opaque `MIDDLEWARE_INVOCATION_FAILED`, and the explanation
 * below — the one thing that would have made the cause obvious — was
 * never shown to anybody.
 *
 * Failing where the demo repository is actually handed out keeps the
 * protection identical and puts the message somewhere a person reads it.
 */
export function assertNotAccidentalDemoMode(): void {
  if (!isDemoMode) return;
  if (process.env.NODE_ENV !== 'production') return;

  // Compiling without credentials is normal — CI has none, and hosts
  // inject variables at build *and* run time. Only a live server serving
  // requests is a real problem.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.ALLOW_DEMO_MODE === 'true') return;

  throw new Error(
    [
      'PL·CE is running a production build without Supabase credentials, which would',
      'silently serve the in-memory demo marketplace.',
      '',
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the host,',
      'or set ALLOW_DEMO_MODE=true if this deployment is meant to be a demo.',
    ].join('\n'),
  );
}

/** Narrowed accessor for code paths that require real credentials. */
export function requireSupabaseEnv() {
  if (!env.supabase.url || !env.supabase.anonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return { url: env.supabase.url, anonKey: env.supabase.anonKey };
}
