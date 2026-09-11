import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import {
  ConnectWhatsApp,
  WhatsAppConsole,
} from '@/features/studio/components/whatsapp-console';
import { assertStudioPermission, requireStudioContext } from '@/features/studio/lib/context';
import { AutoRefresh } from '@/features/studio/components/auto-refresh';
import { env, isAiConfigured, isWhatsAppConfigured } from '@/lib/env';
import { formatPhone, formatRelativeTime } from '@/lib/format';
import { WHATSAPP_OUTCOME_LABELS } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'WhatsApp', robots: { index: false } };

export default async function WhatsAppPage() {
  const context = await requireStudioContext('/studio/whatsapp');
  assertStudioPermission(context, 'whatsapp.manage');

  const { repository, organizationId } = context;
  const [accounts, messages] = await Promise.all([
    repository.listWhatsAppAccounts(organizationId),
    repository.listWhatsAppMessages(organizationId, 40),
  ]);

  /*
    Three states, and the difference between the middle two matters: a
    number that has been typed in is not a number that has been proved,
    and the page should never imply otherwise.
  */
  const verified = accounts.find((account) => account.isActive && account.verifiedAt);
  const pending = accounts.find((account) => account.isActive && !account.verifiedAt);

  return (
    <div className="max-w-4xl">
      {/* A message can arrive while this page is open. */}
      <AutoRefresh />

      <p className="eyebrow">Bookings by text</p>
      <h1 className="display mt-3 text-4xl text-ink">WhatsApp</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        Text the studio a booking and it lands in your calendar. Same availability rules,
        same turnaround times, same customer list — WhatsApp is another way in, not another
        system.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {verified ? (
            <WhatsAppConsole account={verified} />
          ) : (
            <ConnectWhatsApp pendingPhone={pending?.phone} />
          )}

          <section className="card p-5">
            <h2 className="eyebrow mb-4">WhatsApp activity</h2>

            {messages.length === 0 ? (
              <p className="text-sm text-ink-soft">
                Nothing yet. Every message in and out appears here with what it actually
                did, so you can see your texts are being acted on.
              </p>
            ) : (
              <ol className="space-y-3">
                {[...messages].reverse().map((message) => (
                  <li
                    key={message.id}
                    className={
                      message.direction === 'inbound'
                        ? 'flex justify-start'
                        : 'flex justify-end'
                    }
                  >
                    <div
                      className={
                        message.direction === 'inbound'
                          ? 'max-w-[85%] rounded-[--radius-sm] rounded-bl-sm border border-line bg-stone-deep px-3.5 py-2.5'
                          : 'max-w-[85%] rounded-[--radius-sm] rounded-br-sm border border-olive/30 bg-olive/10 px-3.5 py-2.5'
                      }
                    >
                      <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                        {message.body}
                      </p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.625rem] text-ink-soft">
                        <span>{formatRelativeTime(message.createdAt)}</span>
                        {message.outcome ? (
                          <span
                            className={
                              message.outcome === 'refused'
                                ? 'text-alert-ink'
                                : message.outcome === 'clarification'
                                  ? 'text-butter-ink'
                                  : 'text-olive-ink'
                            }
                          >
                            {message.outcome === 'refused'
                              ? '✕'
                              : message.outcome === 'clarification'
                                ? '?'
                                : '✓'}{' '}
                            {WHATSAPP_OUTCOME_LABELS[message.outcome]}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="eyebrow">Connected numbers</p>
            {accounts.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">None yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {accounts.map((account) => (
                  <li key={account.id} className="flex items-center justify-between gap-3">
                    <span className="tabular text-sm text-ink">
                      {formatPhone(account.phone)}
                    </span>
                    {!account.isActive ? (
                      <Badge tone="neutral">Off</Badge>
                    ) : account.verifiedAt ? (
                      <Badge tone="sage">Verified</Badge>
                    ) : (
                      <Badge tone="amber">Pending</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <p className="eyebrow">How it works</p>
            <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-ink-muted">
              <li>
                <span className="text-ink">1 · Verified</span> — you prove the number is
                yours once, by sending PL·CE a code from it. After that every message is
                checked against Meta&rsquo;s signature and matched to your studio by the
                number it came from. Never by what the message says.
              </li>
              <li>
                <span className="text-ink">2 · Understood</span> — the message becomes a
                structured request. The assistant cannot write to the database; it can only
                describe what was asked.
              </li>
              <li>
                <span className="text-ink">3 · Checked</span> — PL·CE resolves the space
                and the date, and asks if anything is missing rather than guessing.
              </li>
              <li>
                <span className="text-ink">4 · Booked</span> — through the same engine as
                the website, so it cannot double-book.
              </li>
            </ol>
          </div>

          <div className="card p-5">
            <p className="eyebrow">Setup</p>
            <dl className="mt-3 space-y-2 text-xs">
              <Row label="Meta Cloud API" ok={isWhatsAppConfigured} />
              <Row label="AI interpretation" ok={isAiConfigured} />
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              {isWhatsAppConfigured
                ? `Webhook: ${env.siteUrl}/api/whatsapp/webhook`
                : 'Without Meta credentials, replies are logged here rather than sent. Everything else — parsing, availability, booking — is live.'}
            </p>
            {!isAiConfigured ? (
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                With no model configured, a rule-based parser handles the common phrasings
                and asks a question whenever it is not certain.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd>
        {ok ? <Badge tone="sage">Connected</Badge> : <Badge tone="neutral">Not set</Badge>}
      </dd>
    </div>
  );
}
