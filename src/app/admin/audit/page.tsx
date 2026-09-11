import type { Metadata } from 'next';

import { EmptyState } from '@/components/ui/empty-state';
import { requireAdmin } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { formatDate, formatRelativeTime } from '@/lib/format';
import { parseIntOrNull } from '@/lib/utils';
import { ADMIN_ACTION_LABELS } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Audit log', robots: { index: false } };

const PAGE_SIZE = 50;

/**
 * Every consequential thing PL·CE has done to someone else's business.
 *
 * Append-only, with the previous and new state on each row, because
 * marketplace accountability is not a feature you add after the first
 * argument about who unpublished what.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin('/admin/audit');
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, parseIntOrNull(rawPage) ?? 1);

  const repository = await getRepository();
  const results = await repository.listAdminActions({ page, pageSize: PAGE_SIZE });

  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Accountability</p>
      <h1 className="display mt-3 text-4xl text-ink">Audit log</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        Every approval, rejection, edit and suspension, with who did it and what changed.
        Nothing here can be edited or removed.
      </p>

      <div className="mt-8">
        {results.items.length === 0 ? (
          <EmptyState
            className="border-line"
            title="Nothing logged yet"
            description="Admin decisions appear here as they are made."
          />
        ) : (
          <ol className="card divide-y divide-line-soft">
            {results.items.map((action) => (
              <li key={action.id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{action.adminName}</span>{' '}
                    <span className="text-ink-muted">
                      {(ADMIN_ACTION_LABELS[action.action] ?? action.action).toLowerCase()}
                    </span>{' '}
                    <span className="font-medium">{action.entityLabel}</span>
                  </p>
                  <p className="tabular text-xs text-ink-soft">
                    {formatDate(action.createdAt.slice(0, 10))} ·{' '}
                    {formatRelativeTime(action.createdAt)}
                  </p>
                </div>

                {action.note ? (
                  <p className="mt-2 rounded-[--radius-sm] bg-stone px-3 py-2 text-sm leading-relaxed text-ink-muted">
                    {action.note}
                  </p>
                ) : null}

                {action.previousState || action.newState ? (
                  <p className="tabular mt-2 text-xs text-ink-soft">
                    {describe(action.previousState)} → {describe(action.newState)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
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

function describe(state: Record<string, unknown> | null): string {
  if (!state) return '—';
  return Object.entries(state)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ');
}
