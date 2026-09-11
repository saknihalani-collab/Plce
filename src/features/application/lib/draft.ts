import 'server-only';

import { requireSessionOrThrow, type Session } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { RepositoryError, type DataRepository } from '@/lib/data/repository';
import type { StudioApplication, StudioDetail } from '@/types/domain';

/**
 * Which studio the signed-in person is applying with.
 *
 * Deliberately not a parameter. The wizard never takes a studio id from
 * the page, so there is no id to tamper with — the draft is found from
 * the session's own memberships, and someone with two organisations
 * edits the one they actually belong to or nothing at all.
 *
 * This lives outside `actions.ts` on purpose: everything exported from a
 * `'use server'` module becomes a callable endpoint, and a lookup helper
 * has no business being one.
 */

export interface Draft {
  studio: StudioDetail;
  application: StudioApplication;
}

export async function findDraft(
  repository: DataRepository,
  session: Session,
): Promise<Draft | null> {
  for (const membership of session.memberships) {
    const studios = await repository.listStudiosForOrganization(membership.organizationId);
    for (const studio of studios) {
      const application = await repository.getApplicationForStudio(studio.id);
      if (application) return { studio, application };
    }
  }
  return null;
}

export interface DraftContext extends Draft {
  repository: DataRepository;
  session: Session;
}

export async function requireDraft(): Promise<DraftContext> {
  const session = await requireSessionOrThrow();
  const repository = await getRepository();

  const draft = await findDraft(repository, session);
  if (!draft) {
    throw new RepositoryError('Start with the studio’s name and description.', 'not_found');
  }

  return { repository, session, ...draft };
}

/**
 * An organisation left behind by an attempt that did not finish.
 *
 * Creating a listing takes several writes — organisation, membership,
 * studio, application — and they are not one transaction. If the
 * database times out in the middle, the earlier rows survive and the
 * later ones never happen.
 *
 * `findDraft` cannot see that state, because it only recognises a studio
 * that already has an application. So a retry looked like a first
 * attempt and built a *second* organisation, and every timeout left
 * another one behind.
 *
 * This finds the wreckage instead: an organisation this person owns with
 * no finished listing in it. Reusing it makes the step safe to retry as
 * many times as the network demands.
 */
export async function findUnfinished(
  repository: DataRepository,
  session: Session,
): Promise<{ organizationId: string; studio: StudioDetail | null } | null> {
  for (const membership of session.memberships) {
    if (membership.role !== 'owner') continue;

    const studios = await repository.listStudiosForOrganization(membership.organizationId);

    if (studios.length === 0) {
      // Organisation created, studio never was.
      return { organizationId: membership.organizationId, studio: null };
    }

    for (const studio of studios) {
      const application = await repository.getApplicationForStudio(studio.id);
      if (!application) {
        // Studio created, application never was.
        return { organizationId: membership.organizationId, studio };
      }
    }
  }

  return null;
}
