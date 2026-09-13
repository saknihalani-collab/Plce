import { describe, expect, it } from 'vitest';

import { HeuristicIntentProvider } from '@/lib/ai/heuristic';

/**
 * The spellings people actually type.
 *
 * "3 p.m to 6 p.m" reached production and lost its entire time range:
 * the meridiem patterns matched only "3pm", so the text read as a bare
 * "3 ... 6" with no range keyword, and the owner was asked for a time
 * they had just given. A parser that ignores what was said is worse
 * than one that admits it did not understand.
 */
const parser = new HeuristicIntentProvider();
const context = {
  spaceNames: ['Main Studio', 'Cyclorama'],
  studioName: 'Studio FourFive',
  today: '2026-09-14',
};

async function parse(message: string) {
  return parser.interpret(message, context);
}

describe('meridiem spellings', () => {
  it.each([
    'Book tomorrow 3pm to 6pm',
    'Book tomorrow 3 p.m to 6 p.m',
    'Book tomorrow 3 p.m. to 6 p.m.',
    'Book tomorrow 3 PM to 6 PM',
    'Book tomorrow 3 p m to 6 p m',
  ])('reads the range from %j', async (message) => {
    const intent = await parse(message);
    expect(intent).toMatchObject({ kind: 'create_booking', start: '15:00', end: '18:00' });
  });

  it('reads a morning range rather than assuming afternoon', async () => {
    const intent = await parse('Book tomorrow 9 a.m to 11 a.m');
    expect(intent).toMatchObject({ start: '09:00', end: '11:00' });
  });

  it('leaves a space name containing those letters alone', async () => {
    const intent = await parse('is the main studio free tomorrow 3 p.m to 6 p.m');
    expect(intent).toMatchObject({ kind: 'check_availability', space: 'Main Studio' });
  });
});
