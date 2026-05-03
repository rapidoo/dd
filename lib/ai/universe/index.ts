/**
 * Universe module - Centralized configuration for all game universes.
 * 
 * This module provides a single source of truth for universe-specific behavior,
 * including system prompts, terminology, and rules for GM, NPC, and Companion agents.
 * 
 * @module lib/ai/universe
 */

import { UNIVERSE_CONFIGS } from './prompts';
import type {
  Universe,
  UniverseTone,
  MagicSystem,
  UniverseConfig,
  NpcPromptContext,
  CompanionPromptContext,
} from './types';

export type { Universe, UniverseTone, MagicSystem, UniverseConfig, NpcPromptContext, CompanionPromptContext };

/**
 * Get the configuration for a specific universe.
 * Falls back to 'dnd5e' if universe is not specified or unknown.
 */
export function getUniverseConfig(universe?: string | null): UniverseConfig {
  const targetUniverse = universe ?? 'dnd5e';
  const config = UNIVERSE_CONFIGS[targetUniverse];
  
  if (!config) {
    // Fallback to dnd5e if universe is unknown
    return UNIVERSE_CONFIGS.dnd5e;
  }
  
  return config;
}

/**
 * Get the GM system prompt for a specific universe.
 */
export function getGmPrompt(universe?: string | null): string {
  return getUniverseConfig(universe).gmPrompt;
}

/**
 * Build the NPC system prompt for a specific universe with context.
 */
export function buildNpcPrompt(universe: string, context: NpcPromptContext): string {
  return getUniverseConfig(universe).buildNpcPrompt(context);
}

/**
 * Build the Companion system prompt for a specific universe with context.
 */
export function buildCompanionPrompt(universe: string, context: CompanionPromptContext): string {
  return getUniverseConfig(universe).buildCompanionPrompt(context);
}

/**
 * Get the concierge extraction prompt for a specific universe.
 */
export function getConciergePrompt(universe?: string | null): string {
  return getUniverseConfig(universe).conciergePrompt;
}

/**
 * Get universe-specific terminology mapping.
 */
export function getUniverseTerminology(universe?: string | null): Record<string, string> {
  return getUniverseConfig(universe).terminology;
}

/**
 * Get all supported universes.
 */
export function getAllUniverses(): string[] {
  return Object.keys(UNIVERSE_CONFIGS);
}

/**
 * Check if a universe is supported.
 */
export function isValidUniverse(universe: string): universe is 'dnd5e' | 'witcher' | 'naheulbeuk' {
  return universe in UNIVERSE_CONFIGS;
}

/**
 * Translate a generic term to universe-specific terminology.
 * Returns the original term if no translation exists.
 */
export function translateTerm(term: string, universe?: string | null): string {
  const terminology = getUniverseTerminology(universe);
  return terminology[term.toLowerCase()] ?? term;
}
