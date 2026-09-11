import type { MetadataRoute } from 'next';

import { env } from '@/lib/env';

/**
 * The marketplace is meant to be found. The operating tools are not —
 * `/studio` and `/admin` hold other people's business data and have no
 * business in an index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/studio', '/account', '/bookings', '/api'],
    },
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
