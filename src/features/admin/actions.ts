'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, fromZodError, ok, runAction, type ActionResult } from '@/lib/action-result';
import { requireAdminOrThrow } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { RepositoryError } from '@/lib/data/repository';
import {
  approveApplication,
  rejectApplication,
  requestChanges,
  restoreStudio,
  startReview,
  suspendStudio,
  unpublishStudio,
  type Actor,
} from '@/lib/listing/service';
import type { AmenityGroup } from '@/types/domain';

/**
 * PL·CE Admin actions.
 *
 * Every one of them opens by proving the caller is an administrator —
 * server-side, against the session, not against anything the browser
 * sent. Route guards keep the pages out of sight; these keep the actions
 * out of reach.
 */

async function actor(): Promise<Actor> {
  const session = await requireAdminOrThrow();
  return {
    userId: session.user.id,
    name: session.user.fullName,
    platformRole: session.user.platformRole,
  };
}

function refreshApplication(applicationId: string): void {
  revalidatePath('/admin');
  revalidatePath('/admin/applications');
  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath('/admin/studios');
  revalidatePath('/discover');
}

/* ── Review queue ───────────────────────────────────────────────── */

/**
 * Opening an application moves it out of the new pile.
 *
 * Called from the review page's render path rather than a button,
 * because "under review" should mean an admin has actually looked at it,
 * and that is exactly what opening the page is.
 */
export async function markUnderReview(applicationId: string): Promise<void> {
  const repository = await getRepository();
  await startReview(repository, { applicationId, actor: await actor() });
  refreshApplication(applicationId);
}

export async function approveStudio(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const applicationId = String(formData.get('applicationId') ?? '');
    if (!applicationId) return fail('Which application?');

    const repository = await getRepository();
    await approveApplication(repository, { applicationId, actor: await actor() });

    refreshApplication(applicationId);
    return ok(null);
  });

  return result;
}

const messageSchema = z.object({
  applicationId: z.string().min(1),
  message: z.string().trim().min(10, 'Say what needs to change — a line or two is enough'),
});

export async function requestListingChanges(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = messageSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);

    const repository = await getRepository();
    await requestChanges(repository, {
      applicationId: parsed.data.applicationId,
      message: parsed.data.message,
      actor: await actor(),
    });

    refreshApplication(parsed.data.applicationId);
    return ok(null);
  });
}

export async function rejectStudio(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = messageSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);

    const repository = await getRepository();
    await rejectApplication(repository, {
      applicationId: parsed.data.applicationId,
      reason: parsed.data.message,
      actor: await actor(),
    });

    refreshApplication(parsed.data.applicationId);
    return ok(null);
  });
}

export async function suspendListing(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = messageSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);

    const repository = await getRepository();
    await suspendStudio(repository, {
      applicationId: parsed.data.applicationId,
      reason: parsed.data.message,
      actor: await actor(),
    });

    refreshApplication(parsed.data.applicationId);
    return ok(null);
  });
}

export async function unpublishListing(applicationId: string, reason?: string): Promise<void> {
  const repository = await getRepository();
  await unpublishStudio(repository, {
    applicationId,
    reason: reason ?? null,
    actor: await actor(),
  });
  refreshApplication(applicationId);
}

export async function restoreListing(applicationId: string): Promise<void> {
  const repository = await getRepository();
  await restoreStudio(repository, { applicationId, actor: await actor() });
  refreshApplication(applicationId);
}

/* ── Listing edits ──────────────────────────────────────────────── */

const listingSchema = z.object({
  studioId: z.string().min(1),
  name: z.string().trim().min(2, 'The studio needs a name'),
  tagline: z.string().trim().max(120).optional(),
  description: z.string().trim().min(20, 'Keep at least a sentence of description'),
  categoryId: z.string().min(1),
  city: z.string().trim().min(2),
  area: z.string().trim().min(2),
  addressLine: z.string().trim().min(2),
  postalCode: z.string().trim().max(12).optional(),
  isFeatured: z.coerce.boolean().optional(),
});

/**
 * The admin's direct edit.
 *
 * The platform owner has to be able to fix a listing — a typo in a name,
 * a studio filed under the wrong category — without a deploy or a
 * database console. Every field written here is recorded in the audit
 * log with its previous value, because an edit made on someone else's
 * listing should never be invisible to them.
 */
