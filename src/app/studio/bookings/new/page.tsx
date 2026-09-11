import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { StudioBookingForm } from '@/features/studio/components/booking-form';
import { assertStudioPermission, requireStudioContext } from '@/features/studio/lib/context';
import { isValidDateString, todayInZone } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'New booking', robots: { index: false } };

/** Accepts only a well-formed wall-clock time from the URL. */
function asTime(value: string | undefined): string | undefined {
  return value && /^\d{2}:\d{2}$/.test(value) ? value : undefined;
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; space?: string; start?: string; end?: string }>;
}) {
  const context = await requireStudioContext('/studio/bookings/new');
  assertStudioPermission(context, 'booking.create');

  const { repository, studio, organizationId } = context;
  const params = await searchParams;

  const customers = await repository.listCustomers(organizationId, { pageSize: 100 });
  const today = todayInZone(studio.timezone);
  const date = params.date && isValidDateString(params.date) ? params.date : today;

  // Arriving from a calendar slot: the date, space and hours are already
  // decided, so the owner only has to say who it is for.
  const start = asTime(params.start);
  const end = asTime(params.end);
  const fromSlot = Boolean(start && end && params.space);

  return (
    <div className="max-w-2xl">
      <Link
        href="/studio/bookings"
        className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-clay-ink"
      >
        <ArrowLeft className="size-4" />
        Bookings
      </Link>

      <p className="eyebrow mt-6">Add by hand</p>
      <h1 className="display mt-3 text-4xl text-ink">New booking</h1>
      <p className="mt-2 text-sm text-ink-muted">
        {fromSlot
          ? 'Time and space are already filled in from the slot you picked. Just say who it is for.'
          : 'For anything that did not come through PL·CE. It goes through the same availability check, so it cannot land on top of something else.'}
      </p>

      <div className="mt-8">
        <StudioBookingForm
          spaces={studio.spaces.filter((space) => space.isActive)}
          customers={customers.items}
          defaultDate={date}
          defaultSpaceId={params.space}
          defaultStart={start}
          defaultEnd={end}
        />
      </div>
    </div>
  );
}
