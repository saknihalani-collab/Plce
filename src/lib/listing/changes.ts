import type { StudioDetail, StudioPendingChanges } from '@/types/domain';
import type { UpdateStudioInput } from '@/lib/data/repository';

/**
 * Which owner edits go live, and which go back to PL·CE.
 *
 * An approved listing is a promise the marketplace has vetted. Letting an
 * owner swap the name, the address or the cover image afterwards would
 * make approval meaningless — but making them wait for review to fix
 * their opening hours would make the product unusable.
 *
 * So edits are classified. Operational fields are the owner's own; the
 * public-facing ones are held as pending changes and shown to an admin,
 * while the live listing keeps rendering the approved values.
 */

/** Fields whose change is held for review on an already-approved listing. */
export const REVIEWED_FIELDS = [
  'name',
  'tagline',
  'description',
  'categoryId',
  'location',
] as const satisfies ReadonlyArray<keyof UpdateStudioInput>;

/** Fields an owner may change at any time, live. */
export const IMMEDIATE_FIELDS = [
  'contactName',
  'contactPhone',
  'contactEmail',
  'instagram',
  'website',
  'rules',
  'cancellationPolicy',
  'equipment',
  'notes',
  'timezone',
] as const satisfies ReadonlyArray<keyof UpdateStudioInput>;

export type ReviewedField = (typeof REVIEWED_FIELDS)[number];

export interface ClassifiedEdit {
  /** Applied straight away. */
  immediate: UpdateStudioInput;
  /** Held as `pendingChanges` until an admin accepts them. */
  reviewed: Partial<Record<ReviewedField, unknown>>;
  /** True when anything needs review — drives the status transition. */
  requiresReview: boolean;
  /** Human-readable list for the admin's diff panel. */
  changedFieldLabels: string[];
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Studio name',
  tagline: 'Tagline',
  description: 'Description',
  categoryId: 'Category',
  location: 'Location',
  coverImageUrl: 'Cover image',
};

/**
 * Splits a patch against the studio's current state.
 *
 * A draft or rejected listing has nothing to protect — it is not public —
 * so everything applies immediately and `requiresReview` stays false. The
 * split only bites once a listing has been approved.
 */
export function classifyEdit(studio: StudioDetail, patch: UpdateStudioInput): ClassifiedEdit {
  const isLiveListing = studio.status === 'approved' || studio.status === 'suspended';

  const immediate: UpdateStudioInput = {};
  const reviewed: Partial<Record<ReviewedField, unknown>> = {};
  const changedFieldLabels: string[] = [];

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    const isReviewed = (REVIEWED_FIELDS as readonly string[]).includes(key);

    if (isLiveListing && isReviewed) {
      if (!isUnchanged(studio, key, value)) {
        reviewed[key as ReviewedField] = value;
        changedFieldLabels.push(FIELD_LABELS[key] ?? key);
      }
      continue;
    }

    (immediate as Record<string, unknown>)[key] = value;
  }

  return {
    immediate,
    reviewed,
    requiresReview: Object.keys(reviewed).length > 0,
    changedFieldLabels,
  };
}

/** Avoids queuing a review for an edit that changed nothing. */
function isUnchanged(studio: StudioDetail, key: string, value: unknown): boolean {
  const current = (studio as unknown as Record<string, unknown>)[key];
  if (current === value) return true;
  if (typeof current === 'object' && current !== null) {
    return JSON.stringify(current) === JSON.stringify(value);
  }
  return false;
}

export function toPendingChanges(
  reviewed: Partial<Record<ReviewedField, unknown>>,
  now: string,
): StudioPendingChanges {
  return { ...(reviewed as Omit<StudioPendingChanges, 'submittedAt'>), submittedAt: now };
}

/** The admin's accept step: pending changes become the real values. */
export function applyPendingChanges(pending: StudioPendingChanges): UpdateStudioInput {
  const { submittedAt: _submittedAt, coverImageUrl: _coverImageUrl, ...fields } = pending;
  return fields as UpdateStudioInput;
}

/** Renders a pending change as before/after rows for the review panel. */
export function diffPendingChanges(
  studio: StudioDetail,
  pending: StudioPendingChanges,
): Array<{ field: string; before: string; after: string }> {
  const rows: Array<{ field: string; before: string; after: string }> = [];
  for (const [key, value] of Object.entries(pending)) {
    if (key === 'submittedAt' || value === undefined) continue;
    rows.push({
      field: FIELD_LABELS[key] ?? key,
      before: render((studio as unknown as Record<string, unknown>)[key]),
      after: render(value),
    });
  }
  return rows;
}

function render(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const location = value as { area?: string; city?: string; addressLine?: string };
    if (location.city) {
      return [location.addressLine, location.area, location.city].filter(Boolean).join(', ');
    }
  }
  return String(value);
}
