import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * An empty screen is an invitation to act, not an apology.
 *
 * Every empty state in PL·CE says what would be here and offers the one
 * action that would put something here. "No results" on its own is a
 * dead end.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[--radius] border border-dashed border-line px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? <div className="mb-3 text-ink-subtle">{icon}</div> : null}
      <p className="display text-xl text-ink">{title}</p>
      {description ? (
        <p className="mt-2 max-w-sm text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
