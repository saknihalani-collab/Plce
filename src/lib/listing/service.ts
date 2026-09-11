import 'server-only';

import { canApproveListings } from '@/lib/auth/permissions';
import type { DataRepository } from '@/lib/data/repository';
import { RepositoryError } from '@/lib/data/repository';
import { assertTransition, eventForTransition } from '@/lib/listing/state-machine';
import type {
  AdminActionType,
  ListingStatus,
  PlatformRole,
  StudioApplication,
  StudioDetail,
} from '@/types/domain';

/**
 * The approval workflow.
 *
 * Every move a listing makes goes through one of these functions, and
 * each of them does the same four things in the same order:
 *
 *   1. check the transition is legal (the state machine)
 *   2. check the actor is allowed to make it (admin, or the owner)
 *   3. write the studio's state and the application's state together
 *   4. append the timeline event, the audit row and the notification
 *
 * Doing that in one place is what makes the timeline on the admin review
 * page trustworthy: it is a record of what happened, because there is no
 * other path by which a listing can change state.
 */

export interface Actor {
  userId: string;
  name: string;
  platformRole: PlatformRole;
}

interface Context {
  application: StudioApplication;
  studio: StudioDetail;
}

/* ── Owner ──────────────────────────────────────────────────────── */

/**
 * Submit, or resubmit after changes were requested.
 *
 * A listing with no spaces or no images is not ready to be reviewed, and
 * saying so here saves an admin from writing the same note by hand every
 * time.
 */
export async function submitApplication(
  repository: DataRepository,
  options: { studioId: string; actor: Actor },
): Promise<StudioApplication> {
  const { application, studio } = await load(repository, { studioId: options.studioId });

  const problems = readinessProblems(studio);
  if (problems.length > 0) {
    throw new RepositoryError(problems[0]!, 'validation');
  }

  assertTransition(application.status, 'submitted');

  const now = new Date().toISOString();
  const updated = await repository.updateApplication(application.id, {
    status: 'submitted',
    submittedAt: now,
    adminFeedback: null,
  });
  await repository.setStudioListingState(studio.id, { status: 'submitted' });

  await repository.appendApplicationEvent({
    applicationId: application.id,
    organizationId: studio.organizationId,
    type: eventForTransition(application.status, 'submitted') ?? 'application.submitted',
    actorId: options.actor.userId,
    actorName: options.actor.name,
    message: null,
  });

  await notifyAdmins(repository, {
    title: 'New studio application',
    body: `${studio.name} · ${studio.location.area}`,
    href: `/admin/applications/${application.id}`,
    type: 'application.submitted',
  });

  return updated;
}

/**
 * The owner's one lever over visibility: pausing an approved listing.
 *
 * It cannot make anything live — a paused listing is still approved, and
 * unpausing only restores what PL·CE already accepted.
 */
export async function setOwnerPublished(
  repository: DataRepository,
  options: { studioId: string; isPublished: boolean; actor: Actor },
): Promise<StudioDetail> {
  const studio = await repository.getStudio(options.studioId);
  if (!studio) throw new RepositoryError('That studio no longer exists.', 'not_found');

  if (studio.status !== 'approved') {
    throw new RepositoryError(
      'Only an approved listing can be shown or paused.',
      'conflict',
    );
  }
  if (studio.isSuspended) {
    throw new RepositoryError(
      'PL·CE has suspended this listing. Get in touch to have it restored.',
      'forbidden',
    );
  }

  return repository.setStudioListingState(studio.id, {
    isPublished: options.isPublished,
    publishedAt: options.isPublished ? new Date().toISOString() : studio.publishedAt,
  });
}

/* ── Admin ──────────────────────────────────────────────────────── */

export async function startReview(
  repository: DataRepository,
  options: { applicationId: string; actor: Actor },
): Promise<StudioApplication> {
  const context = await load(repository, { applicationId: options.applicationId });
  requireAdmin(options.actor);

  // Opening an application that is already being reviewed is not an
  // error — it is just a page load.
  if (context.application.status !== 'submitted') return context.application;

  return transition(repository, context, options.actor, {
    to: 'under_review',
    adminAction: 'admin.started_review',
  });
}

