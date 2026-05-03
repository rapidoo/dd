/**
 * Universe types and configuration for specialized agents.
 * Single source of truth for `Universe` lives in `lib/db/types.ts` — we
 * re-export it here for convenience without redefining.
 */

import type { CharacterRow, Universe } from '../../db/types';
import type { Participant } from '../../server/combat-loop';

export type { Universe };

/**
 * Per-universe configuration consumed by the agent dispatchers.
 *
 * The concierge is intentionally NOT here: entity/loot extraction is purely
 * mechanical and must stay universe-agnostic to avoid biasing the JSON
 * output. Adding universe flavor to the concierge would defeat its purpose.
 */
export interface UniverseConfig {
  id: Universe;
  displayName: string;
  /** GM (narrator) system prompt — full text, sent every turn. */
  gmPrompt: string;
  /** Factory: produces the NPC system prompt from the current combat context. */
  buildNpcPrompt: (context: NpcPromptContext) => string;
  /** Factory: produces the companion system prompt. */
  buildCompanionPrompt: (context: CompanionPromptContext) => string;
}

export interface NpcPromptContext {
  npc: Participant;
  enemies: Participant[];
  allies: Participant[];
}

export interface CompanionPromptContext {
  character: CharacterRow;
  hint?: string | null;
  combatBlock?: string;
}
