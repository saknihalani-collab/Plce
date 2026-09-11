import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The production demo-mode guard.
 *
 * It exists to stop a misconfigured deploy silently serving the in-memory
 * marketplace. It must fire when credentials are missing in production —
 * and, just as importantly, it must not fire anywhere else, because the
 * last version of it crashed edge middleware on every route.
 */

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

async function loadGuard(vars: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL, ...vars } as NodeJS.ProcessEnv;
  vi.resetModules();
  return import('@/lib/env');
}

describe('demo-mode guard', () => {
  it('does not throw merely on import, whatever the environment', async () => {
    // The whole point of the change: importing `env` is safe, so the
    // Supabase middleware cannot take the site down with it.
    await expect(
      loadGuard({
        NODE_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
        ALLOW_DEMO_MODE: undefined,
        NEXT_PHASE: undefined,
      }),
    ).resolves.toBeDefined();
  });

  it('throws when a production server has no credentials', async () => {
    const env = await loadGuard({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      ALLOW_DEMO_MODE: undefined,
      NEXT_PHASE: undefined,
    });

    expect(() => env.assertNotAccidentalDemoMode()).toThrow(/without Supabase credentials/);
  });

  it('allows an explicit demo deployment', async () => {
    const env = await loadGuard({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      ALLOW_DEMO_MODE: 'true',
      NEXT_PHASE: undefined,
    });

    expect(() => env.assertNotAccidentalDemoMode()).not.toThrow();
  });

  it('allows the production build itself, which has no credentials', async () => {
    const env = await loadGuard({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      ALLOW_DEMO_MODE: undefined,
      NEXT_PHASE: 'phase-production-build',
    });

    expect(() => env.assertNotAccidentalDemoMode()).not.toThrow();
  });

  it('stays quiet in development', async () => {
    const env = await loadGuard({
      NODE_ENV: 'development',
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      ALLOW_DEMO_MODE: undefined,
      NEXT_PHASE: undefined,
    });

    expect(() => env.assertNotAccidentalDemoMode()).not.toThrow();
  });

  it('refuses a half-configured deployment even with the demo flag set', async () => {
    // The realistic way to get here is a misspelled variable name, and
    // it must not be excusable by a flag committed to the repository.
    const env = await loadGuard({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      ALLOW_DEMO_MODE: 'true',
      NEXT_PHASE: undefined,
    });

    expect(() => env.assertNotAccidentalDemoMode()).toThrow(/one Supabase variable set/);
  });

  it('refuses the mirror image of that too', async () => {
    const env = await loadGuard({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      ALLOW_DEMO_MODE: 'true',
      NEXT_PHASE: undefined,
    });

    expect(() => env.assertNotAccidentalDemoMode()).toThrow(/one Supabase variable set/);
  });

  it('names which half is missing, so the typo is findable', async () => {
    const env = await loadGuard({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      ALLOW_DEMO_MODE: undefined,
      NEXT_PHASE: undefined,
    });

    expect(() => env.assertNotAccidentalDemoMode()).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY\s+MISSING/,
    );
  });

  it('stays quiet when Supabase is configured', async () => {
    const env = await loadGuard({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      ALLOW_DEMO_MODE: undefined,
      NEXT_PHASE: undefined,
    });

    expect(env.isDemoMode).toBe(false);
    expect(() => env.assertNotAccidentalDemoMode()).not.toThrow();
  });
});
