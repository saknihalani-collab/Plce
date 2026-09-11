'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { fail, fromZodError, ok, runAction, type ActionResult } from '@/lib/action-result';
import { writeActiveOrganization } from '@/lib/auth/cookies';
import { requireSessionOrThrow } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { RepositoryError } from '@/lib/data/repository';
import { findDraft, findUnfinished, requireDraft } from '@/features/application/lib/draft';
import { submitApplication } from '@/lib/listing/service';
import { getStorageProvider, StorageError } from '@/lib/storage/provider';
import type { Weekday } from '@/types/domain';

/**
 * The studio application.
 *
 * Each step saves on its own, so the form is a draft in the database
 * from the first field onwards rather than a pile of state in a browser
 * tab. An owner can close the laptop after the address and come back to
 * the pricing a day later — which is what actually happens.
 */

const WIZARD = '/list-your-studio';

/* ── Step 1: basics ─────────────────────────────────────────────── */

const basicsSchema = z.object({
  studioName: z.string().trim().min(2, 'What is the studio called?'),
  businessName: z.string().trim().min(2, 'Who operates it?'),
  categoryId: z.string().min(1, 'Pick the closest type'),
  tagline: z.string().trim().max(120).optional(),
  description: z
    .string()
    .trim()
    .min(60, 'A couple of sentences at least — this is what people read first'),
});

export async function saveBasics(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  let next: string | null = null;

  const result = await runAction(async () => {
    const parsed = basicsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);

    const session = await requireSessionOrThrow();
    const repository = await getRepository();
    const input = parsed.data;

    const existing = await findDraft(repository, session);

    if (existing) {
      await repository.updateStudio(existing.studio.id, {
        name: input.studioName,
        tagline: input.tagline || null,
        description: input.description,
        categoryId: input.categoryId,
      });
    } else {
      /*
        First save: the organisation, the studio and the application row
        all come into existence together, because a studio with no
        application is a state nothing else in the product understands.

        They are four writes and not one transaction, so a failure
        halfway leaves some of them behind. Picking those up is what
        keeps a retry from building a second organisation every time the
        database has a bad moment.
      */
      const unfinished = await findUnfinished(repository, session);

      const organizationId =
        unfinished?.organizationId ??
        (await repository.createOrganization(input.businessName, session.user.id)).id;

      if (unfinished?.studio) {
        await repository.updateStudio(unfinished.studio.id, {
          name: input.studioName,
          tagline: input.tagline || null,
          description: input.description,
          categoryId: input.categoryId,
        });
        await repository.createApplication(organizationId, unfinished.studio.id);
        await writeActiveOrganization(organizationId);
        next = '/list-your-studio?step=location';
        return ok(null);
      }

      const studio = await repository.createStudioDraft(organizationId, {
        name: input.studioName,
        tagline: input.tagline || null,
        description: input.description,
        categoryId: input.categoryId,
        location: {
          city: '',
          area: '',
          addressLine: '',
          postalCode: null,
          lat: null,
          lng: null,
        },
        contactName: session.user.fullName,
        contactPhone: session.user.phone ?? '',
        contactEmail: session.user.email,
      });
      await repository.createApplication(organizationId, studio.id);
      await writeActiveOrganization(organizationId);
    }

    next = `${WIZARD}?step=location`;
    return ok(null);
  });

  if (next) {
    revalidatePath(WIZARD);
    redirect(next);
  }
  return result;
}

/* ── Step 2: location ───────────────────────────────────────────── */

const locationSchema = z.object({
  city: z.string().trim().min(2, 'Which city?'),
  area: z.string().trim().min(2, 'Which neighbourhood? People search by this'),
  addressLine: z.string().trim().min(4, 'The street address'),
  postalCode: z.string().trim().max(12).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export async function saveLocation(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  let next: string | null = null;

  const result = await runAction(async () => {
    const parsed = locationSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);

    const { repository, studio } = await requireDraft();
    await repository.updateStudio(studio.id, {
      location: {
        city: parsed.data.city,
        area: parsed.data.area,
        addressLine: parsed.data.addressLine,
        postalCode: parsed.data.postalCode || null,
        lat: parsed.data.lat ?? null,
        lng: parsed.data.lng ?? null,
      },
    });

    next = `${WIZARD}?step=spaces`;
    return ok(null);
  });

  if (next) {
    revalidatePath(WIZARD);
    redirect(next);
  }
  return result;
}

/* ── Step 3: spaces ─────────────────────────────────────────────── */

const spaceSchema = z.object({
  name: z.string().trim().min(1, 'Name the room'),
  description: z.string().trim().max(300).optional(),
  capacity: z.coerce.number().int().min(1, 'How many people fit?').max(1000),
  sizeSqft: z.coerce.number().int().min(0).max(100000).optional(),
  hourlyRate: z.coerce.number().int().min(0, 'What does an hour cost?').max(1000000),
  fullDayRate: z.coerce.number().int().min(0).max(10000000).optional(),
  minBookingMinutes: z.coerce.number().int().min(30).max(1440),
});

export async function addSpace(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const parsed = spaceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);

    const { repository, studio } = await requireDraft();
    await repository.createSpace(studio.id, {
      name: parsed.data.name,
      description: parsed.data.description || null,
      capacity: parsed.data.capacity,
      sizeSqft: parsed.data.sizeSqft || null,
      hourlyRate: parsed.data.hourlyRate,
      fullDayRate: parsed.data.fullDayRate || null,
      minBookingMinutes: parsed.data.minBookingMinutes,
      sortOrder: studio.spaces.length,
    });

    return ok(null);
  });

  revalidatePath(WIZARD);
  return result;
}

