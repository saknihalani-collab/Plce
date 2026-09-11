import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { requireStudioContext } from '@/features/studio/lib/context';
import { formatMoney, formatPhone, formatRelativeTime, pluralise } from '@/lib/format';
import { initialsOf, parseIntOrNull } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Customers', robots: { index: false } };

const PAGE_SIZE = 25;

/**
 * The studio's own customer list.
 *
 * Tenant-isolated by construction: `listCustomers` takes an organisation
 * id and the repository scopes on it, so there is no query here that
 * could reach another studio's contacts.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { repository, organizationId } = await requireStudioContext('/studio/customers');
  const params = await searchParams;

  const query = params.q?.trim() ?? '';
  const page = Math.max(1, parseIntOrNull(params.page) ?? 1);

  const results = await repository.listCustomers(organizationId, {
    q: query || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Customers</p>
          <h1 className="display mt-3 text-4xl text-ink">
            {pluralise(results.total, 'customer')}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action="/studio/customers" method="get" className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Name, phone or email"
              aria-label="Search customers"
              className="field pl-9"
            />
          </form>

          <Button asChild size="sm">
            <Link href="/studio/customers/new">
              <UserPlus className="size-4" />
              Add customer
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-8">
        {results.items.length === 0 ? (
          <EmptyState
            className="border-line"
            title={query ? 'Nobody matches that' : 'No customers yet'}
            description={
              query
                ? 'Try part of a phone number, or the name as they gave it.'
                : 'Anyone who books — through PL·CE, WhatsApp or the door — turns up here automatically.'
            }
            action={
              <Button asChild size="sm">
                <Link href="/studio/customers/new">Add someone</Link>
              </Button>
            }
          />
        ) : (
          <ul className="card divide-y divide-line-soft">
            {results.items.map((customer) => (
              <li key={customer.id}>
                <Link
                  href={`/studio/customers/${customer.id}`}
                  className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4 transition-colors hover:bg-stone"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stone text-[0.6875rem] font-semibold text-ink">
                    {initialsOf(customer.name)}
                  </span>

                  <span className="min-w-[10rem] flex-1">
                    <span className="block text-sm text-ink">{customer.name}</span>
                    <span className="tabular block text-xs text-ink-soft">
                      {formatPhone(customer.phone)}
                    </span>
                  </span>

                  <span className="w-28 text-sm text-ink-muted">
                    {pluralise(customer.totalBookings, 'booking')}
                  </span>

                  <span className="tabular w-24 text-right text-sm text-ink">
                    {formatMoney(customer.totalSpend)}
                  </span>

                  <span className="w-32 text-right text-xs text-ink-soft">
                    {customer.nextBookingAt
                      ? `Next ${formatRelativeTime(customer.nextBookingAt)}`
                      : customer.lastBookingAt
                        ? `Last ${formatRelativeTime(customer.lastBookingAt)}`
                        : 'No bookings'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
