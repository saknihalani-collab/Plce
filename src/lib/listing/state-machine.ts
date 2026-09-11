import { RepositoryError } from '@/lib/data/repository';
import type { ApplicationEventType, ListingStatus } from '@/types/domain';

/**
 * The listing lifecycle, as a table rather than as scattered `if`s.
 *
 * Having the legal moves in one place is what makes "an owner cannot
 * approve their own studio" and "a rejected studio cannot silently go
 * live" checkable by reading, instead of by tracing call sites.
 */
export const ALLOWED_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'changes_requested', 'approved', 'rejected'],
  under_review: ['changes_requested', 'approved', 'rejected'],
  changes_requested: ['submitted'],
  // An approved listing can go back under review when an owner edits a
  // public-facing field, or be pulled by PL·CE.
  approved: ['under_review', 'suspended', 'unpublished'],
  rejected: ['submitted'],
  suspended: ['approved', 'unpublished'],
  unpublished: ['approved', 'suspended'],
};

export function canTransition(from: ListingStatus, to: ListingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Throws rather than writing — an illegal transition is never silent. */
export function assertTransition(from: ListingStatus, to: ListingStatus): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new RepositoryError(
      `A listing that is ${LABEL[from]} cannot move to ${LABEL[to]}.`,
      'conflict',
    );
  }
}

const LABEL: Record<ListingStatus, string> = {
  draft: 'a draft',
  submitted: 'submitted',
  under_review: 'under review',
  changes_requested: 'awaiting changes',
  approved: 'approved',
  rejected: 'rejected',
  suspended: 'suspended',
  unpublished: 'unpublished',
};

/** The event each transition records on the application timeline. */
export function eventForTransition(
  from: ListingStatus,
  to: ListingStatus,
): ApplicationEventType | null {
  switch (to) {
    case 'submitted':
      return from === 'changes_requested' || from === 'rejected'
        ? 'application.resubmitted'
        : 'application.submitted';
    case 'under_review':
      return 'application.review_started';
    case 'changes_requested':
      return 'application.changes_requested';
    case 'approved':
      return from === 'suspended' || from === 'unpublished'
        ? 'application.republished'
        : 'application.approved';
    case 'rejected':
      return 'application.rejected';
    case 'suspended':
      return 'application.suspended';
    case 'unpublished':
      return 'application.unpublished';
    default:
      return null;
  }
}

/** Statuses an owner may move a listing to themselves. */
export const OWNER_TRANSITIONS: ListingStatus[] = ['submitted'];

/** Statuses only PL·CE may move a listing to. */
export const ADMIN_TRANSITIONS: ListingStatus[] = [
  'under_review',
  'changes_requested',
  'approved',
  'rejected',
  'suspended',
  'unpublished',
];
