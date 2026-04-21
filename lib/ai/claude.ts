import Anthropic from '@anthropic-ai/sdk';
import { env } from '../db/env';

// Cost mode: everything on Haiku 4.5. The orchestration (rolling summary,
// concierge, regex safeguards) compensates for the narrative gap vs. Opus.
// To re-enable Opus narration, swap GM to 'claude-opus-4-7'.
export const MODELS = {
  GM: 'claude-haiku-4-5',
  COMPANION: 'claude-haiku-4-5',
  UTIL: 'claude-haiku-4-5',
} as const;

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}
