'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Archive, Star } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { archiveListing, editListing, setFeatured } from '@/features/admin/actions';
import type { ActionResult } from '@/lib/action-result';
import type { Category, StudioDetail } from '@/types/domain';

type Result = ActionResult<null> | null;

/**
 * The admin's direct listing editor.
 *
 * The platform owner has to be able to fix a listing without a deploy or
 * a database console — a studio filed under the wrong category, a typo
 * in a name, an area spelled three different ways. Every save is written
 * to the audit log with its previous values, and appears on the owner's
 * own timeline, so a correction is never something that happened
 * silently to someone else's business.
 */
export function ListingEditor({
  studio,
  categories,
}: {
  studio: StudioDetail;
  categories: Category[];
}) {
  const [state, action] = useActionState<Result, FormData>(
    editListing as (previous: Result, formData: FormData) => Promise<Result>,
    null,
  );

  useEffect(() => {
    if (state?.ok) toast.success('Listing updated');
    if (state && !state.ok && !state.field) toast.error(state.error);
  }, [state]);

  const error = state && !state.ok ? state : null;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="studioId" value={studio.id} />

      <Field label="Studio name" htmlFor="name" required error={pick(error, 'name')}>
        <Input id="name" name="name" required defaultValue={studio.name} />
      </Field>

      <Field label="Tagline" htmlFor="tagline" error={pick(error, 'tagline')}>
        <Input id="tagline" name="tagline" maxLength={120} defaultValue={studio.tagline ?? ''} />
      </Field>

      <Field label="Description" htmlFor="description" required error={pick(error, 'description')}>
        <Textarea id="description" name="description" rows={6} required defaultValue={studio.description} />
      </Field>

      <Field label="Category" htmlFor="categoryId" required error={pick(error, 'categoryId')}>
        <Select id="categoryId" name="categoryId" defaultValue={studio.categoryId}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.isActive ? '' : ' (inactive)'}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="City" htmlFor="city" required error={pick(error, 'city')}>
          <Input id="city" name="city" required defaultValue={studio.location.city} />
        </Field>
        <Field label="Area" htmlFor="area" required error={pick(error, 'area')}>
          <Input id="area" name="area" required defaultValue={studio.location.area} />
        </Field>
      </div>

      <div className="grid gap-6 sm:grid-cols-[2fr_1fr]">
        <Field label="Address" htmlFor="addressLine" required error={pick(error, 'addressLine')}>
          <Input
            id="addressLine"
            name="addressLine"
            required
            defaultValue={studio.location.addressLine}
          />
        </Field>
        <Field label="Postal code" htmlFor="postalCode">
          <Input id="postalCode" name="postalCode" defaultValue={studio.location.postalCode ?? ''} />
        </Field>
      </div>

      <label className="flex items-start gap-3 rounded-[--radius-sm] border border-line p-4">
        <input
          type="checkbox"
          name="isFeatured"
          value="true"
          defaultChecked={studio.isFeatured}
          className="mt-0.5 size-4 accent-[var(--clay)]"
        />
        <span>
          <span className="block text-sm text-ink">Feature on Discovery</span>
          <span className="block text-xs text-ink-soft">
            Featured studios lead the marketplace and appear on the landing page.
          </span>
        </span>
      </label>

      {error && !error.field ? (
        <p
          className="rounded-[--radius-sm] border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-alert-ink"
          role="alert"
        >
          {error.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3 border-t border-line pt-6">
        <SaveButton />
        <p className="text-xs text-ink-soft">
          Recorded in the audit log and on the owner&rsquo;s timeline.
        </p>
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save listing'}
    </Button>
  );
}

/** Feature toggle and archive — actions with no form of their own. */
export function ListingSideActions({ studio }: { studio: StudioDetail }) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        full
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await setFeatured(studio.id, !studio.isFeatured);
            toast.success(studio.isFeatured ? 'No longer featured' : 'Featured on Discovery');
          } catch {
            toast.error('That did not go through.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Star className={studio.isFeatured ? 'size-4 fill-clay text-clay-ink' : 'size-4'} />
        {studio.isFeatured ? 'Remove from featured' : 'Feature this studio'}
      </Button>

      <Button
        variant="danger"
        full
        disabled={busy}
        onClick={async () => {
          if (
            !window.confirm(
              `Archive ${studio.name}? It comes off the marketplace and the owner loses the listing. Bookings and customers are kept.`,
            )
          ) {
            return;
          }
          setBusy(true);
          try {
            await archiveListing(studio.id);
            toast.success('Listing archived');
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : 'That did not go through.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Archive className="size-4" />
        Archive listing
      </Button>
    </div>
  );
}

function pick(error: { error: string; field?: string } | null, field: string): string | null {
  return error?.field === field ? error.error : null;
}
