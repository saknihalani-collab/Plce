import Link from 'next/link';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { StudioDetail } from '@/types/domain';

/**
 * The application's step rail.
 *
 * Numbered, because this genuinely is a sequence — you cannot price a
 * room before you have said there is one — and because the number is
 * what tells someone how much is left. A tick means the step is saved in
 * the database, not merely visited.
 */

export const STEPS = [
  { key: 'basics', label: 'The studio', hint: 'Name, type and the pitch' },
  { key: 'location', label: 'Where it is', hint: 'City, area, address' },
  { key: 'spaces', label: 'Rooms and pricing', hint: 'What can be booked' },
  { key: 'amenities', label: "What's in it", hint: 'Amenities people filter on' },
  { key: 'photos', label: 'Photographs', hint: 'Cover and gallery' },
  { key: 'policies', label: 'Hours and rules', hint: 'Opening times, cancellation' },
  { key: 'review', label: 'Review and submit', hint: 'One last read' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

export function isStepKey(value: string | undefined): value is StepKey {
  return STEPS.some((step) => step.key === value);
}

/** A step is complete when the database says so, not when it was opened. */
export function completedSteps(studio: StudioDetail | null): Set<StepKey> {
  const done = new Set<StepKey>();
  if (!studio) return done;

  if (studio.name && studio.description.length >= 60) done.add('basics');
  if (studio.location.city && studio.location.area) done.add('location');
  if (studio.spaces.length > 0) done.add('spaces');
  if (studio.spaces.some((space) => space.amenitySlugs.length > 0)) done.add('amenities');
  if (studio.images.length > 0) done.add('photos');
  if (studio.cancellationPolicy && studio.contactPhone) done.add('policies');

  return done;
}

export function WizardShell({
  current,
  studio,
  children,
}: {
  current: StepKey;
  studio: StudioDetail | null;
  children: React.ReactNode;
}) {
  const done = completedSteps(studio);
  const index = STEPS.findIndex((step) => step.key === current);

  return (
    <div className="grid gap-12 lg:grid-cols-[240px_1fr]">
      <nav aria-label="Application steps" className="lg:sticky lg:top-24 lg:self-start">
        <p className="eyebrow">
          Step {index + 1} of {STEPS.length}
        </p>

        <ol className="mt-5 space-y-1">
          {STEPS.map((step, position) => {
            const isDone = done.has(step.key);
            const isCurrent = step.key === current;
            // A step is reachable once the one before it is saved —
            // there is nothing to price until a room exists.
            const reachable = position === 0 || isDone || done.has(STEPS[position - 1]!.key);

            const content = (
              <span className="flex items-start gap-3">
                <span
                  className={cn(
                    'tabular mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[0.625rem]',
                    isCurrent
                      ? 'bg-clay text-white'
                      : isDone
                        ? 'bg-olive-soft text-olive-ink'
                        : 'bg-surface-sunken text-ink-subtle',
                  )}
                >
                  {isDone && !isCurrent ? (
                    <Check className="size-3" />
                  ) : (
                    String(position + 1).padStart(2, '0')
                  )}
                </span>
                <span>
                  <span
                    className={cn(
                      'block text-sm',
                      isCurrent ? 'font-medium text-ink' : 'text-ink-muted',
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="block text-xs text-ink-subtle">{step.hint}</span>
                </span>
              </span>
            );

            return (
              <li key={step.key}>
                {reachable ? (
                  <Link
                    href={`/list-your-studio?step=${step.key}`}
                    aria-current={isCurrent ? 'step' : undefined}
                    className="block rounded-[--radius-sm] px-2 py-2 transition-colors hover:bg-surface-sunken"
                  >
                    {content}
                  </Link>
                ) : (
                  <span className="block cursor-not-allowed px-2 py-2 opacity-55">{content}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="max-w-2xl">{children}</div>
    </div>
  );
}

export function StepHeader({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header className="mb-10">
      <h2 className="display display-md text-ink">{title}</h2>
      <p className="mt-3 max-w-lg leading-relaxed text-ink-muted">{blurb}</p>
    </header>
  );
}
