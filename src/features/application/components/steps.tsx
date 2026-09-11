'use client';

import Image from 'next/image';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { ArrowRight, ImagePlus, Star, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CheckChip, Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/empty-state';
import {
  addSpace,
  deleteSpace,
  makeCoverImage,
  removeImage,
  saveAmenities,
  saveBasics,
  saveLocation,
  savePolicies,
  submitForReview,
  uploadImages,
} from '@/features/application/actions';
import type { ActionResult } from '@/lib/action-result';
import { formatMoney } from '@/lib/format';
import { AMENITY_GROUP_LABELS, WEEKDAY_LABELS } from '@/types/domain';
import type { Amenity, AmenityGroup, Category, StudioDetail, Weekday } from '@/types/domain';

type Result = ActionResult<null> | null;
type Action = (previous: Result, formData: FormData) => Promise<Result>;

/* ── Step 1 ─────────────────────────────────────────────────────── */

export function BasicsStep({
  studio,
  categories,
  defaultBusinessName,
}: {
  studio: StudioDetail | null;
  categories: Category[];
  defaultBusinessName: string;
}) {
  const [state, action] = useActionState<Result, FormData>(saveBasics as Action, null);
  const error = errorOf(state);

  return (
    <form action={action} className="space-y-6">
      <Field label="Studio name" htmlFor="studioName" required error={pick(error, 'studioName')}>
        <Input
          id="studioName"
          name="studioName"
          required
          defaultValue={studio?.name ?? ''}
          placeholder="Studio 404"
        />
      </Field>

      <Field
        label="Business or owner name"
        htmlFor="businessName"
        required
        hint="Who operates the space. Shown on the listing as the host."
        error={pick(error, 'businessName')}
      >
        <Input
          id="businessName"
          name="businessName"
          required
          defaultValue={studio?.host.organizationName ?? defaultBusinessName}
        />
      </Field>

      <Field label="Type of space" htmlFor="categoryId" required error={pick(error, 'categoryId')}>
        <Select id="categoryId" name="categoryId" required defaultValue={studio?.categoryId ?? ''}>
          <option value="" disabled>
            Pick the closest
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="One-line pitch"
        htmlFor="tagline"
        hint="The line under the name on your listing."
        error={pick(error, 'tagline')}
      >
        <Input
          id="tagline"
          name="tagline"
          maxLength={120}
          defaultValue={studio?.tagline ?? ''}
          placeholder="Daylight, cyc and a podcast room, five minutes from Bandra station."
        />
      </Field>

      <Field
        label="Description"
        htmlFor="description"
        required
        hint="What the space is actually like. Mention the light, the ceiling, the load-in — the things people ask about."
        error={pick(error, 'description')}
      >
        <Textarea
          id="description"
          name="description"
          rows={7}
          required
          minLength={60}
          defaultValue={studio?.description ?? ''}
        />
      </Field>

      <Footer error={error} label="Save and continue" />
    </form>
  );
}

/* ── Step 2 ─────────────────────────────────────────────────────── */

export function LocationStep({ studio }: { studio: StudioDetail }) {
  const [state, action] = useActionState<Result, FormData>(saveLocation as Action, null);
  const error = errorOf(state);

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="City" htmlFor="city" required error={pick(error, 'city')}>
          <Input id="city" name="city" required defaultValue={studio.location.city} placeholder="Mumbai" />
        </Field>

        <Field
          label="Area"
          htmlFor="area"
          required
          hint="People search by neighbourhood."
          error={pick(error, 'area')}
        >
          <Input
            id="area"
            name="area"
            required
            defaultValue={studio.location.area}
            placeholder="Bandra West"
          />
        </Field>
      </div>

      <Field label="Address" htmlFor="addressLine" required error={pick(error, 'addressLine')}>
        <Input
          id="addressLine"
          name="addressLine"
          required
          defaultValue={studio.location.addressLine}
          placeholder="3rd Floor, Sunder Mahal, Hill Road"
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-3">
        <Field label="Postal code" htmlFor="postalCode" error={pick(error, 'postalCode')}>
          <Input id="postalCode" name="postalCode" defaultValue={studio.location.postalCode ?? ''} />
        </Field>

        <Field label="Latitude" htmlFor="lat" hint="Optional, for the map.">
          <Input
            id="lat"
            name="lat"
            type="number"
            step="0.000001"
            defaultValue={studio.location.lat ?? ''}
          />
        </Field>

        <Field label="Longitude" htmlFor="lng">
          <Input
            id="lng"
            name="lng"
            type="number"
            step="0.000001"
            defaultValue={studio.location.lng ?? ''}
          />
        </Field>
      </div>

      <Footer error={error} label="Save and continue" />
    </form>
  );
}