export async function deleteSpace(spaceId: string): Promise<void> {
  const { repository, studio } = await requireDraft();
  const owned = studio.spaces.some((space) => space.id === spaceId);
  if (!owned) throw new RepositoryError('That space belongs to another studio.', 'forbidden');

  await repository.deleteSpace(spaceId);
  revalidatePath(WIZARD);
}

/* ── Step 4: amenities ──────────────────────────────────────────── */

/**
 * Amenities are stored per space, because a podcast room and a cyc are
 * not the same room. The application asks once, for the whole studio,
 * and applies the answer to every space — refining them one room at a
 * time is a job for the CRM once the listing is live, not for someone
 * filling in a form for the first time.
 */
export async function saveAmenities(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  let next: string | null = null;

  const result = await runAction(async () => {
    const { repository, studio } = await requireDraft();
    const slugs = formData.getAll('amenity').map(String);

    await Promise.all(
      studio.spaces.map((space) => repository.updateSpace(space.id, { amenitySlugs: slugs })),
    );

    next = `${WIZARD}?step=photos`;
    return ok(null);
  });

  if (next) {
    revalidatePath(WIZARD);
    redirect(next);
  }
  return result;
}

/* ── Step 5: photos ─────────────────────────────────────────────── */

export async function uploadImages(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const { repository, studio } = await requireDraft();
    const files = formData.getAll('images').filter((entry): entry is File => entry instanceof File);
    const usable = files.filter((file) => file.size > 0);

    if (usable.length === 0) return fail('Choose at least one image.', 'images');
    if (studio.images.length + usable.length > 12) {
      return fail('Twelve images is plenty. Remove one before adding another.', 'images');
    }

    const storage = getStorageProvider();

    try {
      for (const [index, file] of usable.entries()) {
        const stored = await storage.upload(file, studio.slug);
        await repository.addStudioImage(studio.id, {
          url: stored.url,
          alt: `${studio.name} — ${studio.images.length + index + 1}`,
          sortOrder: studio.images.length + index,
        });
      }
    } catch (error) {
      if (error instanceof StorageError) return fail(error.message, 'images');
      throw error;
    }

    return ok(null);
  });

  revalidatePath(WIZARD);
  return result;
}

export async function removeImage(imageId: string): Promise<void> {
  const { repository, studio } = await requireDraft();
  await repository.removeStudioImage(studio.id, imageId);
  revalidatePath(WIZARD);
}

export async function makeCoverImage(imageId: string): Promise<void> {
  const { repository, studio } = await requireDraft();
  await repository.setCoverImage(studio.id, imageId);
  revalidatePath(WIZARD);
}

/* ── Step 6: rules, hours and contact ───────────────────────────── */

const policiesSchema = z.object({
  rules: z.string().trim().max(2000).optional(),
  equipment: z.string().trim().max(2000).optional(),
  cancellationPolicy: z
    .string()
    .trim()
    .min(20, 'Say what happens when someone cancels — it prevents most disputes'),
  contactName: z.string().trim().min(2, 'Who should we contact?'),
  contactPhone: z.string().trim().min(8, 'A number for booking questions'),
  contactEmail: z.string().trim().email('An email we can reach you on'),
  instagram: z.string().trim().max(60).optional(),
  website: z.string().trim().max(200).optional(),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/, 'Opening time'),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/, 'Closing time'),
  minNoticeMinutes: z.coerce.number().int().min(0).max(10080),
});

export async function savePolicies(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  let next: string | null = null;

  const result = await runAction(async () => {
    const parsed = policiesSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const input = parsed.data;

    if (input.closesAt <= input.opensAt) {
      return fail('Closing time has to be after opening time.', 'closesAt');
    }

    const { repository, studio } = await requireDraft();
    const closedDays = new Set(formData.getAll('closedDay').map((day) => Number(day)));

    await repository.updateStudio(studio.id, {
      rules: splitLines(input.rules),
      equipment: splitLines(input.equipment),
      cancellationPolicy: input.cancellationPolicy,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      instagram: input.instagram ? input.instagram.replace(/^@/, '') : null,
      website: input.website || null,
      bookingRules: { ...studio.bookingRules, minNoticeMinutes: input.minNoticeMinutes },
    });

    // Opening hours are asked once for the studio and written to every
    // space, which is what an owner means by "we open at nine".
    await Promise.all(
      studio.spaces.map((space) =>
        repository.replaceAvailabilityRules(
          space.id,
          Array.from({ length: 7 }, (_, weekday) => ({
            weekday: weekday as Weekday,
            opensAt: input.opensAt,
            closesAt: input.closesAt,
            isClosed: closedDays.has(weekday),
          })),
        ),
      ),
    );

    next = `${WIZARD}?step=review`;
    return ok(null);
  });

  if (next) {
    revalidatePath(WIZARD);
    redirect(next);
  }
  return result;
}

/* ── Step 7: submit ─────────────────────────────────────────────── */

export async function submitForReview(
  _previous: ActionResult<null> | null,
  _formData: FormData,
): Promise<ActionResult<null>> {
  let next: string | null = null;

  const result = await runAction(async () => {
    const session = await requireSessionOrThrow();
    const { repository, studio } = await requireDraft();

    await submitApplication(repository, {
      studioId: studio.id,
      actor: {
        userId: session.user.id,
        name: session.user.fullName,
        platformRole: session.user.platformRole,
      },
    });

    next = '/studio/application';
    return ok(null);
  });

  if (next) {
    revalidatePath('/studio/application');
    redirect(next);
  }
  return result;
}

function splitLines(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);
}
