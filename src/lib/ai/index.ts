import 'server-only';

import { AnthropicIntentProvider } from '@/lib/ai/anthropic';
import { HeuristicIntentProvider } from '@/lib/ai/heuristic';
import type { Intent, IntentContext, IntentProvider } from '@/lib/ai/provider';
import { env, isAiConfigured } from '@/lib/env';

/**
 * Intent extraction, with a floor under it.
 *
 * The model is the preferred interpreter; the deterministic parser is
 * the fallback, and it runs both when no key is configured *and* when a
 * configured model fails or times out. A studio owner standing in a room
 * waiting for a reply is better served by a slightly blunter parser than
 * by an apology.
 */
class FallbackIntentProvider implements IntentProvider {
  readonly name: string;

  constructor(
    private readonly primary: IntentProvider,
    private readonly fallback: IntentProvider,
  ) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async interpret(message: string, context: IntentContext): Promise<Intent> {
    try {
      const intent = await this.primary.interpret(message, context);
      // An `unknown` from the model is worth a second opinion: the
      // heuristic is narrower but very literal, and often catches a
      // plainly-phrased booking the model hedged on.
      if (intent.kind !== 'unknown') return intent;
    } catch (error) {
      console.error('[ai] primary interpreter failed, falling back', error);
    }

    return this.fallback.interpret(message, context);
  }
}

export function getIntentProvider(): IntentProvider {
  const heuristic = new HeuristicIntentProvider();

  if (isAiConfigured && env.ai.provider === 'anthropic' && env.ai.anthropicKey) {
    return new FallbackIntentProvider(
      new AnthropicIntentProvider(env.ai.anthropicKey, env.ai.anthropicModel),
      heuristic,
    );
  }

  return heuristic;
}

export type { Intent, IntentContext, IntentProvider } from '@/lib/ai/provider';
export { intentSchema } from '@/lib/ai/provider';
