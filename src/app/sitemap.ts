import type { MetadataRoute } from 'next';

import { getRepository } from '@/lib/data';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Built from the same public query `/discover` uses, so a studio that is
 * not approved-and-published cannot appear here either.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const repository = await getRepository();

  const [studios, categories] = await Promise.all([
    repository.listPublicStudios({ pageSize: 100 }),
    repository.listCategories(),
  ]);

  return [
    { url: env.siteUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${env.siteUrl}/discover`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${env.siteUrl}/list-your-studio`, changeFrequency: 'monthly', priority: 0.8 },
    ...categories.map((category) => ({
      url: `${env.siteUrl}/discover?category=${category.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...studios.items.map((studio) => ({
      url: `${env.siteUrl}/studios/${studio.slug}`,
      lastModified: new Date(studio.createdAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
