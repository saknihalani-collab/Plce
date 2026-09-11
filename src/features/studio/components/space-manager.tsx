'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckChip, Field, Input, Select, Textarea } from '@/components/ui/field';
import { removeSpace, saveSpace } from '@/features/studio/actions';
import type { ActionResult } from '@/lib/action-result';
import { formatMoney } from '@/lib/format';
import { AMENITY_GROUP_LABELS } from '@/types/domain';
import type { Amenity, AmenityGroup, Space } from '@/types/domain';

type Result = ActionResult<null> | null;

/**
 * Spaces and pricing.
 *
 * Rates, capacity and turnaround live here rather than in the listing
 * editor, because they are operating decisions the owner makes on their
 * own — PL·CE reviews how a studio is described, not what it charges.
 */
export function SpaceManager({
  spaces,
  amenities,
}: {
  spaces: Space[];
  amenities: Amenity[];
}) {
  const [editing, setEditing] = useState<Space | 'new' | null>(null);

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {spaces.map((space) => (
          <li key={space.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-lg text-ink">
                  {space.name}
                  {space.isActive ? null : <Badge tone="neutral">Not bookable</Badge>}
                </p>
                {space.description ? (
                  <p className="mt-1 text-sm text-ink-muted">{space.description}</p>
                ) : null}
                <p className="tabular mt-2 text-sm text-ink-muted">
                  {formatMoney(space.hourlyRate)}/hr
                  {space.halfDayRate ? ` · ${formatMoney(space.halfDayRate)} half day` : ''}
                  {space.fullDayRate ? ` · ${formatMoney(space.fullDayRate)} day` : ''}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  Up to {space.capacity}
                  {space.sizeSqft ? ` · ${space.sizeSqft} sq ft` : ''} ·{' '}
                  {space.minBookingMinutes / 60} hr minimum · {space.bufferMinutes} min
                  turnaround
                </p>
              </div>

              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(editing === space ? null : space)}
                >
                  {editing === space ? 'Close' : 'Edit'}
                </Button>
                <DeleteSpace space={space} />
              </div>
            </div>

            {editing === space ? (
              <div className="mt-5 border-t border-line pt-5">
                <SpaceForm
                  space={space}
                  amenities={amenities}
                  onDone={() => setEditing(null)}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {editing === 'new' ? (
        <div className="card p-5">
          <p className="eyebrow mb-4">New space</p>
          <SpaceForm amenities={amenities} onDone={() => setEditing(null)} />
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          Add a space
        </Button>
      )}
    </div>
  );
}

function SpaceForm({
  space,
  amenities,
  onDone,
}: {
  space?: Space;
  amenities: Amenity[];
  onDone: () => void;
}) {
  const [state, action] = useActionState<Result, FormData>(
    saveSpace as (previous: Result, formData: FormData) => Promise<Result>,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(space ? 'Space updated' : 'Space added');
      onDone();
    }
    if (state && !state.ok && !state.field) toast.error(state.error);
  }, [state, space, onDone]);

  const error = state && !state.ok ? state : null;
  const selected = new Set(space?.amenitySlugs ?? []);

  const groups = amenities.reduce<Record<string, Amenity[]>>((accumulator, amenity) => {
    (accumulator[amenity.group] ??= []).push(amenity);
    return accumulator;
  }, {});

  return (
    <form action={action} className="space-y-5">
      {space ? <input type="hidden" name="id" value={space.id} /> : null}

      <Field label="Name" htmlFor={`name-${space?.id ?? 'new'}`} required error={pick(error, 'name')}>
        <Input
          id={`name-${space?.id ?? 'new'}`}
          name="name"
          required
          defaultValue={space?.name ?? ''}
          placeholder="Main Studio"
        />
      </Field>

      <Field label="Description" htmlFor={`description-${space?.id ?? 'new'}`}>
        <Textarea
          id={`description-${space?.id ?? 'new'}`}
          name="description"
          rows={2}
          maxLength={300}
          defaultValue={space?.description ?? ''}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Capacity" htmlFor={`capacity-${space?.id ?? 'new'}`} required>
          <Input
            id={`capacity-${space?.id ?? 'new'}`}
            name="capacity"
            type="number"
            min={1}
            required
            defaultValue={space?.capacity ?? 10}
          />
        </Field>
        <Field label="Size (sq ft)" htmlFor={`size-${space?.id ?? 'new'}`}>
          <Input
            id={`size-${space?.id ?? 'new'}`}
            name="sizeSqft"
            type="number"
            min={0}
            defaultValue={space?.sizeSqft ?? ''}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Per hour (₹)" htmlFor={`hourly-${space?.id ?? 'new'}`} required>
          <Input
            id={`hourly-${space?.id ?? 'new'}`}
            name="hourlyRate"
            type="number"
            min={0}
            required
            defaultValue={space?.hourlyRate ?? 1000}
          />
        </Field>
        <Field
          label="Half day (₹)"
          htmlFor={`half-${space?.id ?? 'new'}`}
          hint="A cap, not a tier."
        >
          <Input
            id={`half-${space?.id ?? 'new'}`}
            name="halfDayRate"
            type="number"
            min={0}
            defaultValue={space?.halfDayRate ?? ''}
          />
        </Field>
        <Field label="Full day (₹)" htmlFor={`full-${space?.id ?? 'new'}`}>
          <Input
            id={`full-${space?.id ?? 'new'}`}
            name="fullDayRate"
            type="number"
            min={0}
            defaultValue={space?.fullDayRate ?? ''}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Minimum booking" htmlFor={`min-${space?.id ?? 'new'}`} required>
          <Select
            id={`min-${space?.id ?? 'new'}`}
            name="minBookingMinutes"
            defaultValue={String(space?.minBookingMinutes ?? 60)}
          >
            <option value="60">1 hour</option>
            <option value="120">2 hours</option>
            <option value="180">3 hours</option>
            <option value="240">4 hours</option>
            <option value="480">Full day</option>
          </Select>
        </Field>

        <Field
          label="Turnaround"
          htmlFor={`buffer-${space?.id ?? 'new'}`}
          hint="Held after every booking, so nothing lands back to back."
          required
        >
          <Select
            id={`buffer-${space?.id ?? 'new'}`}
            name="bufferMinutes"
            defaultValue={String(space?.bufferMinutes ?? 15)}
          >
            <option value="0">None</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">1 hour</option>
          </Select>
        </Field>
      </div>

      <fieldset>
        <legend className="field-label">What is in this room</legend>
        <div className="space-y-3">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <p className="mb-1.5 text-xs text-ink-soft">
                {AMENITY_GROUP_LABELS[group as AmenityGroup] ?? group}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((amenity) => (
                  <CheckChip
                    key={amenity.id}
                    name="amenity"
                    value={amenity.slug}
                    label={amenity.name}
                    defaultChecked={selected.has(amenity.slug)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {space ? (
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            name="isActive"
            value="true"
            defaultChecked={space.isActive}
            className="size-4 accent-[var(--clay)]"
          />
          Taking bookings
        </label>
      ) : null}

      <div className="flex gap-2">
        <Submit label={space ? 'Save space' : 'Add space'} />
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DeleteSpace({ space }: { space: Space }) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Remove ${space.name}`}
      disabled={busy}
      onClick={async () => {
        if (
          !window.confirm(
            `Remove ${space.name}? If it has upcoming bookings this will be refused — untick "Taking bookings" instead.`,
          )
        ) {
          return;
        }
        setBusy(true);
        try {
          await removeSpace(space.id);
          toast.success('Space removed');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'That could not be removed.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

function pick(error: { error: string; field?: string } | null, field: string): string | null {
  return error?.field === field ? error.error : null;
}
