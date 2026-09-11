'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { blockStudioTime, removeBlockedTime, saveOpeningHours } from '@/features/studio/actions';
import type { ActionResult } from '@/lib/action-result';
import { formatDateWithDay } from '@/lib/format';
import { instantToZoned } from '@/lib/time';
import { WEEKDAY_LABELS } from '@/types/domain';
import type { AvailabilityRule, BlockedTime, Space, Weekday } from '@/types/domain';

type Result = ActionResult<null> | null;

/**
 * Opening hours, per space.
 *
 * A studio whose podcast room closes earlier than its main floor is
 * normal, so hours belong to the space rather than the studio. The
 * application form asks once and writes the same week to every room;
 * this is where that gets refined.
 */
export function OpeningHoursEditor({
  spaces,
  rules,
}: {
  spaces: Space[];
  rules: AvailabilityRule[];
}) {
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? '');
  const spaceRules = rules.filter((rule) => rule.spaceId === spaceId);

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="eyebrow">Opening hours</h2>
        {spaces.length > 1 ? (
          <select
            aria-label="Space"
            value={spaceId}
            onChange={(event) => setSpaceId(event.target.value)}
            className="field w-auto"
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <HoursForm key={spaceId} spaceId={spaceId} rules={spaceRules} />
    </div>
  );
}

function HoursForm({ spaceId, rules }: { spaceId: string; rules: AvailabilityRule[] }) {
  const [state, action] = useActionState<Result, FormData>(
    saveOpeningHours as (previous: Result, formData: FormData) => Promise<Result>,
    null,
  );

  useEffect(() => {
    if (state?.ok) toast.success('Hours saved');
    if (state && !state.ok) toast.error(state.error);
  }, [state]);

  const byWeekday = new Map(rules.map((rule) => [rule.weekday, rule]));

  return (
    <form action={action} className="mt-5 space-y-2">
      <input type="hidden" name="spaceId" value={spaceId} />

      {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((weekday) => {
        const rule = byWeekday.get(weekday);
        const closed = rule?.isClosed ?? false;

        return (
          <div
            key={weekday}
            className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2 last:border-0"
          >
            <span className="w-24 text-sm text-ink">{WEEKDAY_LABELS[weekday]}</span>

            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                name={`closed-${weekday}`}
                value="true"
                defaultChecked={closed}
                className="size-3.5 accent-[var(--clay)]"
              />
              Closed
            </label>

            <input
              type="time"
              name={`opens-${weekday}`}
              step={1800}
              defaultValue={rule?.opensAt ?? '09:00'}
              aria-label={`${WEEKDAY_LABELS[weekday]} opens`}
              className="field w-auto"
            />
            <span className="text-xs text-ink-soft">to</span>
            <input
              type="time"
              name={`closes-${weekday}`}
              step={1800}
              defaultValue={rule?.closesAt ?? '21:00'}
              aria-label={`${WEEKDAY_LABELS[weekday]} closes`}
              className="field w-auto"
            />
          </div>
        );
      })}

      <div className="pt-3">
        <SubmitButton label="Save hours" />
      </div>
    </form>
  );
}

/**
 * One-off closures.
 *
 * Blocking goes through the booking engine, so a block that lands on top
 * of an existing booking is refused with the name of whoever holds it —
 * rather than silently written and discovered on the day.
 */
export function BlockedTimeEditor({
  spaces,
  blocked,
  timezone,
  defaultDate,
}: {
  spaces: Space[];
  blocked: BlockedTime[];
  timezone: string;
  defaultDate: string;
}) {
  const [state, action] = useActionState<Result, FormData>(
    blockStudioTime as (previous: Result, formData: FormData) => Promise<Result>,
    null,
  );

  useEffect(() => {
    if (state?.ok) toast.success('Time blocked');
    if (state && !state.ok && !state.field) toast.error(state.error);
  }, [state]);

  const error = state && !state.ok ? state : null;
  const spaceName = (id: string) => spaces.find((space) => space.id === id)?.name ?? 'Space';

  return (
    <div className="card p-5" id="block">
      <h2 className="eyebrow">Blocked time</h2>

      <form action={action} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Space" htmlFor="block-space" required error={pick(error, 'spaceId')}>
            <Select id="block-space" name="spaceId" required>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date" htmlFor="block-date" required error={pick(error, 'date')}>
            <Input id="block-date" name="date" type="date" required defaultValue={defaultDate} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="From" htmlFor="block-start" required>
            <Input
              id="block-start"
              name="startTime"
              type="time"
              step={1800}
              required
              defaultValue="09:00"
            />
          </Field>
          <Field label="To" htmlFor="block-end" required error={pick(error, 'endTime')}>
            <Input
              id="block-end"
              name="endTime"
              type="time"
              step={1800}
              required
              defaultValue="13:00"
            />
          </Field>
          <Field label="Why" htmlFor="block-reason">
            <Input id="block-reason" name="reason" maxLength={120} placeholder="Deep clean" />
          </Field>
        </div>

        {error && !error.field ? (
          <p className="field-error" role="alert">
            {error.error}
          </p>
        ) : null}

        <SubmitButton label="Block this time" variant="secondary" />
      </form>

      {blocked.length > 0 ? (
        <ul className="mt-6 divide-y divide-line-soft border-t border-line pt-2">
          {blocked.map((block) => {
            const start = instantToZoned(block.startsAt, timezone);
            const end = instantToZoned(block.endsAt, timezone);

            return (
              <li key={block.id} className="flex items-center justify-between gap-4 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm text-ink">
                    {spaceName(block.spaceId)} · {formatDateWithDay(start.date)}
                  </span>
                  <span className="tabular block text-xs text-ink-soft">
                    {start.time}–{end.time}
                    {block.reason ? ` · ${block.reason}` : ''}
                  </span>
                </span>
                <RemoveBlock id={block.id} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-5 border-t border-line pt-4 text-sm text-ink-soft">
          Nothing blocked ahead.
        </p>
      )}
    </div>
  );
}

function RemoveBlock({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      aria-label="Remove block"
      disabled={busy}
      className="rounded-[--radius-xs] p-1.5 text-ink-soft transition-colors hover:bg-stone hover:text-ink disabled:opacity-50"
      onClick={async () => {
        setBusy(true);
        try {
          await removeBlockedTime(id);
          toast.success('Block removed');
        } catch {
          toast.error('That did not go through.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function SubmitButton({
  label,
  variant = 'primary',
}: {
  label: string;
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

function pick(error: { error: string; field?: string } | null, field: string): string | null {
  return error?.field === field ? error.error : null;
}