export async function requestChanges(
  repository: DataRepository,
  options: { applicationId: string; message: string; actor: Actor },
): Promise<StudioApplication> {
  const context = await load(repository, { applicationId: options.applicationId });
  requireAdmin(options.actor);

  const message = options.message.trim();
  if (message.length < 10) {
    throw new RepositoryError(
      'Tell the owner what to change — a note this short will not help them.',
      'validation',
    );
  }

  return transition(repository, context, options.actor, {
    to: 'changes_requested',
    message,
    applicationPatch: { adminFeedback: message },
    adminAction: 'admin.requested_changes',
    notifyOwner: {
      type: 'application.changes_requested',
      title: 'PL·CE requested changes',
      body: 'Your listing needs a couple of updates before it can go live.',
      href: '/studio/application',
    },
  });
}

export async function approveApplication(
  repository: DataRepository,
  options: { applicationId: string; actor: Actor },
): Promise<StudioApplication> {
  const context = await load(repository, { applicationId: options.applicationId });
  requireAdmin(options.actor);

  return transition(repository, context, options.actor, {
    to: 'approved',
    studioState: {
      isPublished: true,
      isSuspended: false,
      publishedAt: new Date().toISOString(),
    },
    applicationPatch: { adminFeedback: null, rejectionReason: null },
    adminAction: 'admin.approved_studio',
    notifyOwner: {
      type: 'application.approved',
      title: 'Your studio is live',
      body: `${context.studio.name} is now on PL·CE Discovery.`,
      href: '/studio',
    },
  });
}

export async function rejectApplication(
  repository: DataRepository,
  options: { applicationId: string; reason: string; actor: Actor },
): Promise<StudioApplication> {
  const context = await load(repository, { applicationId: options.applicationId });
  requireAdmin(options.actor);

  const reason = options.reason.trim();
  if (reason.length < 10) {
    throw new RepositoryError(
      'A rejection needs a reason the owner can read.',
      'validation',
    );
  }

  return transition(repository, context, options.actor, {
    to: 'rejected',
    message: reason,
    studioState: { isPublished: false },
    applicationPatch: { rejectionReason: reason },
    adminAction: 'admin.rejected_studio',
    notifyOwner: {
      type: 'application.rejected',
      title: 'Your application was not accepted',
      body: reason.slice(0, 140),
      href: '/studio/application',
    },
  });
}

/** Pulls a live listing off Discovery. All data is retained. */
export async function suspendStudio(
  repository: DataRepository,
  options: { applicationId: string; reason: string; actor: Actor },
): Promise<StudioApplication> {
  const context = await load(repository, { applicationId: options.applicationId });
  requireAdmin(options.actor);

  return transition(repository, context, options.actor, {
    to: 'suspended',
    message: options.reason.trim() || null,
    studioState: { isSuspended: true },
    applicationPatch: { adminFeedback: options.reason.trim() || null },
    adminAction: 'admin.suspended_studio',
    notifyOwner: {
      type: 'application.changes_requested',
      title: 'PL·CE has suspended your listing',
      body: options.reason.trim() || 'Get in touch so we can sort it out.',
      href: '/studio/application',
    },
  });
}

/** Removes from Discovery without suspending — a quieter action. */
export async function unpublishStudio(
  repository: DataRepository,
  options: { applicationId: string; reason: string | null; actor: Actor },
): Promise<StudioApplication> {
  const context = await load(repository, { applicationId: options.applicationId });
  requireAdmin(options.actor);

  return transition(repository, context, options.actor, {
    to: 'unpublished',
    message: options.reason,
    studioState: { isPublished: false },
    adminAction: 'admin.unpublished_studio',
  });
}

/** Puts a suspended or unpublished listing back on Discovery. */
export async function restoreStudio(
  repository: DataRepository,
  options: { applicationId: string; actor: Actor },
): Promise<StudioApplication> {
  const context = await load(repository, { applicationId: options.applicationId });
  requireAdmin(options.actor);

  return transition(repository, context, options.actor, {
    to: 'approved',
    studioState: {
      isSuspended: false,
      isPublished: true,
      publishedAt: new Date().toISOString(),
    },
    applicationPatch: { adminFeedback: null },
    adminAction: 'admin.restored_studio',
    notifyOwner: {
      type: 'application.approved',
      title: 'Your listing is back on PL·CE',
      body: `${context.studio.name} is visible on Discovery again.`,
      href: '/studio',
    },
  });
}

/* ── Shared ─────────────────────────────────────────────────────── */

