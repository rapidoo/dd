import Anthropic from '@anthropic-ai/sdk';
import { env } from '../db/env';

export const MODELS = {
  GM: 'claude-opus-4-7',
  COMPANION: 'claude-sonnet-4-5',
  UTIL: 'claude-haiku-4-5',
} as const;

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}
