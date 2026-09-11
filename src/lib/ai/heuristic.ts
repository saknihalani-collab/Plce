import type { Intent, IntentContext, IntentProvider } from '@/lib/ai/provider';

/**
 * The parser that runs when no model is configured.
 *
 * It handles the phrasings studios actually use — "book main studio
 * tomorrow 3 to 6 for Rahul", "is the cyc free saturday evening", "what
 * do I have today" — by matching verbs, the studio's own space names,
 * relative dates and time ranges.
 *
 * Where it is not confident it returns a *partial* intent or `unknown`,
 * and the clarification loop takes over. That is the point: the fallback
 * degrades to asking a question, never to guessing a booking. A wrong
 * booking costs a studio a client; an extra question costs them four
 * seconds.
 */
export class HeuristicIntentProvider implements IntentProvider {
  readonly name = 'heuristic';

  async interpret(message: string, context: IntentContext): Promise<Intent> {
    const text = message.toLowerCase().trim();
    if (!text) return { kind: 'unknown' };

    const space = matchSpace(text, message, context.spaceNames);
    const date = matchDate(text);
    const range = matchTimeRange(text);
    const name = matchName(message);

    /* Cancel — checked before "book", since "cancel the booking" has
       both words in it. */
    if (/\b(cancel|call off|drop)\b/.test(text)) {
      return {
        kind: 'cancel_booking',
        customerName: name,
        date,
        reference: matchReference(message),
      };
    }

    if (/\b(move|reschedule|shift|push|change)\b/.test(text)) {
      return {
        kind: 'reschedule_booking',
        customerName: name,
        reference: matchReference(message),
        date,
        /*
          A move usually names one time, not a range — "move Rahul to 6".
          Reading only a range meant the commonest phrasing, and the one
          the help text itself offers, always fell through to "what time
          should it move to?". The end is left undefined on purpose: the
          handler preserves the booking's existing length rather than
          inventing one.
        */
        start: range?.start ?? matchSingleTime(text),
        end: range?.end,
      };
    }

    if (/\bblock\b/.test(text) || /\bclose\b.*\b(studio|room|floor)\b/.test(text)) {
      return {
        kind: 'block_time',
        space,
        date,
        start: range?.start ?? partOfDay(text)?.start,
        end: range?.end ?? partOfDay(text)?.end,
        reason: matchReason(message),
      };
    }

    /*
       "What do I have today", "today's schedule", "any bookings tomorrow".

       Deliberately *not* triggered by the bare word "booking": an owner
       opening with "Booking for 5 to 7 for Shivam" is making one, not
       asking about them, and answering that with a schedule is the most
       annoying possible way to be wrong. A count is only being asked for
       when the word is qualified — "any bookings", "how many bookings".
    */
    const asksForSchedule =
      /\b(what|anything|schedule|diary)\b/.test(text) ||
      /\b(any|my|how many)\s+bookings?\b/.test(text);

    if (asksForSchedule && !/\bfree\b/.test(text) && !/\bavailable\b/.test(text)) {
      return { kind: 'todays_schedule', date: date ?? 'today' };
    }

    if (/\b(free|available|availability|open)\b/.test(text)) {
      const window = range ?? partOfDay(text);
      return {
        kind: 'check_availability',
        space,
        date,
        start: window?.start,
        end: window?.end,
      };
    }

    if (/\b(when is|when's|next|coming)\b/.test(text) && name) {
      return { kind: 'customer_lookup', name };
    }

    if (/\b(book|booking|reserve|hold|put in)\b/.test(text)) {
      return {
        kind: 'create_booking',
        space,
        date,
        start: range?.start,
        end: range?.end,
        customerName: name,
        customerPhone: matchPhone(message),
      };
    }

    /* A bare answer to a question the bot asked — "main studio", "4pm",
       "Rahul". Merging is the caller's job; the fragment is reported
       here as whatever it appears to be. */
    if (context.pending?.kind) {
      const fragment: Record<string, unknown> = { kind: context.pending.kind };
      if (space) fragment.space = space;
      if (date) fragment.date = date;
      if (range) {
        fragment.start = range.start;
        fragment.end = range.end;
      } else {
        const single = matchSingleTime(text);
        if (single) fragment.start = single;
      }
      if (!space && !date && !range && name) {
        fragment[context.pending.kind === 'customer_lookup' ? 'name' : 'customerName'] = name;
      }
      return fragment as Intent;
    }

    return { kind: 'unknown' };
  }
}

/* ── Matchers ───────────────────────────────────────────────────── */

/**
 * Space names are matched against the studio's own list rather than a
 * vocabulary of guesses, so "the cyc" resolves at Studio 404 and not at
 * a dance studio that has no such room.
 *
 * When nothing matches, a room-shaped phrase is returned *unresolved* —
 * "Studio B" at a studio that has no Studio B. That is deliberately not
 * the same as saying nothing: the handler can then answer "I could not
 * find a space called Studio B, yours are…" instead of the unhelpfully
 * generic "which space?". A name PL·CE does not recognise is a different
 * mistake from no name at all.
 */
function matchSpace(
  text: string,
  original: string,
  spaceNames: string[],
): string | undefined {
  const normalised = spaceNames
    .map((name) => ({ name, key: name.toLowerCase() }))
    .sort((a, b) => b.key.length - a.key.length);

  for (const { name, key } of normalised) {
    if (text.includes(key)) return name;
  }

  // Then on distinctive single words: "cyclorama" → "cyc", "podcast".
  for (const { name, key } of normalised) {
    const words = key.split(/\s+/).filter((word) => word.length > 3 && !GENERIC.has(word));
    if (words.some((word) => text.includes(word.slice(0, 4)))) return name;
  }

  // Nothing of theirs matched. Only report a candidate when the phrase
  // is unmistakably about a room — requiring a room word keeps a
  // customer's name out of "I could not find a space called Shivam".
  const candidate = ROOM_PHRASE.exec(original)?.[1]?.trim();
  if (!candidate) return undefined;

  // The optional qualifier happily swallows the verb — "Book Studio B"
  // rather than "Studio B". Quoting the owner's own words back at them
  // only helps if they are the right words.
  const trimmed = candidate.replace(LEADING_NOISE, '').trim();
  return trimmed.length > 1 ? trimmed : undefined;
}

const LEADING_NOISE =
  /^(?:book(?:ing)?|reserve|hold|block(?:ing)?|close|check|move|cancel|is|are|the|a|an|my|in|at|for|to|on)\s+/i;

/**
 * A room-shaped phrase: an optional qualifier, a room word, and an
 * optional label. Matches "Studio B", "the green room", "Cyc Hall 2".
 */
const ROOM_PHRASE =
  /\b((?:[A-Za-z]+\s+)?(?:studios?|rooms?|hall|floor|booth|stage|cyc|cyclorama)(?:\s+[A-Za-z0-9]{1,8})?)\b/i;

const GENERIC = new Set(['room', 'studio', 'space', 'hall', 'the']);

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function matchDate(text: string): string | undefined {
  if (/\bday after tomorrow\b/.test(text)) return 'day after tomorrow';
  if (/\btomorrow\b/.test(text)) return 'tomorrow';
  if (/\btoday\b|\btonight\b/.test(text)) return 'today';

  for (const weekday of WEEKDAYS) {
    if (text.includes(weekday)) return weekday;
  }

  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  if (iso) return iso[1];

  // "on the 12th", "12 sep"
  const day = /\b(\d{1,2})(st|nd|rd|th)\b/.exec(text);
  if (day) return `day ${day[1]}`;

  return undefined;
}

/** "3 to 6", "3-6pm", "from 15:00 to 18:00", "4 till 7". */
function matchTimeRange(text: string): { start: string; end: string } | undefined {
  const pattern =
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|till|until|-|–|—)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/;
  const match = pattern.exec(text);
  if (!match) return undefined;

