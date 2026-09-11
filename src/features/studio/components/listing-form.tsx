'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { saveListing, setListingPublished } from '@/features/studio/actions';
import type { ActionResult } from '@/lib/action-result';
import type { Category, StudioDetail } from '@/types/domain';

type Result = ActionResult<{ queued: boolean }> | null;

/**
 * The owner's listing editor.
 *
 * The fields are not equal and the form says so: contact details, rules
 * and policy save straight away, while the name, description, category
 * and location on an approved listing go to PL·CE first. Marking that
 * distinction in the interface is the honest version of the rule — the
 * alternative is an owner discovering it only after they hit save.
 */
export function ListingForm({
  studio,
  categories,
}: {
  studio: StudioDetail;
  categories: Category[];
}) {
  const [state, action] = useActionState<Result, FormData>(
    saveListing as (previous: Result, formData: FormData) => Promise<Result>,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(
        state.data.queued
          ? 'Saved. The public-facing changes have gone to PL·CE for review.'
          : 'Listing updated',
      );
    }
    if (state && !state.ok && !state.field) toast.error(state.error);
  }, [state]);

  const error = state && !state.ok ? state : null;
  const reviewed = studio.status === 'approved' || studio.status === 'suspended';

  return (
    <form action={action} className="space-y-8">
      <section className="card p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="eyebrow">Public listing</h2>
          {reviewed ? (
            <span className="text-xs text-butter-ink">Changes here go to PL·CE first</span>
          ) : null}
        </div>

        <div className="mt-5 space-y-5">
          <Field label="Studio name" htmlFor="name" required error={pick(error, 'name')}>
            <Input id="name" name="name" required defaultValue={studio.name} />
          </Field>

          <Field label="One-line pitch" htmlFor="tagline" error={pick(error, 'tagline')}>
            <Input id="tagline" name="tagline" maxLength={120} defaultValue={studio.tagline ?? ''} />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            required
            error={pick(error, 'description')}
          >
            <Textarea
              id="description"
              name="description"
              rows={7}
              required
              defaultValue={studio.description}
            />
          </Field>

          <Field label="Type of space" htmlFor="categoryId" required>
            <Select id="categoryId" name="categoryId" defaultValue={studio.categoryId}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="City" htmlFor="city" required error={pick(error, 'city')}>
              <Input id="city" name="city" required defaultValue={studio.location.city} />
            </Field>
            <Field label="Area" htmlFor="area" required error={pick(error, 'area')}>
              <Input id="area" name="area" required defaultValue={studio.location.area} />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
            <Field label="Address" htmlFor="addressLine" required>
              <Input
                id="addressLine"
                name="addressLine"
                required
                defaultValue={studio.location.addressLine}
              />
            </Field>
            <Field label="Postal code" htmlFor="postalCode">
              <Input
                id="postalCode"
                name="postalCode"
                defaultValue={studio.location.postalCode ?? ''}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="eyebrow">Operational</h2>
          <span className="text-xs text-olive-ink">Saves immediately</span>
        </div>

        <div className="mt-5 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Contact name" htmlFor="contactName" required>
              <Input id="contactName" name="contactName" required defaultValue={studio.contactName} />
            </Field>
            <Field label="Contact phone" htmlFor="contactPhone" required>
              <Input
                id="contactPhone"
                name="contactPhone"
                type="tel"
                required
                defaultValue={studio.contactPhone}
              />
            </Field>
          </div>

          <Field label="Contact email" htmlFor="contactEmail" required>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              required
              defaultValue={studio.contactEmail}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Instagram" htmlFor="instagram">
              <Input id="instagram" name="instagram" defaultValue={studio.instagram ?? ''} />
            </Field>
            <Field label="Website" htmlFor="website">
              <Input id="website" name="website" type="url" defaultValue={studio.website ?? ''} />
            </Field>
          </div>

          <Field label="House rules" htmlFor="rules" hint="One per line.">
            <Textarea id="rules" name="rules" rows={5} defaultValue={studio.rules.join('\n')} />
          </Field>

          <Field label="Equipment on site" htmlFor="equipment" hint="One per line.">
            <Textarea
              id="equipment"
              name="equipment"
              rows={4}
              defaultValue={studio.equipment.join('\n')}
            />
          </Field>

          <Field
            label="Cancellation policy"
            htmlFor="cancellationPolicy"
            required
            error={pick(error, 'cancellationPolicy')}
          >
            <Textarea
              id="cancellationPolicy"
              name="cancellationPolicy"
              rows={3}
              required
              defaultValue={studio.cancellationPolicy}
            />
          </Field>
        </div>
      </section>

      {error && !error.field ? (
        <p
          className="rounded-[--radius-sm] border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-alert-ink"
          role="alert"
        >
          {error.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? 'Saving…' : 'Save listing'}
    </Button>
  );
}

/**
 * The owner's one lever over visibility.
 *
 * Pausing hides an approved listing from Discovery; it cannot publish
 * anything PL·CE has not approved, and it is refused outright while a
 * listing is suspended.
 */
export function VisibilityToggle({ studio }: { studio: StudioDetail }) {
  const [busy, setBusy] = useState(false);

  if (studio.status !== 'approved') {
    return (
      <p className="text-sm text-ink-muted">
        Visibility opens once PL·CE has approved this listing.
      </p>
    );
  }

  if (studio.isSuspended) {
    return (
      <p className="text-sm text-alert-ink">
        PL·CE has suspended this listing. Get in touch to have it restored.
      </p>
    );
  }

  return (
    <div>
      <Button
        variant={studio.isPublished ? 'secondary' : 'primary'}
        full
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await setListingPublished(!studio.isPublished);
            toast.success(studio.isPublished ? 'Listing paused' : 'Listing is live again');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'That did not go through.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {studio.isPublished ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        {studio.isPublished ? 'Pause listing' : 'Show on Discovery'}
      </Button>
      <p className="mt-2 text-xs text-ink-soft">
        {studio.isPublished
          ? 'Pausing hides you from Discovery. Existing bookings are unaffected.'
          : 'Your listing is approved but hidden. Nobody can find it on PL·CE.'}
      </p>
    </div>
  );
}

function pick(error: { error: string; field?: string } | null, field: string): string | null {
  return error?.field === field ? error.error : null;
}
