import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock, ExternalLink, PencilLine } from 'lucide-react';

import { ListingStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApplicationTimeline } from '@/features/application/components/timeline';
import { requireStudioContext } from '@/features/studio/lib/context';
import { CopyLink } from '@/features/studio/components/copy-link';
import { env } from '@/lib/env';
import { formatRelativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Application', robots: { index: false } };

/**
 * The owner's side of the review conversation.
 *
 * One screen that answers "what is happening with my listing?" without
 * anyone having to email PL·CE. When changes are requested, the admin's
 * actual words appear here — not a status code.
 */
export default async function ApplicationStatusPage() {
  const { repository, studio, application, isLive } = await requireStudioContext(
    '/studio/application',
  );

  const events = application ? await repository.listApplicationEvents(application.id) : [];
  const status = application?.status ?? studio.status;
  const publicUrl = `${env.siteUrl}/studios/${studio.slug}`;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Your application</p>
          <h1 className="display mt-3 text-4xl text-ink">{studio.name}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {studio.location.area}, {studio.location.city}
            {application?.submittedAt
              ? ` · submitted ${formatRelativeTime(application.submittedAt)}`
              : ''}
          </p>
        </div>
        <ListingStatusBadge status={status} />
      </div>

      {/* The headline state */}
      <div className="mt-8">
        {status === 'approved' && isLive ? (
          <Panel tone="sage" title="Your studio is live 🎉">
            <p>
              {studio.name} is on PL·CE Discovery now. Bookings land in your calendar the
              moment they are made.
            </p>

            <div className="mt-5 rounded-[--radius-sm] bg-stone-deep p-3">
              <p className="eyebrow mb-1.5">Public listing</p>
              <CopyLink url={publicUrl} />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/studio">
                  Open your dashboard
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={`/studios/${studio.slug}`}>
                  <ExternalLink className="size-4" />
                  View listing
                </Link>
              </Button>
            </div>
          </Panel>
        ) : null}

        {status === 'submitted' || status === 'under_review' ? (
          <Panel tone="amber" title="Under review">
            <p>
              Your studio has been submitted to PL·CE. We read every application by hand —
              usually within two working days. We will get back to you either way.
            </p>
            <p className="mt-3 text-sm">
              Nothing to do in the meantime. If we need something, it will appear on this
              page and you will get a notification.
            </p>
          </Panel>
        ) : null}

        {status === 'changes_requested' ? (
          <Panel tone="brand" title="Changes requested">
            <p>PL·CE has asked for some updates before your listing can go live.</p>

            {application?.adminFeedback ? (
              <blockquote className="mt-4 border-l-2 border-clay bg-stone-deep p-4 text-sm leading-relaxed text-ink">
                {application.adminFeedback}
              </blockquote>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/list-your-studio">
                  <PencilLine className="size-4" />
                  Edit your listing
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/list-your-studio?step=review">Resubmit</Link>
              </Button>
            </div>
          </Panel>
        ) : null}

        {status === 'rejected' ? (
          <Panel tone="critical" title="Not accepted">
            <p>PL·CE could not list this studio.</p>
            {application?.rejectionReason ? (
              <blockquote className="mt-4 border-l-2 border-alert bg-stone-deep p-4 text-sm leading-relaxed text-ink">
                {application.rejectionReason}
              </blockquote>
            ) : null}
            <p className="mt-4 text-sm">
              If the reason no longer applies, update the listing and send it back to us.
            </p>
            <Button asChild className="mt-5">
              <Link href="/list-your-studio">Edit and resubmit</Link>
            </Button>
          </Panel>
        ) : null}

        {status === 'suspended' ? (
          <Panel tone="critical" title="Suspended">
            <p>
              PL·CE has temporarily removed {studio.name} from Discovery. Your bookings,
              customers and calendar are untouched.
            </p>
            {application?.adminFeedback ? (
              <blockquote className="mt-4 border-l-2 border-alert bg-stone-deep p-4 text-sm leading-relaxed text-ink">
                {application.adminFeedback}
              </blockquote>
            ) : null}
          </Panel>
        ) : null}

        {status === 'unpublished' || (status === 'approved' && !isLive) ? (
          <Panel tone="neutral" title="Not currently on Discovery">
            <p>
              This listing is approved but hidden from the marketplace. Everything else — your
              calendar, your customers, WhatsApp — keeps working.
            </p>
            <Button asChild variant="secondary" className="mt-5">
              <Link href="/studio/listing">Manage visibility</Link>
            </Button>
          </Panel>
        ) : null}

        {status === 'draft' ? (
          <Panel tone="neutral" title="Still a draft">
            <p>You have not sent this to PL·CE yet. Pick up where you left off.</p>
            <Button asChild className="mt-5">
              <Link href="/list-your-studio">Continue your application</Link>
            </Button>
          </Panel>
        ) : null}
      </div>

      {/* Timeline */}
      {events.length > 0 ? (
        <section className="mt-12">
          <h2 className="eyebrow mb-5">History</h2>
          <ApplicationTimeline events={events} />
        </section>
      ) : null}

      <p className="mt-12 flex items-center gap-2 border-t border-line pt-6 text-xs text-ink-soft">
        <Clock className="size-3.5" />
        This page updates as soon as PL·CE acts. Nothing is hidden from you here.
      </p>
    </div>
  );
}

function Panel({
  tone,
  title,
  children,
}: {
  tone: 'sage' | 'amber' | 'brand' | 'critical' | 'neutral';
  title: string;
  children: React.ReactNode;
}) {
  const tones = {
    sage: 'border-olive/40 bg-olive/10 text-olive-ink',
    amber: 'border-butter/40 bg-butter/10 text-butter-ink',
    brand: 'border-clay/40 bg-clay/10 text-clay-ink',
    critical: 'border-alert/40 bg-alert/10 text-alert-ink',
    neutral: 'border-line bg-stone text-ink',
  }[tone];

  return (
    <div className={`rounded-[--radius] border p-6 ${tones}`}>
      <p className="flex items-center gap-2 text-lg font-medium">
        {tone === 'sage' ? <CheckCircle2 className="size-5" /> : null}
        {title}
      </p>
      <div className="mt-2 text-sm leading-relaxed text-ink-muted [&_p]:text-ink-muted">
        {children}
      </div>
    </div>
  );
}