  const endMeridiem = match[6];
  // "3 to 6" with a pm on the end applies to both: nobody means 3 AM
  // to 6 PM. Where neither is given, afternoon is the safer reading for
  // a studio and the confirmation shows the resolved time anyway.
  const startMeridiem = match[3] ?? endMeridiem;

  const start = toTime(Number(match[1]), match[2], startMeridiem);
  const end = toTime(Number(match[4]), match[5], endMeridiem ?? startMeridiem);
  if (!start || !end) return undefined;

  return { start, end };
}

function matchSingleTime(text: string): string | undefined {
  const match = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(text);
  if (!match) return undefined;
  return toTime(Number(match[1]), match[2], match[3]);
}

function toTime(
  hour: number,
  minute: string | undefined,
  meridiem: string | undefined,
): string | undefined {
  if (!Number.isFinite(hour) || hour > 24) return undefined;

  let hours = hour;
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  // Bare hours between 1 and 7 in a studio's day almost always mean the
  // afternoon. This is a guess, so it is shown back for confirmation.
  if (!meridiem && hours >= 1 && hours <= 7) hours += 12;

  if (hours > 24) return undefined;
  return `${String(hours).padStart(2, '0')}:${(minute ?? '00').padStart(2, '0')}`;
}

function partOfDay(text: string): { start: string; end: string } | undefined {
  if (/\bmorning\b/.test(text)) return { start: '09:00', end: '13:00' };
  if (/\bafternoon\b/.test(text)) return { start: '13:00', end: '17:00' };
  if (/\bevening\b|\btonight\b/.test(text)) return { start: '17:00', end: '21:00' };
  if (/\ball day\b|\bwhole day\b/.test(text)) return { start: '09:00', end: '21:00' };
  return undefined;
}

/** "for Rahul", "for Kritika Bose". */
function matchName(message: string): string | undefined {
  const match = /\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/.exec(message);
  if (match?.[1]) return match[1];

  // "Rahul's booking"
  const possessive = /\b([A-Z][a-z]+)'s\b/.exec(message);
  if (possessive?.[1]) return possessive[1];

  return undefined;
}

function matchPhone(message: string): string | undefined {
  const match = /(\+?\d[\d\s-]{8,15}\d)/.exec(message);
  return match?.[1]?.replace(/[\s-]/g, '');
}

function matchReference(message: string): string | undefined {
  const match = /\b(PLCE[- ]?[A-Z0-9]{5})\b/i.exec(message);
  return match?.[1]?.toUpperCase().replace(/\s/g, '-');
}

function matchReason(message: string): string | undefined {
  const match = /\bfor\s+(?!a\b)([a-z][a-z\s]{2,40})/i.exec(message);
  return match?.[1]?.trim();
}
