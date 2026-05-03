import type { CombatState } from '../server/combat-loop';

/**
 * Stream events emitted by an agent (narrator, npc, companion) during a turn.
 * The orchestrator forwards these to the SSE route which translates each into
 * a discrete client event.
 */
export type GmEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'dice_request'; rollId: string; roll: DiceRollRecord; label: string }
  | { type: 'memory_recalled'; query: string; result: string }
  | { type: 'entity_recorded'; kind: string; name: string }
  | { type: 'companion'; characterId: string; characterName: string; content: string }
  | { type: 'combat_started'; combatId: string }
  | { type: 'combat_ended' }
  | { type: 'combat_state'; state: CombatState }
  // Light "party may have changed" signal for non-combat mutations
  // (inventory, currency, spell slots, rest). Kept distinct from combat_state
  // because no combat payload exists for these.
  | { type: 'party_update' }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface DiceRollRecord {
  id?: string;
  kind: string;
  /** Human-readable label chosen by the agent, e.g. "Perception", "Sauvegarde SAG". */
  label: string;
  expression: string;
  dice: number[];
  modifier: number;
  total: number;
  outcome: string | null;
  advantage: 'normal' | 'advantage' | 'disadvantage';
  /** DC for saves/checks. */
  dc?: number;
  /** Target AC for attacks. */
  targetAC?: number;
}
