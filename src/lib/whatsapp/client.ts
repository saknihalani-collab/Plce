import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/env';

/**
 * The Meta WhatsApp Business Cloud API, in two directions.
 *
 * Inbound: verify the signature before anything else runs. Meta signs
 * every webhook body with the app secret, and an unsigned or mismatched
 * body is not a message — it is someone else asking PL·CE to book a
 * studio on a stranger's behalf.
 *
 * Outbound: send the reply. Failure to send is logged rather than
 * thrown, because the booking has already been written by then and
 * losing it over a failed HTTP call would be far worse than a missing
 * confirmation.
 */

/**
 * Verifies `X-Hub-Signature-256` against the raw request body.
 *
 * The comparison is constant-time: a fast-failing string compare on a
 * signature leaks, one byte at a time, what the correct signature is.
 */
export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = env.whatsapp.appSecret;
  if (!secret || !signatureHeader) return false;

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;

  const received = Buffer.from(signatureHeader);
  const computed = Buffer.from(expected);
  if (received.length !== computed.length) return false;

  return timingSafeEqual(received, computed);
}

/** Meta's subscription handshake: echo the challenge if the token matches. */
export function verifySubscription(params: URLSearchParams): string | null {
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode !== 'subscribe' || !token || !challenge) return null;
  if (!env.whatsapp.verifyToken || token !== env.whatsapp.verifyToken) return null;

  return challenge;
}

export interface InboundWhatsAppMessage {
  from: string;
  body: string;
  messageId: string;
}

/**
 * Pulls plain-text messages out of Meta's webhook envelope.
 *
 * Everything else — reactions, statuses, images, delivery receipts — is
 * ignored rather than mishandled. A studio sending a photograph of a
 * room should not produce a booking.
 */
export function parseWebhookPayload(payload: unknown): InboundWhatsAppMessage[] {
  const messages: InboundWhatsAppMessage[] = [];
  const body = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            id?: string;
            type?: string;
            text?: { body?: string };
          }>;
        };
      }>;
    }>;
  };

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.type !== 'text') continue;
        if (!message.from || !message.text?.body) continue;

        messages.push({
          from: message.from.startsWith('+') ? message.from : `+${message.from}`,
          body: message.text.body,
          messageId: message.id ?? '',
        });
      }
    }
  }

  return messages;
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const { phoneNumberId, accessToken } = env.whatsapp;
  if (!phoneNumberId || !accessToken) {
    // In demo mode the reply is shown in the studio's message log rather
    // than sent. Saying so beats a silent no-op.
    console.info('[whatsapp] not configured — reply not sent:', body.slice(0, 80));
    return;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to.replace(/^\+/, ''),
          type: 'text',
          text: { body },
        }),
      },
    );

    if (!response.ok) {
      console.error('[whatsapp] send failed', response.status, await response.text());
    }
  } catch (error) {
    // The booking is already written. A failed send is a support
    // problem, not a reason to unwind it.
    console.error('[whatsapp] send threw', error);
  }
}
