import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Where this deployment thinks it lives.
 *
 * Getting this wrong put `http://localhost:3000` into a confirmation
 * email sent from production, and into the production sitemap. The
 * precedence below is the fix, so it is pinned.
 */

const ORIGINAL = { ...process.env };
let inboundHeaders: Record<string, string> = {};

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => inboundHeaders[name.toLowerCase()] ?? null,
  }),
}));

afterEach(() => {
  process.env = { ...ORIGINAL };
  inboundHeaders = {};
  vi.resetModules();
});

async function load(env: Record<string, string | undefined>, hdrs: Record<string, string> = {}) {
  process.env = { ...ORIGINAL, ...env } as NodeJS.ProcessEnv;
  inboundHeaders = hdrs;
  vi.resetModules();
  return import('@/lib/site-url');
}

describe('siteOrigin', () => {
  it('prefers the configured NEXT_PUBLIC_SITE_URL', async () => {
    const { siteOrigin } = await load(
      { NEXT_PUBLIC_SITE_URL: 'https://www.findplce.com' },
      { host: 'someone-else.example' },
    );
    await expect(siteOrigin()).resolves.toBe('https://www.findplce.com');
  });

  it('strips a trailing slash so paths do not double up', async () => {
    const { siteOrigin } = await load({ NEXT_PUBLIC_SITE_URL: 'https://www.findplce.com/' });
    await expect(siteOrigin()).resolves.toBe('https://www.findplce.com');
  });

  it('falls back to the request origin when the variable is unset', async () => {
    const { siteOrigin } = await load(
      { NEXT_PUBLIC_SITE_URL: undefined },
      { 'x-forwarded-host': 'www.findplce.com', 'x-forwarded-proto': 'https' },
    );
    await expect(siteOrigin()).resolves.toBe('https://www.findplce.com');
  });

  it('never emits localhost for a real host, even with no proto header', async () => {
    const { siteOrigin } = await load(
      { NEXT_PUBLIC_SITE_URL: undefined },
      { host: 'www.findplce.com' },
    );
    await expect(siteOrigin()).resolves.toBe('https://www.findplce.com');
  });

  it('still uses http for local development', async () => {
    const { siteOrigin } = await load(
      { NEXT_PUBLIC_SITE_URL: undefined },
      { host: 'localhost:3100' },
    );
    await expect(siteOrigin()).resolves.toBe('http://localhost:3100');
  });

  it('prefers x-forwarded-host over host, as proxies set both', async () => {
    const { siteOrigin } = await load(
      { NEXT_PUBLIC_SITE_URL: undefined },
      { 'x-forwarded-host': 'www.findplce.com', host: 'internal.vercel.app', 'x-forwarded-proto': 'https' },
    );
    await expect(siteOrigin()).resolves.toBe('https://www.findplce.com');
  });
});

describe('absoluteUrl', () => {
  it('builds the confirmation callback correctly', async () => {
    const { absoluteUrl } = await load({ NEXT_PUBLIC_SITE_URL: 'https://www.findplce.com' });
    await expect(absoluteUrl('/auth/callback')).resolves.toBe(
      'https://www.findplce.com/auth/callback',
    );
  });

  it('tolerates a path with no leading slash', async () => {
    const { absoluteUrl } = await load({ NEXT_PUBLIC_SITE_URL: 'https://www.findplce.com' });
    await expect(absoluteUrl('auth/callback')).resolves.toBe(
      'https://www.findplce.com/auth/callback',
    );
  });
});