/* ── Step 3 ─────────────────────────────────────────────────────── */

export function SpacesStep({ studio }: { studio: StudioDetail }) {
  const [state, action] = useActionState<Result, FormData>(addSpace as Action, null);
  const error = errorOf(state);

  return (
    <div className="space-y-8">
      {studio.spaces.length === 0 ? (
        <EmptyState
          title="No rooms yet"
          description="A space is anything someone can book by the hour — a studio floor, a booth, a terrace."
        />
      ) : (
        <ul className="divide-y divide-line-soft rounded-[--radius] border border-line-soft bg-surface">
          {studio.spaces.map((space) => (
            <li key={space.id} className="flex items-start justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-ink">{space.name}</p>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Up to {space.capacity}
                  {space.sizeSqft ? ` · ${space.sizeSqft} sq ft` : ''} ·{' '}
                  {space.minBookingMinutes / 60} hr minimum
                </p>
                <p className="tabular mt-1 text-sm text-ink">
                  {formatMoney(space.hourlyRate)}/hr
                  {space.fullDayRate ? ` · ${formatMoney(space.fullDayRate)} day` : ''}
                </p>
              </div>

              <form
                action={async () => {
                  await deleteSpace(space.id);
                }}
              >
                <Button type="submit" variant="ghost" size="icon" aria-label={`Remove ${space.name}`}>
                  <Trash2 className="size-4" />
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="rounded-[--radius] border border-line-soft bg-surface p-5">
        <p className="eyebrow mb-4">Add a room</p>

        <div className="space-y-5">
          <Field label="Name" htmlFor="name" required error={pick(error, 'name')}>
            <Input id="name" name="name" required placeholder="Main Studio" />
          </Field>

          <Field label="What it is" htmlFor="description" error={pick(error, 'description')}>
            <Input
              id="description"
              name="description"
              placeholder="North light, 1400 sq ft, blackout curtains if you want to kill it."
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Capacity" htmlFor="capacity" required error={pick(error, 'capacity')}>
              <Input id="capacity" name="capacity" type="number" min={1} required defaultValue={10} />
            </Field>

            <Field label="Size (sq ft)" htmlFor="sizeSqft" error={pick(error, 'sizeSqft')}>
              <Input id="sizeSqft" name="sizeSqft" type="number" min={0} />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Per hour (₹)" htmlFor="hourlyRate" required error={pick(error, 'hourlyRate')}>
              <Input id="hourlyRate" name="hourlyRate" type="number" min={0} required defaultValue={1000} />
            </Field>

            <Field label="Full day (₹)" htmlFor="fullDayRate" error={pick(error, 'fullDayRate')}>
              <Input id="fullDayRate" name="fullDayRate" type="number" min={0} />
            </Field>

            <Field label="Minimum booking" htmlFor="minBookingMinutes" required>
              <Select id="minBookingMinutes" name="minBookingMinutes" defaultValue="60">
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="180">3 hours</option>
                <option value="240">4 hours</option>
                <option value="480">Full day</option>
              </Select>
            </Field>
          </div>
        </div>

        {error && !error.field ? <ErrorBanner message={error.error} /> : null}

        <Submit label="Add this room" variant="secondary" className="mt-5" />
      </form>

      {studio.spaces.length > 0 ? (
        <div className="flex justify-end">
          <Button asChild>
            <a href="/list-your-studio?step=amenities">
              Continue
              <ArrowRight className="size-4" />
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ── Step 4 ─────────────────────────────────────────────────────── */

export function AmenitiesStep({
  studio,
  amenities,
}: {
  studio: StudioDetail;
  amenities: Amenity[];
}) {
  const [state, action] = useActionState<Result, FormData>(saveAmenities as Action, null);
  const error = errorOf(state);
  const selected = new Set(studio.spaces.flatMap((space) => space.amenitySlugs));

  const groups = amenities.reduce<Record<string, Amenity[]>>((accumulator, amenity) => {
    (accumulator[amenity.group] ??= []).push(amenity);
    return accumulator;
  }, {});

  return (
    <form action={action} className="space-y-8">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group}>
          <p className="eyebrow mb-3">{AMENITY_GROUP_LABELS[group as AmenityGroup] ?? group}</p>
          <div className="flex flex-wrap gap-2">
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

      <p className="text-sm text-ink-subtle">
        These apply to every room for now. Once you are live you can set them room by room in
        PL·CE Studio.
      </p>

      <Footer error={error} label="Save and continue" />
    </form>
  );
}

/* ── Step 5 ─────────────────────────────────────────────────────── */

export function PhotosStep({ studio }: { studio: StudioDetail }) {
  const [state, action] = useActionState<Result, FormData>(uploadImages as Action, null);
  const error = errorOf(state);

  return (
    <div className="space-y-8">
      {studio.images.length === 0 ? (
        <EmptyState
          icon={<ImagePlus className="size-6" />}
          title="No photographs yet"
          description="The cover image is the single thing people judge a listing on. Wide shots of the empty room work better than shoots that happened in it."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {studio.images.map((image) => (
            <li
              key={image.id}
              className="group relative overflow-hidden rounded-[--radius-sm] border border-line-soft"
            >
              <div className="relative aspect-[4/3] bg-surface-sunken">
                <Image
                  src={image.url}
                  alt={image.alt}
                  fill
                  sizes="200px"
                  className="object-cover"
                  unoptimized={image.url.startsWith('/uploads/')}
                />
              </div>

              {image.isCover ? (
                <span className="absolute left-2 top-2 rounded-full bg-ink/85 px-2 py-0.5 text-[0.625rem] uppercase tracking-wider text-paper">
                  Cover
                </span>
              ) : null}

              <div className="flex items-center justify-between gap-1 bg-surface p-1.5">
                {image.isCover ? (
                  <span className="px-1 text-xs text-ink-subtle">Shown first</span>
                ) : (
                  <form
                    action={async () => {
                      await makeCoverImage(image.id);
                    }}
                  >
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-[--radius-xs] px-1.5 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                    >
                      <Star className="size-3" />
                      Make cover
                    </button>
                  </form>
                )}

                <form
                  action={async () => {
                    await removeImage(image.id);
                  }}
                >
                  <button
                    type="submit"
                    aria-label="Remove image"
                    className="rounded-[--radius-xs] px-1.5 py-1 text-ink-subtle transition-colors hover:bg-alert-soft hover:text-alert-ink"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="rounded-[--radius] border border-line-soft bg-surface p-5">
        <Field
          label="Add photographs"
          htmlFor="images"
          hint="JPEG, PNG or WebP, up to 8 MB each. Twelve maximum."
          error={pick(error, 'images')}
        >
          <input
            id="images"
            name="images"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            required
            className="field file:mr-3 file:rounded-[--radius-xs] file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:text-paper"
          />
        </Field>

        {error && !error.field ? <ErrorBanner message={error.error} /> : null}
        <Submit label="Upload" variant="secondary" className="mt-4" />
      </form>

      {studio.images.length > 0 ? (
        <div className="flex justify-end">
          <Button asChild>
            <a href="/list-your-studio?step=policies">
              Continue
              <ArrowRight className="size-4" />
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ── Step 6 ─────────────────────────────────────────────────────── */

export function PoliciesStep({ studio }: { studio: StudioDetail }) {
  const [state, action] = useActionState<Result, FormData>(savePolicies as Action, null);
  const error = errorOf(state);

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Opens at" htmlFor="opensAt" required error={pick(error, 'opensAt')}>
          <Input id="opensAt" name="opensAt" type="time" step={1800} required defaultValue="09:00" />
        </Field>

        <Field label="Closes at" htmlFor="closesAt" required error={pick(error, 'closesAt')}>
          <Input id="closesAt" name="closesAt" type="time" step={1800} required defaultValue="21:00" />
        </Field>
      </div>

      <fieldset>
        <legend className="field-label">Closed on</legend>
        <div className="flex flex-wrap gap-1.5">
          {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((weekday) => (
            <CheckChip
              key={weekday}
              name="closedDay"
              value={String(weekday)}
              label={WEEKDAY_LABELS[weekday].slice(0, 3)}
            />
          ))}
        </div>
        <p className="field-hint mt-2">Leave all unticked if you open every day.</p>
      </fieldset>

      <Field
        label="How much notice you need"
        htmlFor="minNoticeMinutes"
        hint="The shortest gap between a booking being made and starting."
        required
      >
        <Select id="minNoticeMinutes" name="minNoticeMinutes" defaultValue="60">
          <option value="0">None — instant bookings</option>
          <option value="60">1 hour</option>
          <option value="180">3 hours</option>
          <option value="720">12 hours</option>
          <option value="1440">A day</option>
        </Select>
      </Field>

      <Field
        label="House rules"
        htmlFor="rules"
        hint="One per line. The things you would otherwise have to say on the day."
        error={pick(error, 'rules')}
      >
        <Textarea
          id="rules"
          name="rules"
          rows={5}
          defaultValue={studio.rules.join('\n')}
          placeholder={'No smoking anywhere on the floor.\nShoes off on the cyc.'}
        />
      </Field>

      <Field
        label="Equipment on site"
        htmlFor="equipment"
        hint="One per line. What comes with the room."
        error={pick(error, 'equipment')}
      >
        <Textarea
          id="equipment"
          name="equipment"
          rows={4}
          defaultValue={studio.equipment.join('\n')}
          placeholder={'Godox AD600 Pro x3\nC-stands and sandbags'}
        />
      </Field>

      <Field
        label="Cancellation policy"
        htmlFor="cancellationPolicy"
        required
        hint="Be specific about timings and amounts — this settles most disputes before they start."
        error={pick(error, 'cancellationPolicy')}
      >
        <Textarea
          id="cancellationPolicy"
          name="cancellationPolicy"
          rows={3}
          required
          defaultValue={studio.cancellationPolicy}
          placeholder="Free cancellation up to 48 hours before your slot. Inside 48 hours we hold 50%."
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Contact name" htmlFor="contactName" required error={pick(error, 'contactName')}>
          <Input id="contactName" name="contactName" required defaultValue={studio.contactName} />
        </Field>

        <Field label="Contact phone" htmlFor="contactPhone" required error={pick(error, 'contactPhone')}>
          <Input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            required
            defaultValue={studio.contactPhone}
            placeholder="+91 98200 12345"
          />
        </Field>
      </div>

      <Field label="Contact email" htmlFor="contactEmail" required error={pick(error, 'contactEmail')}>
        <Input
          id="contactEmail"
          name="contactEmail"
          type="email"
          required
          defaultValue={studio.contactEmail}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Instagram" htmlFor="instagram" error={pick(error, 'instagram')}>
          <Input
            id="instagram"
            name="instagram"
            defaultValue={studio.instagram ?? ''}
            placeholder="studio404.mumbai"
          />
        </Field>

        <Field label="Website" htmlFor="website" error={pick(error, 'website')}>
          <Input
            id="website"
            name="website"
            type="url"
            defaultValue={studio.website ?? ''}
            placeholder="https://"
          />
        </Field>
      </div>

      <Footer error={error} label="Save and review" />
    </form>
  );
}

/* ── Step 7 ─────────────────────────────────────────────────────── */

export function ReviewStep({ problems }: { problems: string[] }) {
  const [state, action] = useActionState<Result, FormData>(submitForReview as Action, null);
  const error = errorOf(state);

  if (problems.length > 0) {
    return (
      <div className="rounded-[--radius] border border-butter-line bg-butter-soft p-6">
        <p className="font-medium text-butter-ink">A few things first</p>
        <ul className="mt-3 space-y-2 text-sm text-butter-ink/90">
          {problems.map((problem) => (
            <li key={problem} className="flex gap-2">
              <span>·</span>
              {problem}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <div className="rounded-[--radius] border border-olive-line bg-olive-soft p-6">
        <p className="font-medium text-olive-ink">This listing is ready to send</p>
        <p className="mt-2 text-sm text-olive-ink/90">
          PL·CE reads every application. You will hear back either way, and if something is
          missing we will tell you exactly what — you will not have to guess.
        </p>
      </div>

      {error ? <ErrorBanner message={error.error} /> : null}

      <Submit label="Submit for review" size="lg" />
    </form>
  );
}

/* ── Shared ─────────────────────────────────────────────────────── */

function Footer({
  error,
  label,
}: {
  error: { error: string; field?: string } | null;
  label: string;
}) {
  return (
    <div className="space-y-4 border-t border-line-soft pt-6">
      {error && !error.field ? <ErrorBanner message={error.error} /> : null}
      <div className="flex items-center gap-3">
        <Submit label={label} />
        <p className="text-xs text-ink-subtle">Saved as you go — you can come back to it.</p>
      </div>
    </div>
  );
}

function Submit({
  label,
  variant = 'primary',
  size = 'md',
  className,
}: {
  label: string;
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'lg';
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      className="rounded-[--radius-sm] border border-alert-line bg-alert-soft px-4 py-3 text-sm text-alert-ink"
      role="alert"
    >
      {message}
    </p>
  );
}

function errorOf(state: Result): { error: string; field?: string } | null {
  return state && !state.ok ? state : null;
}

function pick(error: { error: string; field?: string } | null, field: string): string | null {
  return error?.field === field ? error.error : null;
}
