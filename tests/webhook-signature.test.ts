import { createHmac } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const APP_SECRET = 'test-app-secret';

/**
 * The signature check is the whole trust boundary of the webhook.
 *
 * Everything downstream — identity, organisation, the booking engine —
 * assumes the body genuinely came from Meta. If this check is wrong,
 * none of the rest matters, so it is tested against the same HMAC Meta
 * actually sends rather than against a stub.
 */
vi.mock('@/lib/env', () => ({
  env: {
    whatsapp: {
      appSecret: APP_SECRET,
      verifyToken: 'test-verify-token',
      accessToken: null,
      phoneNumberId: null,
    },
  },
  isWhatsAppConfigured: true,
  isAiConfigured: false,
}));

const { parseWebhookPayload, verifySignature, verifySubscription } = await import(
  '@/lib/whatsapp/client'
);

function sign(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body, 'utf8').digest('hex')}`;
}

describe('webhook signature', () => {
  const body = JSON.stringify({ entry: [] });

  it('accepts a body signed with the app secret', () => {
    expect(verifySignature(body, sign(body))).toBe(true);
  });

  it('rejects a body signed with the wrong secret', () => {
    const forged = `sha256=${createHmac('sha256', 'wrong').update(body, 'utf8').digest('hex')}`;
    expect(verifySignature(body, forged)).toBe(false);
  });

  it('rejects an unsigned body', () => {
    expect(verifySignature(body, null)).toBe(false);
  });

  it('rejects a signature for different bytes', () => {
    expect(verifySignature(JSON.stringify({ entry: [{}] }), sign(body))).toBe(false);
  });
});

describe('subscription handshake', () => {
  it('echoes the challenge for the right verify token', () => {
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test-verify-token',
      'hub.challenge': '12345',
    });
    expect(verifySubscription(params)).toBe('12345');
  });

  it('refuses a wrong verify token', () => {
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'nope',
      'hub.challenge': '12345',
    });
    expect(verifySubscription(params)).toBeNull();
  });
});

describe('payload parsing', () => {
  it('extracts text messages and normalises the sender to E.164', () => {
    const messages = parseWebhookPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: '919820100201', id: 'wamid.1', type: 'text', text: { body: 'hello' } },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.from).toBe('+919820100201');
    expect(messages[0]!.messageId).toBe('wamid.1');
  });

  it('ignores non-text events, so a photograph cannot become a booking', () => {
    const messages = parseWebhookPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: '919820100201', id: 'wamid.2', type: 'image' },
                  { from: '919820100201', id: 'wamid.3', type: 'reaction' },
                ],
                statuses: [{ id: 'wamid.1', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    });

    expect(messages).toHaveLength(0);
  });

  it('survives a malformed envelope', () => {
    expect(parseWebhookPayload({})).toEqual([]);
    expect(parseWebhookPayload({ entry: [{}] })).toEqual([]);
  });
});
