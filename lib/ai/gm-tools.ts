import { z } from 'zod';
import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow, MessageRow, Universe } from '../db/types';
import { type EntityKind, searchEntities, upsertEntityNode } from '../neo4j/queries';
import type { ConditionType } from '../rules/types';
import {
  advanceUntilNextActor,
  applyDamageToParticipant,
  type CombatState,
  getActiveCombatState,
  startEncounter,
} from '../server/combat-loop';
import type { InventoryItem } from '../server/inventory-actions';
import { respondAsCompanion } from './companion-agent';
import type { GmEvent } from './events';
import type { ToolCallOut } from './llm/types';
import { campaignIdOfSession, characterInSession, combatantBelongsToSession } from './tenant-guard';
import {
  applyConditionSchema,
  executeApplyCondition,
  executePassTurn,
  executeRoll,
  nextActorInfo,
  parseToolInput,
  passTurnSchema,
  rollSchema,
} from './tool-executors';
import type { RecordEntityInput, RequestRollInput } from './tools';

const ENTITY_KINDS = ['npc', 'location', 'faction', 'item', 'quest', 'event'] as const;
const ITEM_TYPES = ['weapon', 'armor', 'tool', 'consumable', 'treasure', 'misc'] as const;

const recallSchema = z.object({ query: z.string().min(1).max(200) });

const recordEntitySchema = z.object({
  kind: z.enum(ENTITY_KINDS),
  name: z.string().trim().min(1).max(120),
  short_description: z.string().trim().max(400).optional(),
});

const combatantIdSchema = z.string().min(1).max(128);
const characterIdSchema = z.string().uuid();

const startCombatSchema = z.object({
  npcs: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        ac: z.number().int().min(5).max(30),
        hp: z.number().int().min(1).max(999),
        dex_mod: z.number().int().min(-5).max(10).optional(),
      }),
    )
    .min(0)
    .max(12),
});

const applyDamageSchema = z.object({
  combatant_id: combatantIdSchema,
  amount: z.number().int().min(-999).max(999),
});

const grantItemSchema = z.object({
  character_id: characterIdSchema,
  name: z.string().trim().min(1).max(80),
  qty: z.number().int().min(-999).max(999),
  type: z.enum(ITEM_TYPES).optional(),
  description: z.string().trim().max(400).optional(),
  weapon: z
    .object({
      damage_dice: z.string().regex(/^\s*\d*d(4|6|8|10|12|20|100)(\s*[+-]\s*\d+)?\s*$/i),
      damage_type: z.string().trim().max(40).optional(),
      ability: z.enum(['str', 'dex', 'finesse']).optional(),
      ranged: z.boolean().optional(),
    })
    .optional(),
});

const adjustCurrencySchema = z.object({
  character_id: characterIdSchema,
  cp: z.number().int().min(-99999).max(99999).optional(),
  sp: z.number().int().min(-99999).max(99999).optional(),
  ep: z.number().int().min(-99999).max(99999).optional(),
  gp: z.number().int().min(-99999).max(99999).optional(),
  pp: z.number().int().min(-99999).max(99999).optional(),
});

const promptCompanionSchema = z.object({
  character_id: characterIdSchema,
  hint: z.string().trim().max(400).optional(),
});

const castSpellSchema = z.object({
  character_id: characterIdSchema,
  spell_level: z.number().int().min(1).max(9),
  spell_name: z.string().trim().max(80).optional(),
});

const triggerRestSchema = z.object({
  character_id: characterIdSchema,
  kind: z.enum(['short', 'long']),
});

export interface GmToolContext {
  sessionId: string;
  universe: Universe | null;
  history: MessageRow[];
  renderCombatBlock: (state: CombatState | null) => string;
}

