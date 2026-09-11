import type { Metadata } from 'next';

import { SpaceManager } from '@/features/studio/components/space-manager';
import { assertStudioPermission, requireStudioContext } from '@/features/studio/lib/context';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Spaces', robots: { index: false } };

export default async function SpacesPage() {
  const context = await requireStudioContext('/studio/spaces');
  assertStudioPermission(context, 'space.edit');

  const amenities = await context.repository.listAmenities();

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Your rooms</p>
      <h1 className="display mt-3 text-4xl text-ink">Spaces and pricing</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        Rates, capacity and turnaround are yours to set — PL·CE reviews how a studio is
        described, not what it charges. Changes here take effect on the next booking.
      </p>

      <div className="mt-8">
        <SpaceManager spaces={context.studio.spaces} amenities={amenities} />
      </div>
    </div>
  );
}
