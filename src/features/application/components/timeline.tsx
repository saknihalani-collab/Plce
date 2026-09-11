import { formatDate, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { APPLICATION_EVENT_LABELS, type StudioApplicationEvent } from '@/types/domain';

/**
 * The application timeline.
 *
 * Rendered from `studio_application_events`, which is append-only — so
 * this is a record of what happened rather than a summary of the current
 * state. Both the owner and the admin see exactly the same rows.
 */

const DOT_TONE: Partial<Record<StudioApplicationEvent['type'], string>> = {
  'application.approved': 'bg-olive',
  'application.republished': 'bg-olive',
  'application.rejected': 'bg-alert',
  'application.suspended': 'bg-alert',
  'application.changes_requested': 'bg-clay',
  'application.review_started': 'bg-butter',
};

export function ApplicationTimeline({
  events,
  className,
}: {
  events: StudioApplicationEvent[];
  className?: string;
}) {
  return (
    <ol className={cn('relative space-y-6 border-l border-line pl-6', className)}>
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span
            className={cn(
              'absolute -left-[1.6875rem] top-1.5 size-2.5 rounded-full ring-4 ring-ink',
              DOT_TONE[event.type] ?? 'bg-ink-soft',
            )}
            aria-hidden
          />

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-sm font-medium text-ink">
              {APPLICATION_EVENT_LABELS[event.type]}
            </p>
            <p className="tabular text-xs text-ink-soft">
              {formatDate(event.createdAt.slice(0, 10), { year: false })} ·{' '}
              {formatRelativeTime(event.createdAt)}
            </p>
          </div>

          <p className="mt-0.5 text-xs text-ink-muted">{event.actorName}</p>

          {event.message ? (
            <p className="mt-2 rounded-[--radius-sm] bg-stone px-3 py-2.5 text-sm leading-relaxed text-ink-muted">
              {event.message}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
