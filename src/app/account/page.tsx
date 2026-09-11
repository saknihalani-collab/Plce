import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { signOut } from '@/features/auth/actions';
import { requireSession } from '@/lib/auth/session';
import { formatDate, formatPhone } from '@/lib/format';
import { ORG_ROLE_LABELS } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Account', robots: { index: false } };

export default async function AccountPage() {
  const session = await requireSession('/account');

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[720px] px-5 py-10 sm:px-8">
        <p className="eyebrow">Your account</p>
        <h1 className="display mt-3 text-4xl text-ink">{session.user.fullName}</h1>

        <dl className="card mt-8 divide-y divide-line-soft">
          <Row label="Email">{session.user.email}</Row>
          <Row label="Phone">{formatPhone(session.user.phone)}</Row>
          <Row label="Member since">{formatDate(session.user.createdAt.slice(0, 10))}</Row>
          <Row label="Role on PL·CE">
            {session.isAdmin ? (
              <Badge tone="brand">PL·CE Admin</Badge>
            ) : (
              <span className="text-ink-muted">Customer</span>
            )}
          </Row>
        </dl>

        {session.memberships.length > 0 ? (
          <section className="mt-10">
            <h2 className="eyebrow mb-4">Studios you run</h2>
            <ul className="divide-y divide-line-soft rounded-[--radius] border border-line-soft bg-surface">
              {session.memberships.map((membership) => (
                <li
                  key={membership.organizationId}
                  className="flex items-center justify-between gap-4 p-5"
                >
                  <div>
                    <p className="font-medium text-ink">{membership.organizationName}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {ORG_ROLE_LABELS[membership.role]}
                    </p>
                  </div>
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/studio">Open PL·CE Studio</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="mt-10 rounded-[--radius] border border-line-soft bg-surface-sunken p-6">
            <p className="display text-xl text-ink">Run a space of your own?</p>
            <p className="mt-2 text-sm text-ink-muted">
              List it on PL·CE and get the calendar, the customer list and WhatsApp booking
              with it.
            </p>
            <Button asChild className="mt-4">
              <Link href="/list-your-studio">List your studio</Link>
            </Button>
          </section>
        )}

        <div className="mt-10 flex flex-wrap gap-3 border-t border-line-soft pt-6">
          <Button asChild variant="secondary">
            <Link href="/account/bookings">My bookings</Link>
          </Button>
          <form action={signOut}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-4">
      <dt className="text-sm text-ink-subtle">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}
