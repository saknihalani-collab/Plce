import 'server-only';

import { redirect } from 'next/navigation';

import { hasPermission, type Permission } from '@/lib/auth/permissions';
import { requireOrgAccess, type OrgContext } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import type { DataRepository } from '@/lib/data/repository';
import { isPubliclyVisible } from '@/lib/listing/visibility';
import type { StudioApplication, StudioDetail } from '@/types/domain';

/**
 * Everything a PL·CE Studio page needs, resolved once.
 *
 * CRM access and marketplace publication are independent states. An owner
 * whose listing is still in review is already running a studio: they have
 * a diary, customers who call, and bookings to keep straight. Locking
 * them out of their own calendar until PL·CE gets round to reviewing them
 * would be the product telling them their business does not start until
 * we say so.
 *
 * So the CRM opens as soon as there is a studio to manage, whatever the
 * listing says. What approval controls is exactly one thing: whether the
 * studio appears on `/discover`. That rule lives in
 * `lib/listing/visibility.ts` and is enforced in the repository and in
 * RLS — never here.
 *
 * The organisation comes from the session's memberships — never from the
 * URL — so there is no id for anyone to swap. The studio is whichever one
 * this organisation runs; a business with several studios picks with the
 * switcher, which writes the same cookie `requireOrgAccess` validates.
 */
export interface StudioContext extends OrgContext {
  repository: DataRepository;
  studio: StudioDetail;
  application: StudioApplication | null;
  studios: StudioDetail[];
  isLive: boolean;
}

export async function requireStudioContext(returnTo = '/studio'): Promise<StudioContext> {
  const context = await requireOrgAccess(undefined, returnTo);
  const repository = await getRepository();

  const studios = await repository.listStudiosForOrganization(context.organizationId);
  const studio = studios[0];

  // A member with no studio at all has not finished applying.
  if (!studio) redirect('/list-your-studio');

  const application = await repository.getApplicationForStudio(studio.id);

  return {
    ...context,
    repository,
    studio,
    application,
    studios,
    isLive: isPubliclyVisible(studio),
  };
}

/** Route-level permission check, with a redirect rather than an error. */
export function assertStudioPermission(context: StudioContext, permission: Permission): void {
  const allowed = hasPermission(
    context.session.user.platformRole,
    context.role,
    permission,
  );
  if (!allowed) redirect('/studio');
}
