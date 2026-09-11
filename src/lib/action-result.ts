import { AuthError } from '@/lib/auth/gateway';
import { RepositoryError } from '@/lib/data/repository';

/**
 * A uniform result shape for every server action.
 *
 * Actions never throw at the client boundary — a thrown error in a Server
 * Action reaches the browser as an opaque digest, which is useless to the
 * person looking at the form. Failures come back as data the UI can render
 * next to the field that caused them.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string, field?: string): ActionResult<never> {
  return { ok: false, error, field };
}

/**
 * Converts a thrown error into a result. Expected failures keep their
 * message; anything else is logged and reported generically, because an
 * unexpected error message is as likely to leak internals as to help.
 */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof RepositoryError || error instanceof AuthError) {
    return fail(error.message);
  }

  console.error('[action] unhandled error', error);
  return fail('Something went wrong on our end. Please try again.');
}

/** Wraps an action body so every path returns an `ActionResult`. */
export async function runAction<T>(body: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await body();
  } catch (error) {
    return toActionError(error);
  }
}

/** Flattens a Zod error into the first message plus its field path. */
export function fromZodError(error: {
  issues: Array<{ message: string; path: Array<string | number> }>;
}): ActionResult<never> {
  const issue = error.issues[0];
  return fail(issue?.message ?? 'Check the form and try again', issue?.path.join('.'));
}
