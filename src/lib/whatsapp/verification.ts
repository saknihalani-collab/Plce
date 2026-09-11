import 'server-only';

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Proof that an owner controls the number they typed in.
 *
 * The challenge is deliberately the simplest thing that actually proves
 * possession: PL·CE shows a code to the signed-in owner, the owner sends
 * it from the number, and Meta's webhook tells us which number it came
 * from. Completing that round trip means one authenticated PL·CE account
 * and one WhatsApp number are the same person. Nothing else the webhook
 * does needs to be trusted more than that.
 *
 * The code is never stored. What is stored is a hash of `phone:code`,
 * bound to the number so a hash lifted from one row is useless against
 * another. A six-digit code is only safe because the two things around
 * it are enforced: it expires in minutes, and wrong guesses are counted
 * and capped well below the point where brute force becomes viable.
 */

export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_TTL_MINUTES = 15;
export const VERIFICATION_MAX_ATTEMPTS = 5;

/**
 * A fresh code.
 *
 * `randomInt` is the CSPRNG, not `Math.random` — this is a credential,
 * however short-lived, and a predictable one would defeat the whole
 * exercise. Leading zeros are preserved so every code is six digits.
 */
export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(VERIFICATION_CODE_LENGTH, '0');
}

/** The stored representation. Binding to the phone stops cross-row reuse. */
export function hashVerificationCode(phone: string, code: string): string {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

/**
 * Constant-time comparison.
 *
 * A short-circuiting compare on a six-digit code leaks it a digit at a
 * time to anyone who can measure the response, and the webhook responds
 * over the network.
 */
export function verificationCodeMatches(
  phone: string,
  code: string,
  storedHash: string | null,
): boolean {
  if (!storedHash) return false;

  const expected = Buffer.from(storedHash);
  const actual = Buffer.from(hashVerificationCode(phone, code));
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}

/**
 * Pulls a code out of whatever the owner actually typed.
 *
 * People send "123456", "code 123456", or paste it with a stray full
 * stop. Anchoring on a standalone six-digit run accepts all of those and
 * still refuses to read a code out of a booking instruction that happens
 * to contain a number.
 */
export function extractVerificationCode(body: string): string | null {
  const match = /(?:^|\D)(\d{6})(?:\D|$)/.exec(body.trim());
  return match?.[1] ?? null;
}

export function verificationExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60_000).toISOString();
}
