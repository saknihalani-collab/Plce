import type { OrgRole, PlatformRole } from '@/types/domain';

/**
 * What each role may do.
 *
 * Permissions are *derived* from role, every time they are checked. They
 * are never written into a cookie or a session payload, because a
 * permission stored at sign-in is a permission that survives being
 * revoked.
 *
 * Two independent axes:
 *   • platform role  — who you are to PL·CE (customer or admin)
 *   • org role       — what you are inside one studio business
 *
 * They do not override each other. A PL·CE admin has no automatic seat in
 * a studio's organisation; they have admin powers, which are a different
 * set. That is deliberate: "the admin can see everything" and "the admin
 * acts as the owner" are different products, and only the first is safe.
 */

export type Permission =
  /* Studio organisation */
  | 'studio.view'
  | 'studio.edit'
  | 'studio.submit'
  | 'booking.view'
  | 'booking.create'
  | 'booking.edit'
  | 'booking.cancel'
  | 'customer.view'
  | 'customer.edit'
  | 'availability.edit'
  | 'space.edit'
  | 'billing.view'
  | 'whatsapp.manage'
  | 'org.manage_members'
  /* Platform */
  | 'admin.review'
  | 'admin.publish'
  | 'admin.edit_listing'
  | 'admin.users'
  | 'admin.taxonomy'
  | 'admin.bookings'
  | 'admin.analytics';

const OWNER: Permission[] = [
  'studio.view',
  'studio.edit',
  'studio.submit',
  'booking.view',
  'booking.create',
  'booking.edit',
  'booking.cancel',
  'customer.view',
  'customer.edit',
  'availability.edit',
  'space.edit',
  'billing.view',
  'whatsapp.manage',
  'org.manage_members',
];

/**
 * A manager runs the studio day to day but does not own the business:
 * no money, no members. Everything else an owner can do.
 */
const MANAGER: Permission[] = OWNER.filter(
  (permission) => permission !== 'billing.view' && permission !== 'org.manage_members',
);

/**
 * Staff work the calendar. They can see and move bookings and look after
 * customers — and that is all. Notably absent: availability and pricing,
 * because those are commercial decisions, and listing edits, because
 * those go to PL·CE for review.
 */
const STAFF: Permission[] = [
  'studio.view',
  'booking.view',
  'booking.create',
  'booking.edit',
  'booking.cancel',
  'customer.view',
  'customer.edit',
];

const ORG_PERMISSIONS: Record<OrgRole, Permission[]> = {
  owner: OWNER,
  manager: MANAGER,
  staff: STAFF,
};

const ADMIN_PERMISSIONS: Permission[] = [
  'admin.review',
  'admin.publish',
  'admin.edit_listing',
  'admin.users',
  'admin.taxonomy',
  'admin.bookings',
  'admin.analytics',
];

export function permissionsForOrgRole(role: OrgRole): readonly Permission[] {
  return ORG_PERMISSIONS[role];
}

export function permissionsForPlatformRole(role: PlatformRole): readonly Permission[] {
  return role === 'admin' ? ADMIN_PERMISSIONS : [];
}

/**
 * The full set for a person in a given context.
 *
 * `orgRole` is null when the person holds no membership in the
 * organisation being acted on — which is the normal case for a customer,
 * and the important case for a studio owner poking at someone else's
 * organisation id.
 */
export function permissionsFor(
  platformRole: PlatformRole,
  orgRole: OrgRole | null,
): Set<Permission> {
  const permissions = new Set<Permission>(permissionsForPlatformRole(platformRole));
  if (orgRole) for (const permission of permissionsForOrgRole(orgRole)) permissions.add(permission);
  return permissions;
}

export function hasPermission(
  platformRole: PlatformRole,
  orgRole: OrgRole | null,
  permission: Permission,
): boolean {
  return permissionsFor(platformRole, orgRole).has(permission);
}

/**
 * The rule the whole marketplace rests on.
 *
 * Approval authority belongs to PL·CE and to nobody else. It is expressed
 * as its own function — not as a `hasPermission` call at each site — so
 * that there is a single, greppable answer to "who can approve a
 * listing?", and so that no future permission table edit can quietly
 * grant it to an owner.
 */
export function canApproveListings(platformRole: PlatformRole): boolean {
  return platformRole === 'admin';
}
