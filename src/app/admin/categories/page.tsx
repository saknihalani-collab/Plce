import type { Metadata } from 'next';

import { CategoryManager } from '@/features/admin/components/taxonomy-manager';
import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Categories', robots: { index: false } };

export default async function AdminCategoriesPage() {
  await requireAdmin('/admin/categories');
  const repository = await getRepository();
  const categories = await repository.listCategories({ includeInactive: true });

  return (
    <div className="max-w-5xl">
      <p className="eyebrow">Marketplace content</p>
      <h1 className="display mt-3 text-4xl text-ink">Categories</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        The types of space PL·CE lists. These are the filters on Discovery and the choices on
        the application form — adding one takes effect immediately, with no deploy.
      </p>

      <div className="mt-8">
        <CategoryManager categories={categories} />
      </div>
    </div>
  );
}
