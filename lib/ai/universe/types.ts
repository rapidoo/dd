/**
 * Universe types and configuration for specialized agents.
 * Centralizes all universe-specific behavior in one place.
 */

import type { Participant } from '../../server/combat-loop';
import type { CharacterRow } from '../../db/types';

/** Supported game universes */
export type Universe = 'dnd5e' | 'witcher' | 'naheulbeuk';

/** Universe tone/behavior descriptors */
export type UniverseTone = 'dark-fantasy' | 'realistic-dark' | 'comic-parody';

/** Magic system type per universe */
export type MagicSystem = 'dnd-spells' | 'witcher-signs' | 'naheulbeuk-magic';

/**
 * Configuration for a specific universe.
 * Contains all prompts and universe-specific settings.
 */
export interface UniverseConfig {
  /** Unique identifier */
  id: Universe;
  /** Human-readable display name */
  displayName: string;
  /** Overall tone descriptor */
  tone: UniverseTone;
  /** Magic system type */
  magicSystem: MagicSystem;
  /** Default GM system prompt */
  gmPrompt: string;
  /** Factory for NPC system prompt (receives NPC context) */
  buildNpcPrompt: (context: {
    npc: Participant;
    enemies: Participant[];
    allies: Participant[];
  }) => string;
  /** Factory for Companion system prompt */
  buildCompanionPrompt: (context: {
    character: CharacterRow;
    hint?: string | null;
    combatBlock?: string;
  }) => string;
  /** Concierge extraction prompt (for entity/loot extraction) */
  conciergePrompt: string;
  /**
   * Universe-specific terminology mappings.
   * Used to translate generic terms to universe-specific ones.
   */
  terminology: Record<string, string>;
  /**
   * Universe-specific rules notes to include in prompts.
   */
  rulesNotes: string[];
}

/**
 * Input context for building universe-specific prompts
 */
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