export async function executeGmTool(
  block: ToolCallOut,
  context: GmToolContext,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const { sessionId } = context;
  switch (block.name) {
    case 'request_roll': {
      const p = parseToolInput(rollSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      return executeRoll(p.data as RequestRollInput, sessionId);
    }
    case 'recall_memory': {
      const p = parseToolInput(recallSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const q = p.data.query;
      const campaignId = await campaignIdOfSession(sessionId);
      if (!campaignId) return { result: { context: 'Session invalide.' }, events: [] };
      try {
        const entities = await searchEntities(campaignId, q);
        const contextText =
          entities.length === 0
            ? 'Aucune entité correspondante en mémoire.'
            : entities
                .map((e) => `- ${e.kind} "${e.name}": ${e.short_description ?? '(pas de résumé)'}`)
                .join('\n');
        return {
          result: { entities, context: contextText },
          events: [{ type: 'memory_recalled', query: q, result: String(entities.length) }],
        };
      } catch (err) {
        return {
          result: {
            context: 'Mémoire momentanément indisponible.',
            error: err instanceof Error ? err.message : 'neo4j error',
          },
          events: [],
        };
      }
    }
    case 'record_entity': {
      const p = parseToolInput(recordEntitySchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input: RecordEntityInput = p.data;
      const campaignId = await campaignIdOfSession(sessionId);
      if (!campaignId) return { result: { ok: false, error: 'Session invalide.' }, events: [] };
      const id = crypto.randomUUID();
      try {
        await upsertEntityNode({
          id,
          campaign_id: campaignId,
          kind: input.kind as EntityKind,
          name: input.name,
          short_description: input.short_description,
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') console.warn('[memory.record_entity]', err);
        return {
          result: { ok: false, error: 'Neo4j indisponible' },
          events: [],
        };
      }
      return {
        result: { ok: true, id },
        events: [{ type: 'entity_recorded', kind: input.kind, name: input.name }],
      };
    }
    case 'grant_item': {
      const p = parseToolInput(grantItemSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input = p.data;
      if (!(await characterInSession(sessionId, input.character_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      return await grantItemToCharacter(input);
    }
    case 'adjust_currency': {
      const p = parseToolInput(adjustCurrencySchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input = p.data;
      if (!(await characterInSession(sessionId, input.character_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      return await adjustCharacterCurrency(input);
    }
    case 'cast_spell': {
      const p = parseToolInput(castSpellSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      if (!(await characterInSession(sessionId, p.data.character_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      return await castSpellOnCharacter(p.data.character_id, p.data.spell_level);
    }
    case 'trigger_rest': {
      const p = parseToolInput(triggerRestSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      if (!(await characterInSession(sessionId, p.data.character_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      return await triggerRestOnCharacter(p.data.character_id, p.data.kind);
    }
    case 'prompt_companion': {
      const p = parseToolInput(promptCompanionSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input = p.data;
      const character = await characterInSession(sessionId, input.character_id);
      if (!character) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      return executeCompanion({ character, hint: input.hint }, context);
    }
    case 'start_combat': {
      const p = parseToolInput(startCombatSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input = p.data;
      const supabase = createSupabaseServiceClient();
      const { data: session } = await supabase
        .from('sessions')
        .select('campaign_id')
        .eq('id', sessionId)
        .single();
      if (!session) return { result: { error: 'Session introuvable' }, events: [] };
      const { data: characters } = await supabase
        .from('characters')
        .select('*')
        .eq('campaign_id', session.campaign_id);
      const initial = await startEncounter({
        sessionId,
        npcs: input.npcs.map((n) => ({
          name: n.name,
          ac: n.ac,
          hp: n.hp,
          dexMod: n.dex_mod,
        })),
        characters: (characters ?? []) as CharacterRow[],
      });
      const advanced = await advanceFromStart(sessionId, initial);
      return {
        result: {
          combat_id: advanced.state?.combatId ?? initial.combatId,
          round: advanced.state?.round ?? initial.round,
          current_actor: currentActorId(advanced.state ?? initial),
          ended: advanced.ended,
        },
        events: [
          { type: 'combat_started', combatId: initial.combatId },
          { type: 'combat_state', state: advanced.state ?? initial },
          ...(advanced.ended ? ([{ type: 'combat_ended' }] as GmEvent[]) : []),
        ],
      };
    }
    case 'apply_damage': {
      const p = parseToolInput(applyDamageSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      const input = p.data;
      if (!(await combatantBelongsToSession(sessionId, input.combatant_id))) {
        return { result: { error: 'Cible hors campagne' }, events: [] };
      }
      const dmg = await applyDamageToParticipant(sessionId, input.combatant_id, input.amount);
      if (!dmg.ok) return { result: { error: dmg.error }, events: [] };
      const events: GmEvent[] = [];
      if (dmg.state) events.push({ type: 'combat_state', state: dmg.state });
      let lastState: CombatState | null = dmg.state ?? null;
      const targetEntry = dmg.state?.participants.find((p) => p.id === input.combatant_id);
      if (targetEntry?.kind === 'npc' && targetEntry.currentHP <= 0) {
        const adv = await advanceUntilNextActor(sessionId);
        if (adv.state) {
          events.push({ type: 'combat_state', state: adv.state });
          lastState = adv.state;
        }
        if (adv.ended) events.push({ type: 'combat_ended' });
      }
      return {
        result: {
          ok: true,
          current_hp: dmg.currentHP,
          max_hp: dmg.maxHP,
          next_actor: nextActorInfo(lastState),
        },
        events,
      };
    }
    case 'apply_condition': {
      const p = parseToolInput(applyConditionSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      return executeApplyCondition(sessionId, {
        ...p.data,
        condition: p.data.condition as ConditionType,
      });
    }
    case 'pass_turn': {
      const p = parseToolInput(passTurnSchema, block.input);
      if (!p.ok) return { result: p.result, events: [] };
      return executePassTurn(sessionId);
    }
    default:
      return { result: { error: `Unknown tool: ${block.name}` }, events: [] };
  }
}

function currentActorId(state: CombatState): string | null {
  const actor = state.participants.find((p) => p.isCurrent);
  return actor?.id ?? null;
}

async function advanceFromStart(
  sessionId: string,
  initial: CombatState,
): Promise<{ ended: boolean; state: CombatState | null }> {
  const firstActor = initial.participants[initial.currentTurnIndex];
  if (firstActor && firstActor.currentHP > 0) {
    return { ended: false, state: initial };
  }
  return await advanceUntilNextActor(sessionId);
}

async function executeCompanion(
  input: { character: CharacterRow; hint?: string },
  context: GmToolContext,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const compState = await getActiveCombatState(context.sessionId).catch(() => null);
  const combatBlock = context.renderCombatBlock(compState);
  const turn = await respondAsCompanion({
    sessionId: context.sessionId,
    character: input.character,
    history: context.history,
    hint: input.hint,
    combatState: compState,
    combatBlock,
    universe: context.universe,
    executeRoll,
  });
  const events: GmEvent[] = [...turn.events];
  if (turn.text) {
    events.push({
      type: 'companion',
      characterId: input.character.id,
      characterName: input.character.name,
      content: turn.text,
    });
  }
  return {
    result: { said: turn.text || '(silence)' },
    events,
  };
}

async function grantItemToCharacter(input: {
  character_id: string;
  name: string;
  qty: number;
  type?: 'weapon' | 'armor' | 'tool' | 'consumable' | 'treasure' | 'misc';
  description?: string;
  weapon?: {
    damage_dice: string;
    damage_type?: string;
    ability?: 'str' | 'dex' | 'finesse';
    ranged?: boolean;
  };
}): Promise<{ result: unknown; events: GmEvent[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('id, inventory')
    .eq('id', input.character_id)
    .maybeSingle();
  if (!character) return { result: { error: 'Personnage introuvable' }, events: [] };
  const items = (character.inventory as InventoryItem[]) ?? [];
  const type = input.type ?? 'misc';
  const existing = items.find(
    (i) => i.name.toLowerCase() === input.name.toLowerCase() && (i.type ?? 'misc') === type,
  );
  const weaponMeta = input.weapon
    ? {
        damageDice: input.weapon.damage_dice,
        damageType: input.weapon.damage_type,
        ability: input.weapon.ability,
        ranged: input.weapon.ranged,
      }
    : undefined;
  let next: InventoryItem[];
  if (existing) {
    next = items
      .map((i) =>
        i === existing ? { ...i, qty: i.qty + input.qty, weapon: weaponMeta ?? i.weapon } : i,
      )
      .filter((i) => i.qty > 0);
  } else if (input.qty > 0) {
    next = [
      ...items,
      {
        id: `i-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: input.name,
        qty: input.qty,
        type,
        description: input.description,
        weapon: weaponMeta,
      },
    ];
  } else {
    next = items;
  }
  await supabase.from('characters').update({ inventory: next }).eq('id', input.character_id);
  return {
    result: { ok: true, inventory: next },
    events: [{ type: 'party_update' }],
  };
}

async function adjustCharacterCurrency(input: {
  character_id: string;
  cp?: number;
  sp?: number;
  ep?: number;
  gp?: number;
  pp?: number;
}): Promise<{ result: unknown; events: GmEvent[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('id, currency')
    .eq('id', input.character_id)
    .maybeSingle();
  if (!character) return { result: { error: 'Personnage introuvable' }, events: [] };
  const current = (character.currency as {
    cp: number;
    sp: number;
    ep: number;
    gp: number;
    pp: number;
  }) ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const next = {
    cp: Math.max(0, current.cp + (input.cp ?? 0)),
    sp: Math.max(0, current.sp + (input.sp ?? 0)),
    ep: Math.max(0, current.ep + (input.ep ?? 0)),
    gp: Math.max(0, current.gp + (input.gp ?? 0)),
    pp: Math.max(0, current.pp + (input.pp ?? 0)),
  };
  await supabase.from('characters').update({ currency: next }).eq('id', input.character_id);
  return {
    result: { ok: true, currency: next },
    events: [{ type: 'party_update' }],
  };
}

async function castSpellOnCharacter(
  characterId: string,
  spellLevel: number,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('id, spell_slots')
    .eq('id', characterId)
    .maybeSingle();
  if (!character) return { result: { error: 'Personnage introuvable' }, events: [] };
  const slots = (character.spell_slots ?? {}) as Record<string, { max: number; used: number }>;
  const slot = slots[String(spellLevel)];
  if (!slot || slot.used >= slot.max) {
    return {
      result: {
        ok: false,
        error: `Aucun emplacement de niveau ${spellLevel} disponible. Le sort ne peut pas être lancé.`,
      },
      events: [],
    };
  }
  const next = { ...slots, [spellLevel]: { ...slot, used: slot.used + 1 } };
  await supabase.from('characters').update({ spell_slots: next }).eq('id', characterId);
  return {
    result: {
      ok: true,
      spell_level: spellLevel,
      remaining: slot.max - (slot.used + 1),
      out_of: slot.max,
    },
    events: [{ type: 'party_update' }],
  };
}

async function triggerRestOnCharacter(
  characterId: string,
  kind: 'short' | 'long',
): Promise<{ result: unknown; events: GmEvent[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('id, con, current_hp, max_hp, spell_slots, exhaustion, class')
    .eq('id', characterId)
    .maybeSingle();
  if (!character) return { result: { error: 'Personnage introuvable' }, events: [] };

  if (kind === 'long') {
    const slots = (character.spell_slots ?? {}) as Record<string, { max: number; used: number }>;
    const restoredSlots: Record<string, { max: number; used: number }> = {};
    for (const [lvl, s] of Object.entries(slots)) {
      restoredSlots[lvl] = { max: s.max, used: 0 };
    }
    const nextExhaustion = Math.max(0, character.exhaustion - 1);
    await supabase
      .from('characters')
      .update({
        current_hp: character.max_hp,
        spell_slots: restoredSlots,
        exhaustion: nextExhaustion,
      })
      .eq('id', characterId);
    return {
      result: {
        ok: true,
        kind: 'long',
        current_hp: character.max_hp,
        exhaustion: nextExhaustion,
        slots_restored: true,
      },
      events: [{ type: 'party_update' }],
    };
  }

  const classFaces: Record<string, number> = {
    barbarian: 12,
    bard: 8,
    cleric: 8,
    druid: 8,
    fighter: 10,
    monk: 8,
    paladin: 10,
    ranger: 10,
    rogue: 8,
    sorcerer: 6,
    warlock: 8,
    wizard: 6,
  };
  const faces = classFaces[character.class] ?? 8;
  const roll = 1 + Math.floor(Math.random() * faces);
  const conMod = Math.floor((character.con - 10) / 2);
  const gained = Math.max(1, roll + conMod);
  const newHP = Math.min(character.max_hp, character.current_hp + gained);
  await supabase.from('characters').update({ current_hp: newHP }).eq('id', characterId);
  return {
    result: {
      ok: true,
      kind: 'short',
      hit_die_rolled: `d${faces}`,
      roll,
      con_mod: conMod,
      hp_gained: gained,
      current_hp: newHP,
    },
    events: [{ type: 'party_update' }],
  };
}
