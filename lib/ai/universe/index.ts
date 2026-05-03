/**
 * Universe module — single source of truth for per-universe agent prompts.
 *
 * The narrator (GM), NPC, and companion agents all dispatch through here.
 * The concierge stays universe-agnostic on purpose (mechanical extraction)
 * and does NOT consult this module.
 */

import type { Universe } from '../../db/types';
import { UNIVERSE_CONFIGS } from './prompts';
import type { CompanionPromptContext, NpcPromptContext, UniverseConfig } from './types';

export type { CompanionPromptContext, NpcPromptContext, Universe, UniverseConfig };

/** Resolve a universe to its config, defaulting to dnd5e on null/undefined. */
export function getUniverseConfig(universe: Universe | null | undefined): UniverseConfig {
  return UNIVERSE_CONFIGS[universe ?? 'dnd5e'];
}

export function getGmPrompt(universe: Universe | null | undefined): string {
  return getUniverseConfig(universe).gmPrompt;
}

export function buildNpcPrompt(
  universe: Universe | null | undefined,
  context: NpcPromptContext,
): string {
  return getUniverseConfig(universe).buildNpcPrompt(context);
}

export function buildCompanionPrompt(
  universe: Universe | null | undefined,
  context: CompanionPromptContext,
): string {
  return getUniverseConfig(universe).buildCompanionPrompt(context);
}
