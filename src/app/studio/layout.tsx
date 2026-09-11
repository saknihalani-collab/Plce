import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { Badge, ListingStatusBadge } from '@/components/ui/badge';
import { signOut } from '@/features/auth/actions';
import { StudioNav } from '@/features/studio/components/studio-nav';
import { requireStudioContext } from '@/features/studio/lib/context';
import { permissionsFor } from '@/lib/auth/permissions';
import { visibilityReason } from '@/lib/listing/visibility';
import { initialsOf } from '@/lib/utils';
import { ORG_ROLE_LABELS } from '@/types/domain';

export const dynamic = 'force-dynamic';

/**
 * PL·CE Studio — the working surface.
 *
 * Owners live in here for hours at a time, which is the argument for
 * paper rather than a dark console: the same warm ground as the
 * marketplace, but organised as Swiss information design — a hairline
 * rail, a dense grid, and colour used only where it carries a fact.
 *
 * Same materials as Discovery, different temperament.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const context = await requireStudioContext();
  const { studio, session, role } = context;

  const permissions = [...permissionsFor(session.user.platformRole, role)];
  const notLive = visibilityReason(studio);

  return (
    <div className="min-h-dvh">
      <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="shrink-0 border-b border-line bg-stone/40 px-4 py-5 lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" aria-label="PL·CE home">
              <Logo size="sm" className="text-ink" />
            </Link>

            <Badge tone="neutral" className="hidden lg:inline-flex">
              Studio
            </Badge>

            {/* On a phone the sidebar's lower blocks are hidden, so the
                account controls move up here rather than disappearing. */}
            <div className="flex items-center gap-3 lg:hidden">
              <span className="truncate text-sm text-ink">{studio.name}</span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-xs text-ink-soft transition-colors hover:text-clay-ink"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>

          <div className="mt-6 hidden lg:block">
            <p className="truncate text-sm font-medium text-ink">{studio.name}</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {studio.location.area} · {ORG_ROLE_LABELS[role]}
            </p>
            <div className="mt-2">
              <ListingStatusBadge status={studio.status} />
            </div>
          </div>

          <div className="mt-4 lg:mt-6">
            <StudioNav permissions={permissions} />
          </div>

          <div className="mt-8 hidden border-t border-line pt-5 lg:block">
            {context.isLive ? (
              <Link
                href={`/studios/${studio.slug}`}
                className="flex items-center gap-2 rounded-[--radius-sm] px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-stone hover:text-ink"
              >
                <ExternalLink className="size-4 text-ink-soft" />
                View public listing
              </Link>
            ) : (
              <p className="border-l-2 border-butter bg-butter-soft px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
                {notLive}{' '}
                <Link href="/studio/application" className="text-clay-ink hover:underline">
                  See status
                </Link>
              </p>
            )}
          </div>

          <div className="mt-6 hidden items-center gap-3 border-t border-line pt-5 lg:flex">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[0.6875rem] font-semibold text-paper">
              {initialsOf(session.user.fullName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{session.user.fullName}</p>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-xs text-ink-soft transition-colors hover:text-clay-ink"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">
          {/*
            The CRM is open whatever the listing says, so the listing's
            state has to be visible from every screen inside it —
            otherwise an owner takes bookings for weeks without noticing
            nobody can find them on PL·CE.
          */}
          {notLive ? (
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-l-2 border-butter bg-butter-soft px-4 py-3">
              <p className="text-sm text-ink-muted">
                <span className="font-medium text-butter-ink">Not on Discovery.</span>{' '}
                {notLive} Your calendar, customers and WhatsApp all work as normal.
              </p>
              <Link
                href="/studio/application"
                className="shrink-0 text-sm text-butter-ink hover:underline"
              >
                See status →
              </Link>
            </div>
          ) : null}

          {children}
        </main>
      </div>
    </div>
  );
}
