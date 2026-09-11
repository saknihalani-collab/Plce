import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { Badge } from '@/components/ui/badge';
import { AdminNav } from '@/features/admin/components/admin-nav';
import { signOut } from '@/features/auth/actions';
import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { initialsOf } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * PL·CE Admin.
 *
 * An internal operations tool, not a developer dashboard — but denser
 * than the marketplace, because the job here is reading twenty rows and
 * deciding on them. It belongs to the same design system: same ink,
 * same terracotta, more of it per screen.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const repository = await getRepository();
  const stats = await repository.getMarketplaceStats();

  return (
    <div className="min-h-dvh">
      <div className="mx-auto flex max-w-[1600px] flex-col lg:flex-row">
        <aside className="shrink-0 border-b border-line px-4 py-5 lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" aria-label="PL·CE home">
              <Logo size="sm" className="text-ink" />
            </Link>
            <Badge tone="brand">Admin</Badge>
          </div>

          <div className="mt-6">
            <AdminNav pending={stats.pendingApplications} />
          </div>

          <div className="mt-8 rounded-[--radius-sm] bg-stone p-3">
            <p className="eyebrow">Marketplace</p>
            <dl className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-soft">Live</dt>
                <dd className="tabular text-ink">{stats.liveStudios}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">In review</dt>
                <dd className="tabular text-ink">{stats.pendingApplications}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Suspended</dt>
                <dd className="tabular text-ink">{stats.suspendedStudios}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 flex items-center gap-3 border-t border-line pt-5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-stone text-[0.6875rem] font-semibold text-ink">
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

        <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
