import { z } from 'zod';

/**
 * The AI seam.
 *
 * The model's entire output surface is the `Intent` union below. It is a
 * *description of a request* — never a query, never an id, never an
 * organisation. Everything it returns is Zod-parsed before anything
 * touches the database, and the organisation comes from the verified
 * phone number rather than from anything the model or the sender said.
 *
 * That is the whole safety argument: there is no path from model output
 * to a write. The booking engine does the writing, with the same checks
 * it applies to a booking made on the website.
 */

/**
 * Dates arrive as words as often as numbers — "tomorrow", "saturday",
 * "the 12th". The model is asked to pass them through rather than do
 * arithmetic, because resolving them needs the studio's timezone and
 * today's date, and both live on the server.
 */
const dateToken = z.string().trim().min(1).max(32);
const timeToken = z.string().trim().min(1).max(16);

const createBooking = z.object({
  kind: z.literal('create_booking'),
  space: z.string().trim().max(80).optional(),
  date: dateToken.optional(),
  start: timeToken.optional(),
  end: timeToken.optional(),
  durationHours: z.number().min(0.5).max(24).optional(),
  customerName: z.string().trim().max(80).optional(),
  customerPhone: z.string().trim().max(24).optional(),
});

const checkAvailability = z.object({
  kind: z.literal('check_availability'),
  space: z.string().trim().max(80).optional(),
  date: dateToken.optional(),
  start: timeToken.optional(),
  end: timeToken.optional(),
});

const todaysSchedule = z.object({
  kind: z.literal('todays_schedule'),
  date: dateToken.optional(),
});

const cancelBooking = z.object({
  kind: z.literal('cancel_booking'),
  customerName: z.string().trim().max(80).optional(),
  date: dateToken.optional(),
  reference: z.string().trim().max(16).optional(),
});

const rescheduleBooking = z.object({
  kind: z.literal('reschedule_booking'),
  customerName: z.string().trim().max(80).optional(),
  reference: z.string().trim().max(16).optional(),
  date: dateToken.optional(),
  newDate: dateToken.optional(),
  start: timeToken.optional(),
  end: timeToken.optional(),
});

const blockTime = z.object({
  kind: z.literal('block_time'),
  space: z.string().trim().max(80).optional(),
  date: dateToken.optional(),
  start: timeToken.optional(),
  end: timeToken.optional(),
  reason: z.string().trim().max(80).optional(),
});

const customerLookup = z.object({
  kind: z.literal('customer_lookup'),
  name: z.string().trim().max(80).optional(),
});

const unknown = z.object({ kind: z.literal('unknown') });

export const intentSchema = z.discriminatedUnion('kind', [
  createBooking,
  checkAvailability,
  todaysSchedule,
  cancelBooking,
  rescheduleBooking,
  blockTime,
  customerLookup,
  unknown,
]);

export type Intent = z.infer<typeof intentSchema>;
export type IntentKind = Intent['kind'];

/** Everything the interpreter is allowed to know about the studio. */
export interface IntentContext {
  /** The studio's own space names, so "the cyc" can resolve to one. */
  spaceNames: string[];
  studioName: string;
  /** Today, in the studio's timezone. */
  today: string;
  /** A partial intent from an unfinished conversation, if any. */
  pending?: Partial<Intent> & { kind?: IntentKind };
}

export interface IntentProvider {
  readonly name: string;
  interpret(message: string, context: IntentContext): Promise<Intent>;
}
