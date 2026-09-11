'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Send } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { connectWhatsApp, sendTestWhatsAppMessage } from '@/features/studio/actions';
import type { ActionResult } from '@/lib/action-result';
import { formatPhone } from '@/lib/format';
import type { WhatsAppAccount } from '@/types/domain';

type Reply = ActionResult<{ reply: string }> | null;
type Challenge = ActionResult<{ code: string; expiresAt: string }> | null;

/**
 * The console.
 *
 * It sends a message through the *real* handler — same parser, same
 * validation, same booking engine, same calendar. Connecting a Meta
 * Business number takes days of review, and an owner should be able to
 * see exactly what the assistant will do to their diary before they
 * commit to that.
 */
export function WhatsAppConsole({ account }: { account: WhatsAppAccount }) {
  const [state, action] = useActionState<Reply, FormData>(
    sendTestWhatsAppMessage as (previous: Reply, formData: FormData) => Promise<Reply>,
    null,
  );
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (state && !state.ok) toast.error(state.error);
    if (state?.ok) setDraft('');
  }, [state]);

  const examples = [
    'What do I have today?',
    'Book Main Studio tomorrow 3 to 6 for Rahul',
    'Is the cyc free saturday evening?',
    'Block Podcast Room tomorrow morning',
  ];

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Try it</p>
        <p className="tabular text-xs text-ink-soft">
          as {formatPhone(account.phone)}
        </p>
      </div>

      <p className="mt-2 text-sm text-ink-muted">
        This runs the real assistant against your real calendar. A booking made here is a
        booking.
      </p>

      {state?.ok ? (
        <div className="mt-5 rounded-[--radius-sm] border border-olive/30 bg-olive/10 p-4">
          <p className="eyebrow mb-2">Reply</p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
            {state.data.reply}
          </p>
        </div>
      ) : null}

      <form action={action} className="mt-5">
        <div className="flex gap-2">
          <input
            name="body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Book Main Studio tomorrow 3 to 6 for Rahul"
            aria-label="Message"
            className="field flex-1"
          />
          <SendButton />
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setDraft(example)}
            className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Send className="size-4" />
      {pending ? 'Sending…' : 'Send'}
    </Button>
  );
}

/**
 * Connecting a number is a two-step challenge, not a text field.
 *
 * Typing a number only says which one you intend to prove. The code
 * appears here once, is never stored in readable form, and is never sent
 * anywhere — the owner reads it off this screen and sends it from the
 * number itself, which is the only thing that actually demonstrates they
 * hold it.
 *
 * That is also why a reload loses it: there is nothing to reload from.
 */
export function ConnectWhatsApp({ pendingPhone }: { pendingPhone?: string }) {
  const [state, action] = useActionState<Challenge, FormData>(
    connectWhatsApp as (previous: Challenge, formData: FormData) => Promise<Challenge>,
    null,
  );

  useEffect(() => {
    if (state && !state.ok && !state.field) toast.error(state.error);
  }, [state]);

  const error = state && !state.ok ? state : null;

  if (state?.ok) {
    return (
      <div className="card space-y-4 p-5">
        <p className="eyebrow">Send this code</p>

        <p className="display text-4xl tracking-[0.2em] text-ink">{state.data.code}</p>

        <p className="text-sm leading-relaxed text-ink-muted">
          Send this code from that WhatsApp number to the PL·CE number. That proves the
          number is yours — nothing is connected until it arrives.
        </p>

        <p className="text-xs leading-relaxed text-ink-soft">
          The code lasts 15 minutes and is shown once. If you lose it, enter the number again
          for a new one.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-5">
      <p className="eyebrow">{pendingPhone ? 'Finish connecting' : 'Connect a number'}</p>
      <p className="text-sm text-ink-muted">
        {pendingPhone
          ? `${formatPhone(pendingPhone)} is waiting to be verified. Enter it again to get a fresh code.`
          : 'The number your customers already message you on. PL·CE recognises it and answers as your studio.'}
      </p>

      <Field label="WhatsApp number" htmlFor="phone" required error={error?.error}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          required
          defaultValue={pendingPhone ?? ''}
          placeholder="+91 98200 12345"
        />
      </Field>

      <Button type="submit">{pendingPhone ? 'Send a new code' : 'Send code'}</Button>
    </form>
  );
}
