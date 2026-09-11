'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import {
  deleteAmenity,
  deleteCategory,
  saveAmenity,
  saveCategory,
} from '@/features/admin/actions';
import type { ActionResult } from '@/lib/action-result';
import { AMENITY_GROUP_LABELS, type Amenity, type Category } from '@/types/domain';

type Result = ActionResult<null> | null;
type Action = (previous: Result, formData: FormData) => Promise<Result>;

/**
 * Categories and amenities, editable at runtime.
 *
 * These drive the filters on Discovery and the questions on the
 * application form. Adding "Rehearsal" or "Green screen" has to be
 * something the platform owner does on a Tuesday afternoon, not a
 * release — which is why they are tables rather than constants.
 */

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [editing, setEditing] = useState<Category | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th className="py-3 pl-4">Category</th>
              <th>Slug</th>
              <th>Live studios</th>
              <th>State</th>
              <th className="pr-4 text-right">Manage</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td className="pl-4">
                  <p className="text-ink">{category.name}</p>
                  {category.description ? (
                    <p className="text-xs text-ink-soft">{category.description}</p>
                  ) : null}
                </td>
                <td className="tabular text-ink-soft">{category.slug}</td>
                <td className="tabular text-ink-muted">{category.studioCount ?? 0}</td>
                <td>
                  {category.isActive ? (
                    <Badge tone="sage">Active</Badge>
                  ) : (
                    <Badge tone="neutral">Hidden</Badge>
                  )}
                </td>
                <td className="pr-4 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(category)}
                      className="btn btn-ghost btn-sm"
                    >
                      Edit
                    </button>
                    <DeleteButton
                      label={`Delete ${category.name}`}
                      confirm={`Delete “${category.name}”? Studios must be moved to another category first.`}
                      run={() => deleteCategory(category.id)}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card h-fit p-5">
        <p className="eyebrow">{editing ? 'Edit category' : 'New category'}</p>
        <CategoryForm key={editing?.id ?? 'new'} category={editing} onDone={() => setEditing(null)} />
      </div>
    </div>
  );
}

function CategoryForm({
  category,
  onDone,
}: {
  category: Category | null;
  onDone: () => void;
}) {
  const [state, action] = useActionState<Result, FormData>(saveCategory as Action, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(category ? 'Category updated' : 'Category created');
      onDone();
    }
    if (state && !state.ok && !state.field) toast.error(state.error);
  }, [state, category, onDone]);

  const error = state && !state.ok ? state : null;

  return (
    <form action={action} className="mt-4 space-y-4">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <Field label="Name" htmlFor="category-name" required error={pick(error, 'name')}>
        <Input
          id="category-name"
          name="name"
          required
          defaultValue={category?.name ?? ''}
          placeholder="Photography"
        />
      </Field>

      <Field label="Description" htmlFor="category-description">
        <Input
          id="category-description"
          name="description"
          maxLength={200}
          defaultValue={category?.description ?? ''}
          placeholder="Daylight studios, cycloramas and product tables."
        />
      </Field>

      <label className="flex items-center gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          name="isActive"
          value="true"
          defaultChecked={category?.isActive ?? true}
          className="size-4 accent-[var(--clay)]"
        />
        Show on Discovery
      </label>

      <div className="flex gap-2">
        <Submit label={category ? 'Save' : 'Add category'} />
        {category ? (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function AmenityManager({ amenities }: { amenities: Amenity[] }) {
  const [editing, setEditing] = useState<Amenity | null>(null);

  const groups = amenities.reduce<Record<string, Amenity[]>>((accumulator, amenity) => {
    (accumulator[amenity.group] ??= []).push(amenity);
    return accumulator;
  }, {});

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="card overflow-hidden">
            <p className="eyebrow border-b border-line px-4 py-3">
              {AMENITY_GROUP_LABELS[group as keyof typeof AMENITY_GROUP_LABELS] ?? group}
            </p>
            <ul className="divide-y divide-line-soft">
              {items.map((amenity) => (
                <li
                  key={amenity.id}
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{amenity.name}</span>
                    <span className="tabular block text-xs text-ink-soft">
                      {amenity.slug} · on {amenity.studioCount ?? 0} spaces
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {amenity.isActive ? null : <Badge tone="neutral">Hidden</Badge>}
                    <button
                      type="button"
                      onClick={() => setEditing(amenity)}
                      className="btn btn-ghost btn-sm"
                    >
                      Edit
                    </button>
                    <DeleteButton
                      label={`Delete ${amenity.name}`}
                      confirm={`Delete “${amenity.name}”? It is removed from every space that has it.`}
                      run={() => deleteAmenity(amenity.id)}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="card h-fit p-5">
        <p className="eyebrow">{editing ? 'Edit amenity' : 'New amenity'}</p>
        <AmenityForm key={editing?.id ?? 'new'} amenity={editing} onDone={() => setEditing(null)} />
      </div>
    </div>
  );
}

function AmenityForm({ amenity, onDone }: { amenity: Amenity | null; onDone: () => void }) {
  const [state, action] = useActionState<Result, FormData>(saveAmenity as Action, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(amenity ? 'Amenity updated' : 'Amenity created');
      onDone();
    }
    if (state && !state.ok && !state.field) toast.error(state.error);
  }, [state, amenity, onDone]);

  const error = state && !state.ok ? state : null;

  return (
    <form action={action} className="mt-4 space-y-4">
      {amenity ? <input type="hidden" name="id" value={amenity.id} /> : null}

      <Field label="Name" htmlFor="amenity-name" required error={pick(error, 'name')}>
        <Input
          id="amenity-name"
          name="name"
          required
          defaultValue={amenity?.name ?? ''}
          placeholder="Green screen"
        />
      </Field>

      <Field label="Group" htmlFor="amenity-group" required>
        <Select id="amenity-group" name="group" defaultValue={amenity?.group ?? 'technical'}>
          {Object.entries(AMENITY_GROUP_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <label className="flex items-center gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          name="isActive"
          value="true"
          defaultChecked={amenity?.isActive ?? true}
          className="size-4 accent-[var(--clay)]"
        />
        Offer as a filter
      </label>

      <div className="flex gap-2">
        <Submit label={amenity ? 'Save' : 'Add amenity'} />
        {amenity ? (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Plus className="size-4" />
      {pending ? 'Saving…' : label}
    </Button>
  );
}

function DeleteButton({
  label,
  confirm,
  run,
}: {
  label: string;
  confirm: string;
  run: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      aria-label={label}
      disabled={busy}
      className="rounded-[--radius-xs] p-1.5 text-ink-soft transition-colors hover:bg-alert/15 hover:text-alert-ink disabled:opacity-50"
      onClick={async () => {
        if (!window.confirm(confirm)) return;
        setBusy(true);
        try {
          await run();
          toast.success('Deleted');
        } catch (error) {
          // The repository refuses to delete a category that studios are
          // still listed under, and says why.
          toast.error(error instanceof Error ? error.message : 'That could not be deleted.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function pick(error: { error: string; field?: string } | null, field: string): string | null {
  return error?.field === field ? error.error : null;
}
