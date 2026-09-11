import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';

import { Badge, ListingStatusBadge } from '@/components/ui/badge';
import { StudioImage } from '@/components/ui/studio-image';
import {
  ListingEditor,
  ListingSideActions,
} from '@/features/admin/components/listing-editor';
import { ReviewActions } from '@/features/admin/components/review-actions';
import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { formatDate, formatNumber, formatRelativeTime, pluralise } from '@/lib/format';
import { isPubliclyVisible, visibilityReason } from '@/lib/listing/visibility';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Manage studio', robots: { index: false } };

export default async function AdminStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin(`/admin/studios/${id}`);

  const repository = await getRepository();
  const studio = await repository.getStudio(id);
  if (!studio) notFound();

  const [categories, application, audit, bookings] = await Promise.all([
    repository.listCategories({ includeInactive: true }),
    repository.getApplicationForStudio(studio.id),
    repository.listAdminActions({ entityId: studio.id, pageSize: 10 }),
    repository.listBookings(studio.organizationId, { pageSize: 1 }),
  ]);

  const live = isPubliclyVisible(studio);

  return (
    <div className="max-w-6xl">
      <Link
        href="/admin/studios"
        className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-clay-ink"
      >
        <ArrowLeft className="size-4" />
        All studios
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-[--radius-sm] bg-stone">
            <StudioImage
              src={studio.coverImage?.url}
              alt={studio.name}
              name={studio.name}
              sizes="64px"
            />
          </div>
          <div>
            <p className="eyebrow">Listing</p>
            <h1 className="display mt-2 text-4xl text-ink">{studio.name}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {studio.host.organizationName} · {studio.location.area}, {studio.location.city}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <ListingStatusBadge status={studio.status} />
            {live ? <Badge tone="sage">On Discovery</Badge> : <Badge tone="neutral">Hidden</Badge>}
          </div>
          {live ? (
            <Link
              href={`/studios/${studio.slug}`}
              className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-clay-ink"
            >
              <ExternalLink className="size-4" />
              View public listing
            </Link>
          ) : (
            <p className="text-xs text-ink-soft">{visibilityReason(studio)}</p>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <section className="card p-5">
            <h2 className="eyebrow mb-5">Edit listing</h2>
            <ListingEditor studio={studio} categories={categories} />
          </section>

          <section className="card p-5">
            <h2 className="eyebrow mb-4">Spaces</h2>
            <ul className="divide-y divide-line-soft">
              {studio.spaces.map((space) => (
                <li key={space.id} className="flex items-baseline justify-between gap-4 py-3 first:pt-0">
                  <span>
                    <span className="block text-sm text-ink">{space.name}</span>
                    <span className="block text-xs text-ink-soft">
                      Up to {space.capacity} · {space.minBookingMinutes / 60} hr minimum
                    </span>
                  </span>
                  <span className="tabular text-sm text-ink-muted">
                    ₹{space.hourlyRate}/hr
                  </span>
                </li>
              ))}
              {studio.spaces.length === 0 ? (
                <li className="py-3 text-sm text-ink-soft">No spaces on this listing.</li>
              ) : null}
            </ul>
            <p className="mt-4 text-xs text-ink-soft">
              Pricing and capacity belong to the studio. PL·CE edits the listing, not the
              owner&rsquo;s rates.
            </p>
          </section>

          {audit.items.length > 0 ? (
            <section className="card p-5">
              <h2 className="eyebrow mb-4">What PL·CE has done here</h2>
              <ul className="space-y-3">
                {audit.items.map((action) => (
                  <li key={action.id} className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0">
                      <span className="block text-sm text-ink">
                        {action.action.replace('admin.', '').replace(/_/g, ' ')}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {action.adminName}
                        {action.note ? ` · ${action.note.slice(0, 90)}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-soft">
                      {formatRelativeTime(action.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          {application ? (
            <ReviewActions
              applicationId={application.id}
              status={application.status}
              studioName={studio.name}
            />
          ) : null}

          <div className="card p-5">
            <p className="eyebrow">Curation</p>
            <div className="mt-4">
              <ListingSideActions studio={studio} />
            </div>
          </div>

          <div className="card p-5">
            <p className="eyebrow">At a glance</p>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Spaces">{pluralise(studio.spaces.length, 'space')}</Row>
              <Row label="Images">{studio.images.length}</Row>
              <Row label="Bookings">{formatNumber(studio.bookingCount)}</Row>
              <Row label="Across the org">{formatNumber(bookings.total)}</Row>
              <Row label="Created">{formatDate(studio.createdAt.slice(0, 10))}</Row>
              <Row label="Published">
                {studio.publishedAt ? formatDate(studio.publishedAt.slice(0, 10)) : '—'}
              </Row>
            </dl>
          </div>

          {application ? (
            <Link
              href={`/admin/applications/${application.id}`}
              className="btn btn-secondary w-full"
            >
              Open full application
            </Link>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular text-ink">{children}</dd>
    </div>
  );
}
