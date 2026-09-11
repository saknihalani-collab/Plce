import { describe, expect, it, vi } from 'vitest';

import { RepositoryError } from '@/lib/data/repository';
import { throwIfError } from '@/lib/data/supabase/repository';

/**
 * What a database refusal tells the person who hit it.
 *
 * Every unrecognised failure used to say "We could not reach the
 * database. Please try again." — which describes one cause, misdescribes
 * the rest, and sends an operator round a loop that cannot end. A
 * missing column is not a connectivity problem and retrying never fixes
 * it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pg = (code: string, message = 'boom') => ({ code, message, details: '', hint: '' }) as any;

function quietly<T>(body: () => T): T {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return body();
  } finally {
    spy.mockRestore();
  }
}

describe('throwIfError', () => {
  it('passes a clean result straight through', () => {
    expect(() => throwIfError(null)).not.toThrow();
  });

  it('treats a policy refusal as forbidden, not a failure', () => {
    expect(() => throwIfError(pg('42501'))).toThrow(RepositoryError);
    try {
      throwIfError(pg('42501'));
    } catch (error) {
      expect((error as RepositoryError).code).toBe('forbidden');
    }
  });

  it('treats a uniqueness clash as a conflict', () => {
    try {
      throwIfError(pg('23505'));
    } catch (error) {
      expect((error as RepositoryError).code).toBe('conflict');
    }
  });

  it('names a missing migration rather than blaming connectivity', () => {
    // The remedy is specific and retrying is not it.
    quietly(() => {
      expect(() => throwIfError(pg('42703'))).toThrow(/migration may not have been run/i);
      expect(() => throwIfError(pg('42P01'))).toThrow(/migration may not have been run/i);
    });
  });

  it('says a required value was missing for a not-null violation', () => {
    quietly(() => {
      expect(() => throwIfError(pg('23502'))).toThrow(/something required was missing/i);
    });
  });

  it('says a value was disallowed for a check violation', () => {
    quietly(() => {
      expect(() => throwIfError(pg('23514'))).toThrow(/not allowed/i);
    });
  });

  it('distinguishes a row that saved but could not be read back', () => {
    quietly(() => {
      expect(() => throwIfError(pg('PGRST116'))).toThrow(/could not be read back/i);
    });
  });

  it('carries the code for anything unrecognised, so it stays diagnosable', () => {
    quietly(() => {
      expect(() => throwIfError(pg('XX999'))).toThrow(/XX999/);
    });
  });

  it('logs the full detail whatever it shows the caller', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      throwIfError(pg('23502', 'null value in column "city"'));
    } catch {
      // expected
    }
    expect(spy).toHaveBeenCalledWith('[supabase]', expect.stringContaining('23502'));
    expect(spy).toHaveBeenCalledWith('[supabase]', expect.stringContaining('city'));
    spy.mockRestore();
  });

  it('still prefers an explicit message when the caller supplies one', () => {
    quietly(() => {
      expect(() => throwIfError(pg('23505'), 'That number is already connected.')).toThrow(
        /already connected/i,
      );
    });
  });
});
