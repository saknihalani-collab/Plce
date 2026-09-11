import type { Metadata } from 'next';

import { AmenityManager } from '@/features/admin/components/taxonomy-manager';
import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Amenities', robots: { index: false } };

export default async function AdminAmenitiesPage() {
  await requireAdmin('/admin/amenities');
  const repository = await getRepository();
  const amenities = await repository.listAmenities({ includeInactive: true });

  return (
    <div className="max-w-5xl">
      <p className="eyebrow">Marketplace content</p>
      <h1 className="display mt-3 text-4xl text-ink">Amenities</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        What a space can offer. Owners tick these when they apply, and customers filter on
        them — so the wording here is the wording everyone reads.
      </p>

      <div className="mt-8">
        <AmenityManager amenities={amenities} />
      </div>
    </div>
  );
}
