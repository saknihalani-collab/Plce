import 'server-only';

import { intentSchema, type Intent, type IntentContext, type IntentProvider } from '@/lib/ai/provider';

/**
 * Claude as the intent extractor.
 *
 * The prompt is deliberately narrow. The model is not asked to book
 * anything, to reason about availability, or to know what a booking
 * costs — only to turn a sentence into the structured request the
 * backend already knows how to validate. Everything it returns is
 * Zod-parsed, and anything that fails to parse becomes `unknown`, which
 * makes the bot ask rather than act.
 */
export class AnthropicIntentProvider implements IntentProvider {
  readonly name = 'anthropic';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async interpret(message: string, context: IntentContext): Promise<Intent> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 400,
        system: systemPrompt(context),
        messages: [{ role: 'user', content: message }],
        // Pre-filling the opening brace keeps the reply to JSON without
        // relying on the model to resist a friendly preamble.
        ...{},
      }),
      // A studio owner is standing in a room waiting for a reply. If the
      // model is slow, the deterministic parser is a better answer than
      // a spinner.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = payload.content?.find((block) => block.type === 'text')?.text ?? '';
    const parsed = intentSchema.safeParse(extractJson(text));

    // A malformed intent is not an error to surface — it is a reason to
    // ask a question, which `unknown` triggers downstream.
    return parsed.success ? parsed.data : { kind: 'unknown' };
  }
}

function systemPrompt(context: IntentContext): string {
  return [
    'You turn a studio owner’s WhatsApp message into a structured request for PL·CE, a',
    'studio booking system. Reply with ONE JSON object and nothing else — no prose, no',
    'code fences.',
    '',
    `The studio is "${context.studioName}". Its bookable spaces are:`,
    ...context.spaceNames.map((name) => `  - ${name}`),
    '',
    `Today is ${context.today}.`,
    '',
    'Allowed shapes (omit any field you are not confident about — a missing field makes',
    'the system ask a clarifying question, which is always better than a guess):',
    '',
    '  {"kind":"create_booking","space":?,"date":?,"start":?,"end":?,"customerName":?,"customerPhone":?}',
    '  {"kind":"check_availability","space":?,"date":?,"start":?,"end":?}',
    '  {"kind":"todays_schedule","date":?}',
    '  {"kind":"cancel_booking","customerName":?,"date":?,"reference":?}',
    '  {"kind":"reschedule_booking","customerName":?,"reference":?,"date":?,"start":?,"end":?}',
    '  {"kind":"block_time","space":?,"date":?,"start":?,"end":?,"reason":?}',
    '  {"kind":"customer_lookup","name":?}',
    '  {"kind":"unknown"}',
    '',
    'Rules:',
    '  • "space" must be one of the space names above, copied exactly, or omitted.',
    '  • Pass dates through as written ("today", "tomorrow", "saturday", "2026-09-12").',
    '    Do not do date arithmetic — the server resolves them in the studio’s timezone.',
    '  • Times as 24-hour "HH:MM". "3 to 6" in a studio means 15:00 to 18:00.',
    '  • Never invent a customer name, a price, or an id.',
    '  • If the message is small talk, a thank-you, or you cannot tell what is being',
    '    asked, return {"kind":"unknown"}.',
    ...(context.pending?.kind
      ? [
          '',
          `The owner is part-way through a "${context.pending.kind}" request and has just`,
          'answered a question. Return that same kind with the fields you can now fill in;',
          'the server merges your answer into what it already had.',
        ]
      : []),
  ].join('\n');
}

/**
 * Models occasionally wrap JSON in a sentence or a code fence despite
 * instructions. Pulling the first balanced object out is cheaper than
 * failing the whole message over punctuation.
 */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
