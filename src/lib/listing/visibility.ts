import type { ListingStatus, Studio } from '@/types/domain';

/**
 * The public visibility rule.
 *
 * A studio is on the marketplace only when all three are true:
 *
 *   status = 'approved'   PL·CE has reviewed and accepted the listing
 *   isPublished           the owner (or admin) wants it live
 *   not isSuspended       PL·CE has not pulled it
 *
 * This predicate is the TypeScript expression of that rule. The same rule
 * appears twice more, on purpose:
 *
 *   • in every discovery query in both repository implementations
 *   • as an RLS policy that governs what `anon` may select from `studios`
 *
 * Filtering in a component is a rendering detail, never the guard. A
 * rejected studio is not merely hidden from `/discover`; an anonymous
 * client cannot read the row at all.
 */
export function isPubliclyVisible(
  studio: Pick<Studio, 'status' | 'isPublished' | 'isSuspended'>,
): boolean {
  return studio.status === 'approved' && studio.isPublished && !studio.isSuspended;
}

/**
 * The same predicate as SQL, kept beside its TypeScript twin so a change
 * to one is an obvious omission if it is not made to the other.
 */
export const PUBLIC_VISIBILITY_SQL =
  "status = 'approved' and is_published = true and is_suspended = false";

/** Why a studio is not public — for the owner's own status screen. */
export function visibilityReason(
  studio: Pick<Studio, 'status' | 'isPublished' | 'isSuspended'>,
): string | null {
  if (isPubliclyVisible(studio)) return null;
  if (studio.isSuspended) return 'PL·CE has suspended this listing.';
  if (studio.status !== 'approved') return 'This listing has not been approved yet.';
  return 'This listing is approved but currently unpublished.';
}

/**
 * The lifecycle states an owner may still act on. Used to decide whether
 * to send them to the application screen or the CRM.
 */
export const PRE_LIVE_STATUSES: ListingStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'rejected',
];
