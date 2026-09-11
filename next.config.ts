import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'api.mapbox.com' },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],

    /*
      Studio photographs go up through a Server Action, and the default
      body limit for one of those is 1 MB — smaller than almost any
      photograph a camera or phone produces. Exceeding it fails at the
      framework boundary before any of our code runs, so it cannot be
      caught and reported; it surfaces as a blank error page.

      4 MB rather than more: a serverless request body on Vercel is
      capped around 4.5 MB, so a larger number here would only move the
      same failure to the platform edge. `MAX_UPLOAD_BYTES` matches, and
      the file input checks before it submits, so the two limits below
      this one refuse first and say why.
    */
    serverActions: { bodySizeLimit: '4mb' },
  },

  /**
   * Baseline security headers. TLS/HSTS is the host's job; these cover
   * clickjacking, MIME sniffing, referrer leakage, and browser features
   * the product never asks for.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)',
          },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
      {
        // The admin surface is never a search result and never framed.
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;
