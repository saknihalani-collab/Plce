import 'server-only';

import { env, isPaymentsConfigured } from '@/lib/env';
import type { Currency } from '@/types/domain';

/**
 * The payments seam.
 *
 * PL·CE takes bookings in India, so the live provider will be Razorpay;
 * the interface is written so that Stripe or anything else is a new file
 * rather than a change to the booking flow.
 *
 * With no provider configured the marketplace does not pretend to charge
 * anyone. It falls back to pay-at-the-studio, which is how most Mumbai
 * studios already work, and records the booking as unpaid so the owner
 * can collect and mark it off. A fake "payment successful" screen would
 * be worse than useless: it would make a studio believe it had been paid.
 */

export interface PaymentIntent {
  id: string;
  bookingReference: string;
  amount: number;
  currency: Currency;
  status: 'requires_payment' | 'pay_on_arrival' | 'captured';
  /** The provider's own id, when there is a provider. */
  providerRef: string | null;
  /** Where to send the customer to pay, when payment is online. */
  checkoutUrl: string | null;
}

export interface PaymentProvider {
  readonly name: string;
  readonly collectsOnline: boolean;
  createIntent(input: {
    bookingReference: string;
    amount: number;
    currency: Currency;
    customerName: string;
    customerEmail: string | null;
  }): Promise<PaymentIntent>;
}

/**
 * Pay at the studio. The honest default.
 */
class PayOnArrivalProvider implements PaymentProvider {
  readonly name = 'pay_on_arrival';
  readonly collectsOnline = false;

  async createIntent(input: {
    bookingReference: string;
    amount: number;
    currency: Currency;
  }): Promise<PaymentIntent> {
    return {
      id: `pay_${input.bookingReference}`,
      bookingReference: input.bookingReference,
      amount: input.amount,
      currency: input.currency,
      status: 'pay_on_arrival',
      providerRef: null,
      checkoutUrl: null,
    };
  }
}

/**
 * Razorpay.
 *
 * Creating an order is a server-to-server call; the browser then opens
 * Razorpay's own checkout with the order id, and a webhook confirms
 * capture. Only the first step belongs behind this interface — the rest
 * is provider-specific and lives with the route that handles it.
 */
class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  readonly collectsOnline = true;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
  ) {}

  async createIntent(input: {
    bookingReference: string;
    amount: number;
    currency: Currency;
  }): Promise<PaymentIntent> {
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        // Razorpay counts in paise; PL·CE stores whole rupees.
        amount: input.amount * 100,
        currency: input.currency,
        receipt: input.bookingReference,
        notes: { reference: input.bookingReference },
      }),
    });

    if (!response.ok) {
      throw new Error(`Razorpay order failed: ${response.status}`);
    }

    const order = (await response.json()) as { id: string };
    return {
      id: order.id,
      bookingReference: input.bookingReference,
      amount: input.amount,
      currency: input.currency,
      status: 'requires_payment',
      providerRef: order.id,
      checkoutUrl: null,
    };
  }
}

export function getPaymentProvider(): PaymentProvider {
  if (
    isPaymentsConfigured &&
    env.payments.provider === 'razorpay' &&
    env.payments.razorpayKeyId &&
    env.payments.razorpayKeySecret
  ) {
    return new RazorpayProvider(env.payments.razorpayKeyId, env.payments.razorpayKeySecret);
  }
  return new PayOnArrivalProvider();
}
