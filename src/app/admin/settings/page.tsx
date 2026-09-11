import type { Metadata } from 'next';
import Link from 'next/link';
import { Star } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { StudioImage } from '@/components/ui/studio-image';
import { FeatureToggle } from '@/features/admin/components/feature-toggle';
import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { isWhatsAppConfigured, isAiConfigured, isDemoMode, isPaymentsConfigured } from '@/lib/env';
import { pluralise } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Settings', robots: { index: false } };

/**
 * Marketplace curation.
 *
 * Featured studios lead Discovery and fill the landing page, which makes
 * choosing them the most editorially consequential thing PL·CE does day
 * to day — and the sort of thing that must never require a deploy.
 */
export default async function AdminSettingsPage() {
  await requireAdmin('/admin/settings');
  const repository = await getRepository();

  const live = await repository.listStudiosForAdmin({
    filters: { status: ['approved'], published: true, suspended: false },
    pageSize: 100,
  });

  const featured = live.items.filter((row) => row.studio.isFeatured);
  const rest = live.items.filter((row) => !row.studio.isFeatured);

  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Marketplace</p>
      <h1 className="display mt-3 text-4xl text-ink">Settings</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        What PL·CE puts in front of people, and what the platform is connected to.
      </p>

      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="eyebrow">Featured on Discovery</h2>
          <span className="text-xs text-ink-soft">
            {featured.length === 0
              ? 'None chosen'
              : `${pluralise(featured.length, 'studio')} leading the marketplace`}
          </span>
        </div>

        <ul className="card divide-y divide-line-soft">
          {[...featured, ...rest].map((row) => (
            <li key={row.studio.id} className="flex items-center gap-4 p-4">
              <div className="relative size-10 shrink-0 overflow-hidden rounded-[--radius-xs] bg-stone">
                <StudioImage
                  src={row.coverImage?.url}
                  alt={row.studio.name}
                  name={row.studio.name}
                  sizes="40px"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm text-ink">
                  <Link
                    href={`/admin/studios/${row.studio.id}`}
                    className="truncate hover:text-clay-ink"
                  >
                    {row.studio.name}
                  </Link>
                  {row.studio.isFeatured ? (
                    <Star className="size-3.5 shrink-0 fill-clay text-clay-ink" />
                  ) : null}
                </p>
                <p className="truncate text-xs text-ink-soft">
                  {row.studio.location.area} · {row.categoryName} · {row.ownerName}
                </p>
              </div>

              <FeatureToggle
                studioId={row.studio.id}
                name={row.studio.name}
                isFeatured={row.studio.isFeatured}
              />
            </li>
          ))}

          {live.items.length === 0 ? (
            <li className="p-6 text-sm text-ink-soft">
              Nothing is live yet. Approve a studio and it becomes eligible to feature.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="eyebrow mb-4">Platform connections</h2>
        <dl className="card divide-y divide-line-soft">
          <Row
            label="Database"
            ok={!isDemoMode}
            okLabel="Supabase"
            offLabel="Demo (in memory)"
            note={
              isDemoMode
                ? 'Everything works, but resets when the server restarts. Set the Supabase variables to persist.'
                : 'Row-level security is the authorisation boundary.'
            }
          />
          <Row
            label="WhatsApp"
            ok={isWhatsAppConfigured}
            okLabel="Meta Cloud API"
            offLabel="Not connected"
            note={
              isWhatsAppConfigured
                ? 'Inbound messages are signature-verified before anything runs.'
                : 'Owners can still use the console in PL·CE Studio; replies are logged rather than sent.'
            }
          />
          <Row
            label="AI interpretation"
            ok={isAiConfigured}
            okLabel="Claude"
            offLabel="Rule-based parser"
            note={
              isAiConfigured
                ? 'Falls back to the rule-based parser if the model is slow or unavailable.'
                : 'Handles the common phrasings and asks a question whenever it is not certain.'
            }
          />
          <Row
            label="Payments"
            ok={isPaymentsConfigured}
            okLabel="Razorpay"
            offLabel="Pay at the studio"
            note={
              isPaymentsConfigured
                ? 'Customers pay online at checkout.'
                : 'Bookings are recorded unpaid and settled with the studio.'
            }
          />
        </dl>
      </section>

      <p className="mt-10 border-t border-line pt-6 text-xs leading-relaxed text-ink-soft">
        Connections are read from the environment and shown here so nobody has to guess what
        this deployment is wired to. They are changed on the host, not in this screen.
      </p>
    </div>
  );
}

function Row({
  label,
  ok,
  okLabel,
  offLabel,
  note,
}: {
  label: string;
  ok: boolean;
  okLabel: string;
  offLabel: string;
  note: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 p-4">
      <div className="min-w-0">
        <dt className="text-sm text-ink">{label}</dt>
        <dd className="mt-0.5 max-w-md text-xs leading-relaxed text-ink-soft">{note}</dd>
      </div>
      <Badge tone={ok ? 'sage' : 'neutral'}>{ok ? okLabel : offLabel}</Badge>
    </div>
  );
}
