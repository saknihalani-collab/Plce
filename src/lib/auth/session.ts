import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { readActiveOrganization } from '@/lib/auth/cookies';
import { hasPermission, type Permission } from '@/lib/auth/permissions';
import { getAuthGateway, getRepository } from '@/lib/data';
import { RepositoryError } from '@/lib/data/repository';
import type { OrgRole, UserAccount } from '@/types/domain';

/**
 * Who is asking, and what they are allowed to do.
 *
 * Assembled fresh on every request from the auth gateway plus the
 * database. Nothing here is cached in a cookie: a membership revoked a
 * minute ago is gone on the next page load, not at the next sign-in.
 */

export interface SessionMembership {
  organizationId: string;
  organizationName: string;
  role: OrgRole;
}

export interface Session {
  user: UserAccount;
  memberships: SessionMembership[];
  /** The organisation the CRM is currently pointed at. */
  activeOrganizationId: string | null;
  isAdmin: boolean;
  isStudioOwner: boolean;
}

export async function getSession(): Promise<Session | null> {
  const gateway = await getAuthGateway();
  const userId = await gateway.currentUserId();
  if (!userId) return null;

  const repository = await getRepository();
  const user = await repository.getUser(userId);
  if (!user || user.suspendedAt) return null;

  const memberships = (await repository.listMembershipsForUser(userId)).map((membership) => ({
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    role: membership.role,
  }));

  // The cookie is a preference. If it points somewhere this person is not
  // a member of — a stale cookie, or a hand-edited one — it is ignored
  // rather than trusted.
  const preferred = await readActiveOrganization();
  const active =
    memberships.find((membership) => membership.organizationId === preferred) ?? memberships[0];

  return {
    user,
    memberships,
    activeOrganizationId: active?.organizationId ?? null,
    isAdmin: user.platformRole === 'admin',
    isStudioOwner: memberships.length > 0,
  };
}

/** For pages. Sends anonymous visitors to sign in and come back. */
export async function requireSession(returnTo?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login');
  }
  return session;
}

/** For server actions, where redirecting would swallow the reason. */
export async function requireSessionOrThrow(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new RepositoryError('Please sign in and try again.', 'forbidden');
  return session;
}

/**
 * The gate on PL·CE Admin.
 *
 * An anonymous visitor is sent to sign in and back — they typed the URL,
 * so nothing is revealed by asking them to authenticate.
 *
 * A signed-in customer or studio owner gets a 404, not a redirect. A
 * redirect to `/` is an answer: it says "this page exists and you are not
 * allowed". A 404 says nothing at all, which is the right amount to say
 * about a private platform-owner area to someone who is not one.
 */
export async function requireAdmin(returnTo = '/admin'): Promise<Session> {
  const session = await requireSession(returnTo);
  if (!session.isAdmin) notFound();
  return session;
}

export async function requireAdminOrThrow(): Promise<Session> {
  const session = await requireSessionOrThrow();
  if (!session.isAdmin) {
    throw new RepositoryError('This action is limited to PL·CE administrators.', 'forbidden');
  }
  return session;
}

export interface OrgContext {
  session: Session;
  organizationId: string;
  role: OrgRole;
}

/**
 * Proves membership of an organisation before anything else happens.
 *
 * When `organizationId` is supplied it is *checked*, not trusted — this
 * is the function standing between a studio owner and someone else's
 * customer list.
 */
export async function requireOrgAccess(
  organizationId?: string,
  returnTo = '/studio',
): Promise<OrgContext> {
  const session = await requireSession(returnTo);

  const target = organizationId ?? session.activeOrganizationId;
  if (!target) redirect('/list-your-studio');

  const membership = session.memberships.find(
    (candidate) => candidate.organizationId === target,
  );
  if (!membership) redirect('/studio');

  return { session, organizationId: membership.organizationId, role: membership.role };
}

export async function requireOrgAccessOrThrow(organizationId?: string): Promise<OrgContext> {
  const session = await requireSessionOrThrow();
  const target = organizationId ?? session.activeOrganizationId;
  const membership = target
    ? session.memberships.find((candidate) => candidate.organizationId === target)
    : undefined;

  if (!membership) {
    throw new RepositoryError('You do not have access to that studio.', 'forbidden');
  }
  return { session, organizationId: membership.organizationId, role: membership.role };
}

/**
 * The permission assertion every server action opens with.
 *
 * Route guards decide what someone *sees*; this decides what they can
 * *do*, and it is the one that matters.
 */
export function assertPermission(context: OrgContext, permission: Permission): void {
  const allowed = hasPermission(
    context.session.user.platformRole,
    context.role,
    permission,
  );
  if (!allowed) {
    throw new RepositoryError(
      'Your role on this studio does not allow that.',
      'forbidden',
    );
  }
}

/** Convenience for actions that need both membership and a permission. */
export async function requirePermission(
  permission: Permission,
  organizationId?: string,
): Promise<OrgContext> {
  const context = await requireOrgAccessOrThrow(organizationId);
  assertPermission(context, permission);
  return context;
}
