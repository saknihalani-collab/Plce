/**
 * Identifier generation.
 *
 * Two kinds of id exist and they are not interchangeable:
 *   • row ids — opaque, never shown, `crypto.randomUUID()` in production
 *   • booking references — read aloud over the phone, so they avoid the
 *     characters people confuse (0/O, 1/I/L) entirely.
 */

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function newId(prefix?: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/**
 * A booking reference, e.g. `PLCE-8F42K`.
 *
 * 31^5 ≈ 28.6M combinations. Collisions are still possible, so the caller
 * is expected to retry against a uniqueness check rather than trust this
 * to be unique on its own.
 */
export function newBookingReference(): string {
  let suffix = '';
  const bytes = randomBytes(5);
  for (const byte of bytes) {
    suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  }
  return `PLCE-${suffix}`;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/** Normalises user-typed references: `plce 8f42k` → `PLCE-8F42K`. */
export function normaliseBookingReference(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = cleaned.startsWith('PLCE') ? cleaned.slice(4) : cleaned;
  return `PLCE-${body}`;
}