export async function editListing(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = listingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const input = parsed.data;

    const admin = await actor();
    const repository = await getRepository();

    const before = await repository.getStudio(input.studioId);
    if (!before) return fail('That studio no longer exists.');

    await repository.updateStudio(input.studioId, {
      name: input.name,
      tagline: input.tagline || null,
      description: input.description,
      categoryId: input.categoryId,
      location: {
        ...before.location,
        city: input.city,
        area: input.area,
        addressLine: input.addressLine,
        postalCode: input.postalCode || null,
      },
      isFeatured: Boolean(input.isFeatured),
      // An admin edit resolves whatever the owner had pending, since the
      // admin has just decided what the listing says.
      hasPendingChanges: false,
      pendingChanges: null,
    });

    await repository.recordAdminAction({
      adminUserId: admin.userId,
      adminName: admin.name,
      action: 'admin.edited_listing',
      entityType: 'studio',
      entityId: before.id,
      entityLabel: before.name,
      previousState: {
        name: before.name,
        categoryId: before.categoryId,
        city: before.location.city,
        area: before.location.area,
        isFeatured: before.isFeatured,
      },
      newState: {
        name: input.name,
        categoryId: input.categoryId,
        city: input.city,
        area: input.area,
        isFeatured: Boolean(input.isFeatured),
      },
      note: null,
    });

    const application = await repository.getApplicationForStudio(before.id);
    if (application) {
      await repository.appendApplicationEvent({
        applicationId: application.id,
        organizationId: before.organizationId,
        type: 'application.edited',
        actorId: admin.userId,
        actorName: admin.name,
        message: 'PL·CE edited the listing.',
      });
    }

    revalidatePath('/admin/studios');
    revalidatePath(`/admin/studios/${before.id}`);
    revalidatePath('/discover');
    revalidatePath(`/studios/${before.slug}`);
    return ok(null);
  });
}

export async function setFeatured(studioId: string, isFeatured: boolean): Promise<void> {
  const admin = await actor();
  const repository = await getRepository();

  const studio = await repository.getStudio(studioId);
  if (!studio) throw new RepositoryError('That studio no longer exists.', 'not_found');

  await repository.updateStudio(studioId, { isFeatured });
  await repository.recordAdminAction({
    adminUserId: admin.userId,
    adminName: admin.name,
    action: 'admin.featured_studio',
    entityType: 'studio',
    entityId: studioId,
    entityLabel: studio.name,
    previousState: { isFeatured: studio.isFeatured },
    newState: { isFeatured },
    note: null,
  });

  revalidatePath('/admin/studios');
  revalidatePath('/');
}

export async function archiveListing(studioId: string): Promise<void> {
  const admin = await actor();
  const repository = await getRepository();

  const studio = await repository.getStudio(studioId);
  if (!studio) throw new RepositoryError('That studio no longer exists.', 'not_found');

  await repository.archiveStudio(studioId);
  await repository.recordAdminAction({
    adminUserId: admin.userId,
    adminName: admin.name,
    action: 'admin.deleted_listing',
    entityType: 'studio',
    entityId: studioId,
    entityLabel: studio.name,
    previousState: { status: studio.status },
    newState: { status: 'archived' },
    note: null,
  });

  revalidatePath('/admin/studios');
  revalidatePath('/discover');
}

/* ── Taxonomy ───────────────────────────────────────────────────── */

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, 'Name the category'),
  description: z.string().trim().max(200).optional(),
  isActive: z.coerce.boolean().optional(),
});

export async function saveCategory(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = categorySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);

    const admin = await actor();
    const repository = await getRepository();
    const { id, ...input } = parsed.data;

    const saved = id
      ? await repository.updateCategory(id, { ...input, isActive: input.isActive ?? false })
      : await repository.createCategory({ ...input, isActive: true });

    await repository.recordAdminAction({
      adminUserId: admin.userId,
      adminName: admin.name,
      action: id ? 'admin.updated_category' : 'admin.created_category',
      entityType: 'category',
      entityId: saved.id,
      entityLabel: saved.name,
      newState: { name: saved.name, isActive: saved.isActive },
      note: null,
    });

    revalidatePath('/admin/categories');
    revalidatePath('/discover');
    return ok(null);
  });
}

