import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { UserActions } from '@/features/admin/components/user-actions';
import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { formatDate, formatMoney, formatPhone, pluralise } from '@/lib/format';
import { cn, initialsOf, parseIntOrNull } from '@/lib/utils';
import { ORG_ROLE_LABELS } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Users', robots: { index: false } };

const PAGE_SIZE = 25;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin('/admin/users');
  const params = await searchParams;

  const query = single(params.q)?.trim() ?? '';
  const role = single(params.role);
  const page = Math.max(1, parseIntOrNull(single(params.page)) ?? 1);

  const repository = await getRepository();
  const results = await repository.listUsersForAdmin({
    q: query || undefined,
    platformRole: role === 'admin' ? 'admin' : role === 'customer' ? 'customer' : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">People</p>
          <h1 className="display mt-3 text-4xl text-ink">Users</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {pluralise(results.total, 'account')} on PL·CE
          </p>
        </div>

        <form action="/admin/users" method="get" className="relative w-full sm:w-72">
          {role ? <input type="hidden" name="role" value={role} /> : null}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Name, email or phone"
            aria-label="Search users"
            className="field pl-9"
          />
        </form>
      </div>

      <nav className="mt-8 flex flex-wrap gap-1.5" aria-label="Filter by role">
        {[
          { key: '', label: 'Everyone' },
          { key: 'admin', label: 'PL·CE admins' },
          { key: 'customer', label: 'Customers' },
        ].map((tab) => (
          <Link
            key={tab.key || 'all'}
            href={tab.key ? `/admin/users?role=${tab.key}` : '/admin/users'}
            aria-current={(role ?? '') === tab.key ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              (role ?? '') === tab.key
                ? 'border-clay bg-clay/15 text-clay-ink'
                : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="card mt-6 overflow-hidden">
        {results.items.length === 0 ? (
          <EmptyState
            className="border-0"
            title="No accounts match"
            description="Try a different name, email or phone number."
          />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="data-table min-w-[860px]">
              <thead>
                <tr>
                  <th className="py-3 pl-4">Person</th>
                  <th>Contact</th>
                  <th>Studios</th>
                  <th>Bookings</th>
                  <th>Spend</th>
                  <th>Joined</th>
                  <th className="pr-4 text-right">Manage</th>
                </tr>
              </thead>
              <tbody>
                {results.items.map((row) => (
                  <tr key={row.user.id}>
                    <td className="pl-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stone text-[0.6875rem] font-semibold text-ink">
                          {initialsOf(row.user.fullName)}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate text-ink">
                            {row.user.fullName}
                            {row.user.platformRole === 'admin' ? (
                              <Badge tone="brand">Admin</Badge>
                            ) : null}
                            {row.user.suspendedAt ? (
                              <Badge tone="critical">Suspended</Badge>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="truncate text-ink-muted">{row.user.email}</p>
                      <p className="tabular text-xs text-ink-soft">
                        {formatPhone(row.user.phone)}
                      </p>
                    </td>
                    <td>
                      {row.organizations.length === 0 ? (
                        <span className="text-ink-soft">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {row.organizations.map((organization) => (
                            <li key={organization.id} className="text-xs text-ink-muted">
                              {organization.name}
                              <span className="text-ink-soft">
                                {' '}
                                · {ORG_ROLE_LABELS[organization.role]}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="tabular text-ink-muted">{row.bookingCount}</td>
                    <td className="tabular text-ink">{formatMoney(row.totalSpend)}</td>
                    <td className="text-ink-soft">
                      {formatDate(row.user.createdAt.slice(0, 10), { year: false })}
                    </td>
                    <td className="pr-4 text-right">
                      <UserActions user={row.user} isSelf={row.user.id === session.user.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {results.total > PAGE_SIZE ? (
        <p className="tabular mt-6 text-center text-sm text-ink-soft">
          Page {page} of {Math.ceil(results.total / PAGE_SIZE)}
        </p>
      ) : null}
    </div>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
