import { after, NextResponse } from 'next/server';

import { getServiceRepository } from '@/lib/data';
import { isWhatsAppConfigured } from '@/lib/env';
import {
  parseWebhookPayload,
  sendWhatsAppMessage,
  verifySignature,
  verifySubscription,
  type InboundWhatsAppMessage,
} from '@/lib/whatsapp/client';
import { explainFailure, handleInboundMessage } from '@/lib/whatsapp/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The WhatsApp webhook.
 *
 * Meta's subscription handshake on GET; inbound messages on POST. The
 * signature check is the first thing that runs on POST and nothing else
 * happens without it — an unsigned body is not a message from a studio,
 * it is someone asking PL·CE to book on a stranger's behalf.
 *
 * Everything after the signature check runs *after* the response.
 * Interpreting a message, checking availability, writing a booking and
 * replying add up to seconds, and Meta redelivers anything it is not
 * acknowledged for quickly. The old shape made the slow path and the
 * retry window the same window: a booking that took too long to write
 * was a booking Meta asked us to write again.
 *
 * Retries are still expected — a lost response, a restart mid-work — so
 * speed is not the guarantee. The guarantee is in the handler, where
 * each message is claimed by its Meta id before anything mutates.
 */

export async function GET(request: Request) {
  const challenge = verifySubscription(new URL(request.url).searchParams);

  if (!challenge) {
    return new NextResponse('Verification failed', { status: 403 });
  }

  // Meta expects the raw challenge back as plain text.
  return new NextResponse(challenge, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
}

export async function POST(request: Request) {
  if (!isWhatsAppConfigured) {
    // Without an app secret there is no way to tell a real message from
    // a forged one, so the endpoint refuses rather than trusting the body.
    return NextResponse.json({ error: 'WhatsApp is not configured' }, { status: 503 });
  }

  // The signature is computed over the exact bytes Meta sent, so the body
  // has to be read as text before anything parses it.
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  const messages = parseWebhookPayload(payload);

  // Signature verified, payload understood: acknowledge now, work after.
  if (messages.length > 0) {
    after(() => processMessages(messages));
  }

  return NextResponse.json({ received: messages.length });
}

/**
 * The work, once Meta has been told we have it.
 *
 * Messages are handled in sequence rather than in parallel: two bookings
 * from the same studio arriving together should be decided in the order
 * they were sent, and the second one should see the first one's booking
 * when it checks availability.
 */
async function processMessages(messages: InboundWhatsAppMessage[]): Promise<void> {
  const repository = await getServiceRepository();

  for (const message of messages) {
    try {
      const result = await handleInboundMessage(repository, {
        phone: message.from,
        body: message.body,
        messageId: message.messageId || undefined,
      });

      // A duplicate delivery is not an event worth replying to — the
      // first delivery already answered it.
      if (result.duplicate) {
        console.info('[whatsapp] duplicate delivery ignored', message.messageId);
        continue;
      }

      await sendWhatsAppMessage(message.from, result.reply);
    } catch (error) {
      // One bad message must not stop the rest of the batch.
      console.error('[whatsapp] failed to handle message', message.messageId, error);
      await sendWhatsAppMessage(message.from, explainFailure(error));
    }
  }
}
