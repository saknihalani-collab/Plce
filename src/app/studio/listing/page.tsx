import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { ListingStatusBadge } from '@/components/ui/badge';
import { StudioImage } from '@/components/ui/studio-image';
import { ListingForm, VisibilityToggle } from '@/features/studio/components/listing-form';
import { assertStudioPermission, requireStudioContext } from '@/features/studio/lib/context';
import { diffPendingChanges } from '@/lib/listing/changes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Listing', robots: { index: false } };

export default async function ListingPage() {
  const context = await requireStudioContext('/studio/listing');
  assertStudioPermission(context, 'studio.edit');

  const { repository, studio, isLive } = context;
  const categories = await repository.listCategories();
  const pending = studio.pendingChanges ? diffPendingChanges(studio, studio.pendingChanges) : [];

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Your listing</p>
          <h1 className="display mt-3 text-4xl text-ink">{studio.name}</h1>
        </div>

        <div className="flex items-center gap-3">
          <ListingStatusBadge status={studio.status} />
          {isLive ? (
            <Link
              href={`/studios/${studio.slug}`}
              className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-clay-ink"
            >
              <ExternalLink className="size-4" />
              View public page
            </Link>
          ) : null}
        </div>
      </div>

      {pending.length > 0 ? (
        <div className="mt-8 rounded-[--radius] border border-butter/40 bg-butter/10 p-5">
          <p className="font-medium text-butter-ink">Waiting on PL·CE</p>
          <p className="mt-1.5 text-sm text-ink-muted">
            Your listing still shows the approved version until these are accepted.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {pending.map((change) => (
              <li key={change.field}>
                <span className="block text-xs uppercase tracking-wider text-ink-soft">
                  {change.field}
                </span>
                <span className="text-ink-muted line-through">{change.before}</span>{' '}
                <span className="text-ink">→ {change.after}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <ListingForm studio={studio} categories={categories} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <div className="card p-5">
            <p className="eyebrow">Visibility</p>
            <div className="mt-4">
              <VisibilityToggle studio={studio} />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="relative aspect-[4/3] bg-stone">
              <StudioImage
                src={studio.coverImage?.url}
                alt={studio.name}
                name={studio.name}
                sizes="300px"
              />
            </div>
            <div className="p-4">
              <p className="eyebrow">Cover image</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                The first thing anyone judges the studio on. Changing photographs is part of
                your application — ask PL·CE if you need the set replaced.
              </p>
            </div>
          </div>

          <div className="card p-5">
            <p className="eyebrow">Why two sections?</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              PL·CE reviewed what this listing says before it went live. Contact details,
              rules and policy are yours to change at any time; the name, location and
              description go back for a look, so approval keeps meaning something.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