export async function deleteCategory(id: string): Promise<void> {
  const admin = await actor();
  const repository = await getRepository();

  const category = await repository.getCategory(id);
  await repository.deleteCategory(id);

  await repository.recordAdminAction({
    adminUserId: admin.userId,
    adminName: admin.name,
    action: 'admin.deleted_category',
    entityType: 'category',
    entityId: id,
    entityLabel: category?.name ?? id,
    note: null,
  });

  revalidatePath('/admin/categories');
}

const amenitySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, 'Name the amenity'),
  group: z.enum(['comfort', 'technical', 'space', 'facilities']),
  isActive: z.coerce.boolean().optional(),
});

export async function saveAmenity(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = amenitySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);

    const admin = await actor();
    const repository = await getRepository();
    const { id, ...input } = parsed.data;

    const saved = id
      ? await repository.updateAmenity(id, {
          ...input,
          group: input.group as AmenityGroup,
          isActive: input.isActive ?? false,
        })
      : await repository.createAmenity({
          ...input,
          group: input.group as AmenityGroup,
          isActive: true,
        });

    await repository.recordAdminAction({
      adminUserId: admin.userId,
      adminName: admin.name,
      action: id ? 'admin.updated_amenity' : 'admin.created_amenity',
      entityType: 'amenity',
      entityId: saved.id,
      entityLabel: saved.name,
      newState: { name: saved.name, group: saved.group, isActive: saved.isActive },
      note: null,
    });

    revalidatePath('/admin/amenities');
    revalidatePath('/discover');
    return ok(null);
  });
}

export async function deleteAmenity(id: string): Promise<void> {
  const admin = await actor();
  const repository = await getRepository();

  await repository.deleteAmenity(id);
  await repository.recordAdminAction({
    adminUserId: admin.userId,
    adminName: admin.name,
    action: 'admin.deleted_amenity',
    entityType: 'amenity',
    entityId: id,
    entityLabel: id,
    note: null,
  });

  revalidatePath('/admin/amenities');
}

/* ── Users ──────────────────────────────────────────────────────── */

/**
 * Changing someone's platform role.
 *
 * Granting admin is the most valuable privilege on PL·CE, so it is
 * audited like a listing decision, and an admin cannot remove their own
 * access — locking the last administrator out of the marketplace is not
 * a state anyone can recover from through the product.
 */
export async function setPlatformRole(
  userId: string,
  role: 'customer' | 'admin',
): Promise<void> {
  const admin = await actor();
  if (admin.userId === userId) {
    throw new RepositoryError('You cannot change your own platform role.', 'forbidden');
  }

  const repository = await getRepository();
  const before = await repository.getUser(userId);
  if (!before) throw new RepositoryError('That account no longer exists.', 'not_found');

  await repository.updateUser(userId, { platformRole: role });
  await repository.recordAdminAction({
    adminUserId: admin.userId,
    adminName: admin.name,
    action: 'admin.updated_user',
    entityType: 'user',
    entityId: userId,
    entityLabel: before.fullName,
    previousState: { platformRole: before.platformRole },
    newState: { platformRole: role },
    note: null,
  });

  revalidatePath('/admin/users');
}

export async function setUserSuspended(userId: string, suspended: boolean): Promise<void> {
  const admin = await actor();
  if (admin.userId === userId) {
    throw new RepositoryError('You cannot suspend your own account.', 'forbidden');
  }

  const repository = await getRepository();
  const before = await repository.getUser(userId);
  if (!before) throw new RepositoryError('That account no longer exists.', 'not_found');

  await repository.setUserSuspended(userId, suspended);
  await repository.recordAdminAction({
    adminUserId: admin.userId,
    adminName: admin.name,
    action: 'admin.suspended_user',
    entityType: 'user',
    entityId: userId,
    entityLabel: before.fullName,
    previousState: { suspended: Boolean(before.suspendedAt) },
    newState: { suspended },
    note: null,
  });

  revalidatePath('/admin/users');
}