interface TransitionOptions {
  to: ListingStatus;
  message?: string | null;
  studioState?: {
    isPublished?: boolean;
    isSuspended?: boolean;
    publishedAt?: string | null;
  };
  applicationPatch?: Partial<StudioApplication>;
  adminAction: AdminActionType;
  notifyOwner?: {
    type: 'application.approved' | 'application.rejected' | 'application.changes_requested';
    title: string;
    body: string;
    href: string;
  };
}

async function transition(
  repository: DataRepository,
  context: Context,
  actor: Actor,
  options: TransitionOptions,
): Promise<StudioApplication> {
  const { application, studio } = context;
  assertTransition(application.status, options.to);

  const previousState = {
    status: studio.status,
    isPublished: studio.isPublished,
    isSuspended: studio.isSuspended,
  };

  await repository.setStudioListingState(studio.id, {
    status: options.to,
    ...options.studioState,
  });

  const updated = await repository.updateApplication(application.id, {
    status: options.to,
    reviewedAt: new Date().toISOString(),
    reviewedBy: actor.userId,
    ...options.applicationPatch,
  });

  const eventType = eventForTransition(application.status, options.to);
  if (eventType) {
    await repository.appendApplicationEvent({
      applicationId: application.id,
      organizationId: studio.organizationId,
      type: eventType,
      actorId: actor.userId,
      actorName: actor.name,
      message: options.message ?? null,
    });
  }

  await repository.recordAdminAction({
    adminUserId: actor.userId,
    adminName: actor.name,
    action: options.adminAction,
    entityType: 'studio',
    entityId: studio.id,
    entityLabel: studio.name,
    previousState,
    newState: {
      status: options.to,
      isPublished: options.studioState?.isPublished ?? studio.isPublished,
      isSuspended: options.studioState?.isSuspended ?? studio.isSuspended,
    },
    note: options.message ?? null,
  });

  if (options.notifyOwner) {
    const members = await repository.listMembers(studio.organizationId);
    await Promise.all(
      members.map((member) =>
        repository.createNotification({
          userId: member.userId,
          type: options.notifyOwner!.type,
          title: options.notifyOwner!.title,
          body: options.notifyOwner!.body,
          href: options.notifyOwner!.href,
        }),
      ),
    );
  }

  return updated;
}

async function load(
  repository: DataRepository,
  key: { applicationId?: string; studioId?: string },
): Promise<Context> {
  const application = key.applicationId
    ? await repository.getApplication(key.applicationId)
    : await repository.getApplicationForStudio(key.studioId!);

  if (!application) {
    throw new RepositoryError('That application no longer exists.', 'not_found');
  }

  const studio = await repository.getStudio(application.studioId);
  if (!studio) {
    throw new RepositoryError('That studio no longer exists.', 'not_found');
  }

  return { application, studio };
}

/**
 * Approval authority, asserted rather than assumed.
 *
 * The route layer already keeps non-admins out of `/admin`, and RLS
 * refuses the write. This is the third check, and the one that reads as
 * a sentence: an owner cannot approve their own listing.
 */
function requireAdmin(actor: Actor): void {
  if (!canApproveListings(actor.platformRole)) {
    throw new RepositoryError(
      'Only PL·CE can review and publish listings.',
      'forbidden',
    );
  }
}

/** What a listing still needs before a human should be asked to read it. */
export function readinessProblems(studio: StudioDetail): string[] {
  const problems: string[] = [];

  if (studio.description.trim().length < 60) {
    problems.push('Add a description — a couple of sentences about the space at least.');
  }
  if (studio.spaces.length === 0) {
    problems.push('Add at least one space people can book.');
  }
  if (studio.images.length === 0) {
    problems.push('Add at least one photograph. The cover image is what sells the space.');
  }
  if (!studio.location.city.trim() || !studio.location.area.trim()) {
    problems.push('Add the city and the area so people can find you.');
  }
  if (!studio.contactPhone.trim()) {
    problems.push('Add a contact phone number for booking questions.');
  }

  return problems;
}

async function notifyAdmins(
  repository: DataRepository,
  notification: {
    title: string;
    body: string;
    href: string;
    type: 'application.submitted';
  },
): Promise<void> {
  const admins = await repository.listUsersForAdmin({ platformRole: 'admin', pageSize: 50 });
  await Promise.all(
    admins.items.map((row) =>
      repository.createNotification({
        userId: row.user.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        href: notification.href,
      }),
    ),
  );
}
