import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Mail, Phone } from 'lucide-react';

import { ApplicationTimeline } from '@/features/application/components/timeline';
import { ListingStatusBadge } from '@/components/ui/badge';
import { StudioImage } from '@/components/ui/studio-image';
import { MarkUnderReview, ReviewActions } from '@/features/admin/components/review-actions';
import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { formatDate, formatMoney, formatPhone, pluralise } from '@/lib/format';
import { readinessProblems } from '@/lib/listing/service';
import { diffPendingChanges } from '@/lib/listing/changes';
import { WEEKDAY_LABELS, type Weekday } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Review application', robots: { index: false } };

/**
 * The review page.
 *
 * Everything the owner submitted, on one screen, in the order an admin
 * actually reads it: what the space is, who runs it, what is bookable,
 * what it costs, and what it looks like. The decision panel stays in
 * view on the right.
 */
export default async function ApplicationReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin(`/admin/applications/${id}`);

  const repository = await getRepository();
  const summary = await repository.getApplicationSummary(id);
  if (!summary) notFound();

  const [studio, events, rules] = await Promise.all([
    repository.getStudio(summary.studioId),
    repository.listApplicationEvents(id),
    repository.getStudio(summary.studioId).then((found) =>
      found ? repository.listAvailabilityRules(found.spaces.map((space) => space.id)) : [],
    ),
  ]);
  if (!studio) notFound();

  const problems = readinessProblems(studio);
  const pending = studio.pendingChanges ? diffPendingChanges(studio, studio.pendingChanges) : [];

  // Hours are asked once for the studio, so the first space's week is
  // representative — and where it is not, the spaces list says so.
  const firstSpaceRules = rules
    .filter((rule) => rule.spaceId === studio.spaces[0]?.id)
    .sort((a, b) => a.weekday - b.weekday);

  return (
    <div className="max-w-6xl">
      <MarkUnderReview applicationId={id} status={summary.application.status} />

      <Link
        href="/admin/applications"
        className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-clay-ink"
      >
        <ArrowLeft className="size-4" />
        Back to the queue
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Application</p>
          <h1 className="display mt-3 text-4xl text-ink">{studio.name}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {studio.location.area}, {studio.location.city} · {studio.category.name} ·{' '}
            {pluralise(studio.spaces.length, 'space')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ListingStatusBadge status={summary.application.status} />
          {studio.isPublished && !studio.isSuspended ? (
            <Link
              href={`/studios/${studio.slug}`}
              className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-clay-ink"
            >
              <ExternalLink className="size-4" />
              Live listing
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* ── The submission ──────────────────────────────────── */}
        <div className="min-w-0 space-y-8">
          {problems.length > 0 ? (
            <Callout tone="amber" title="Incomplete submission">
              <ul className="space-y-1.5">
                {problems.map((problem) => (
                  <li key={problem}>· {problem}</li>
                ))}
              </ul>
            </Callout>
          ) : null}

          {pending.length > 0 ? (
            <Callout tone="brand" title="Owner has proposed changes">
              <ul className="space-y-2">
                {pending.map((change) => (
                  <li key={change.field}>
                    <span className="block text-xs uppercase tracking-wider text-ink-soft">
                      {change.field}
                    </span>
                    <span className="line-through opacity-60">{change.before}</span>{' '}
                    <span className="text-ink">→ {change.after}</span>
                  </li>
                ))}
              </ul>
            </Callout>
          ) : null}

          {/* Photographs */}
          <Section title="Photographs" count={studio.images.length}>
            {studio.images.length === 0 ? (
              <p className="text-sm text-ink-soft">None submitted.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {studio.images.map((image) => (
                  <li
                    key={image.id}
                    className="relative aspect-[4/3] overflow-hidden rounded-[--radius-sm] bg-stone"
                  >
                    <StudioImage
                      src={image.url}
                      alt={image.alt}
                      name={studio.name}
                      sizes="240px"
                    />
                    {image.isCover ? (
                      <span className="absolute left-2 top-2 rounded-full bg-paper/85 px-2 py-0.5 text-[0.625rem] uppercase tracking-wider text-ink">
                        Cover
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Studio */}
          <Section title="The studio">
            {studio.tagline ? (
              <p className="display-italic text-lg text-ink">{studio.tagline}</p>
            ) : null}
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
              {studio.description}
            </p>

            <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <Detail label="Category">{studio.category.name}</Detail>
              <Detail label="Address">
                {studio.location.addressLine}
                <span className="block text-ink-soft">
                  {studio.location.area}, {studio.location.city}{' '}
                  {studio.location.postalCode ?? ''}
                </span>
              </Detail>
              <Detail label="Instagram">
                {studio.instagram ? `@${studio.instagram}` : '—'}
              </Detail>
              <Detail label="Website">{studio.website ?? '—'}</Detail>
            </dl>
          </Section>

          {/* Owner */}
          <Section title="Owner">
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <Detail label="Account">
                {summary.ownerName}
                <span className="block text-ink-soft">{summary.ownerEmail}</span>
              </Detail>
              <Detail label="Business">{studio.host.organizationName}</Detail>
              <Detail label="Listed contact">
                {studio.contactName}
                <span className="mt-1 flex flex-wrap gap-x-4 text-ink-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5" />
                    {formatPhone(studio.contactPhone)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-3.5" />
                    {studio.contactEmail}
                  </span>
                </span>
              </Detail>
              <Detail label="On PL·CE since">
                {formatDate(studio.host.memberSince.slice(0, 10))}
              </Detail>
            </dl>
          </Section>

          {/* Spaces */}
          <Section title="Spaces and pricing" count={studio.spaces.length}>
            {studio.spaces.length === 0 ? (
              <p className="text-sm text-ink-soft">No bookable spaces submitted.</p>
            ) : (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="data-table min-w-[520px]">
                  <thead>
                    <tr>
                      <th className="pl-0">Space</th>
                      <th>Capacity</th>
                      <th>Size</th>
                      <th>Hourly</th>
                      <th>Day</th>
                      <th className="pr-0">Minimum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studio.spaces.map((space) => (
                      <tr key={space.id}>
                        <td className="pl-0">
                          <p className="text-ink">{space.name}</p>
                          {space.description ? (
                            <p className="text-xs text-ink-soft">{space.description}</p>
                          ) : null}
                        </td>
                        <td className="tabular text-ink-muted">{space.capacity}</td>
                        <td className="tabular text-ink-muted">
                          {space.sizeSqft ? `${space.sizeSqft} sq ft` : '—'}
                        </td>
                        <td className="tabular text-ink">{formatMoney(space.hourlyRate)}</td>
                        <td className="tabular text-ink-muted">
                          {space.fullDayRate ? formatMoney(space.fullDayRate) : '—'}
                        </td>
                        <td className="tabular pr-0 text-ink-muted">
                          {space.minBookingMinutes / 60} hr
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Hours */}
          <Section title="Operating hours">
            {firstSpaceRules.length === 0 ? (
              <p className="text-sm text-butter-ink">
                No opening hours set. Nothing can be booked until there are.
              </p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {firstSpaceRules.map((rule) => (
                  <li key={rule.id} className="flex justify-between gap-4 text-sm">
                    <span className="text-ink-muted">
                      {WEEKDAY_LABELS[rule.weekday as Weekday]}
                    </span>
                    <span className="tabular text-ink">
                      {rule.isClosed ? 'Closed' : `${rule.opensAt} – ${rule.closesAt}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Amenities */}
          <Section title="Amenities" count={studio.amenities.length}>
            {studio.amenities.length === 0 ? (
              <p className="text-sm text-ink-soft">None selected.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {studio.amenities.map((amenity) => (
                  <li
                    key={amenity.id}
                    className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted"
                  >
                    {amenity.name}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Rules */}
          <Section title="Rules and policy">
            {studio.rules.length > 0 ? (
              <ul className="space-y-1.5 text-sm text-ink-muted">
                {studio.rules.map((rule) => (
                  <li key={rule}>· {rule}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-soft">No house rules given.</p>
            )}

            <p className="mt-4 text-xs uppercase tracking-wider text-ink-soft">
              Cancellation
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              {studio.cancellationPolicy || 'Not stated.'}
            </p>

            {studio.equipment.length > 0 ? (
              <>
                <p className="mt-4 text-xs uppercase tracking-wider text-ink-soft">
                  Equipment
                </p>
                <ul className="mt-1 grid gap-x-8 gap-y-1 text-sm text-ink-muted sm:grid-cols-2">
                  {studio.equipment.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </Section>

          {/* Timeline */}
          <Section title="Application timeline" count={events.length}>
            <ApplicationTimeline events={events} />
          </Section>
        </div>

        {/* ── Decision ────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <ReviewActions
            applicationId={id}
            status={summary.application.status}
            studioName={studio.name}
          />

          <div className="card mt-4 p-5">
            <p className="eyebrow">Edit directly</p>
            <p className="mt-2 text-sm text-ink-muted">
              Fix a name, a category or the area without sending it back to the owner.
            </p>
            <Link href={`/admin/studios/${studio.id}`} className="btn btn-secondary mt-4 w-full">
              Open listing editor
            </Link>
          </div>

          {summary.application.adminFeedback ? (
            <div className="card mt-4 p-5">
              <p className="eyebrow">Last note to the owner</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {summary.application.adminFeedback}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="eyebrow">{title}</h2>
        {count != null ? <span className="tabular text-xs text-ink-soft">{count}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: 'amber' | 'brand';
  title: string;
  children: React.ReactNode;
}) {
  const tones = {
    amber: 'border-butter/40 bg-butter/10 text-butter-ink',
    brand: 'border-clay/40 bg-clay/10 text-clay-ink',
  }[tone];

  return (
    <div className={`rounded-[--radius] border p-5 ${tones}`}>
      <p className="font-medium">{title}</p>
      <div className="mt-2 text-sm text-ink-muted">{children}</div>
    </div>
  );
}
