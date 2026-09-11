import type { Metadata } from 'next';

import {
  BlockedTimeEditor,
  OpeningHoursEditor,
} from '@/features/studio/components/availability-editor';
import { assertStudioPermission, requireStudioContext } from '@/features/studio/lib/context';
import { todayInZone, zonedToInstant } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Availability', robots: { index: false } };

export default async function AvailabilityPage() {
  const context = await requireStudioContext('/studio/availability');
  assertStudioPermission(context, 'availability.edit');

  const { repository, studio } = context;
  const spaces = studio.spaces.filter((space) => space.isActive);
  const spaceIds = spaces.map((space) => space.id);

  const today = todayInZone(studio.timezone);
  const from = zonedToInstant(today, '00:00', studio.timezone).toISOString();

  const [rules, blocked] = await Promise.all([
    repository.listAvailabilityRules(spaceIds),
    repository.listBlockedTimes({ spaceIds, from }),
  ]);

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">When you are open</p>
      <h1 className="display mt-3 text-4xl text-ink">Availability</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        Hours decide what customers can book on your public listing and what the calendar
        will accept. Blocking time takes a slot out without inventing a fake booking.
      </p>

      <div className="mt-8 space-y-6">
        <OpeningHoursEditor spaces={spaces} rules={rules} />
        <BlockedTimeEditor
          spaces={spaces}
          blocked={blocked.sort((a, b) => a.startsAt.localeCompare(b.startsAt))}
          timezone={studio.timezone}
          defaultDate={today}
        />
      </div>
    </div>
  );
}
