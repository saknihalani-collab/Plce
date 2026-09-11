'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { fail, fromZodError, ok, runAction, type ActionResult } from '@/lib/action-result';
import { getSession } from '@/lib/auth/session';
import { createBooking } from '@/lib/booking/engine';
import { getRepository } from '@/lib/data';
import { getPaymentProvider } from '@/lib/payments/provider';
import { isValidDateString, timeToMinutes, zonedToInstant } from '@/lib/time';

/**
 * The customer-side booking action.
 *
 * Everything the browser sent is treated as a suggestion. The studio,
 * the space and the price are looked up server-side, availability is
 * re-checked by the engine at the moment of writing, and the price is
 * computed from the space's own rates — because the alternative is
 * taking a posted `price` field on trust.
 */

const schema = z.object({
  studioId: z.string().min(1),
  spaceId: z.string().min(1),
  date: z.string().refine(isValidDateString, 'Pick a valid date'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a start time'),
  durationMinutes: z.coerce.number().int().min(30).max(720),
  name: z.string().trim().min(2, 'Tell the studio who to expect'),
  email: z.string().trim().email('Enter an email we can send the confirmation to'),
  phone: z
    .string()
    .trim()
    .min(8, 'A phone number lets the studio reach you on the day')
    .max(20),
  guestCount: z.coerce.number().int().min(1).max(500).optional(),
  notes: z.string().trim().max(600).optional(),
});

export async function createCustomerBooking(
  _previous: ActionResult<{ reference: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ reference: string }>> {
  let destination: string | null = null;

  const result = await runAction(async () => {
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const input = parsed.data;

    const repository = await getRepository();

    // Only a publicly visible studio can be booked from the marketplace.
    // Using the public accessor here is the check, not a convenience.
    const studio = await repository.getPublicStudio(input.studioId);
    if (!studio) return fail('That studio is no longer taking bookings.');

    const space = studio.spaces.find((candidate) => candidate.id === input.spaceId);
    if (!space || !space.isActive) return fail('That space is no longer bookable.', 'spaceId');

    const startMinutes = timeToMinutes(input.startTime);
    if (startMinutes == null) return fail('Pick a start time', 'startTime');

    const startsAt = zonedToInstant(input.date, input.startTime, studio.timezone);
    const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);

    const session = await getSession();

    const outcome = await createBooking(repository, {
      organizationId: studio.organizationId,
      studioId: studio.id,
      spaceId: space.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      customer: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        userId: session?.user.id ?? null,
      },
      source: 'plce',
      guestCount: input.guestCount ?? null,
      notes: input.notes ?? null,
      actor: {
        userId: session?.user.id ?? null,
        name: session?.user.fullName ?? input.name,
        kind: 'customer',
      },
    });

    if (!outcome.ok) {
      // The engine's refusals are already written for a person to read.
      return fail(outcome.message);
    }

    // Payment is an intent, not a claim. With no provider configured the
    // booking stays unpaid and the confirmation says so.
    const payments = getPaymentProvider();
    await payments.createIntent({
      bookingReference: outcome.booking.reference,
      amount: outcome.booking.priceAmount,
      currency: outcome.booking.currency,
      customerName: input.name,
      customerEmail: input.email,
    });

    destination = `/bookings/${outcome.booking.reference}`;
    return ok({ reference: outcome.booking.reference });
  });

  // `redirect` throws, so it has to happen outside the try/catch that
  // `runAction` wraps around the body.
  if (destination) redirect(destination);
  return result;
}
