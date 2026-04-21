import type Anthropic from '@anthropic-ai/sdk';
import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow, MessageRow } from '../db/types';
import { type EntityKind, recallEntities, upsertEntity } from '../neo4j/queries';
import { parseDiceExpression, rollD20, rollExpression } from '../rules/dice';
import type { ConditionType } from '../rules/types';
import {
  activeEncounter,
  advanceTurnEncounter,
  applyDamageToCombatant,
  endCombat,
  healCombatant,
  mutateEncounter,
  startCombat,
  toggleCondition,
} from '../server/combat';
import { anthropic, MODELS } from './claude';
import { respondAsCompanion } from './companion-agent';
import { GM_TOOLS, type RecordEntityInput, type RequestRollInput } from './tools';

const GM_SYSTEM_PROMPT = `Tu es "Le Conteur", Maître du Donjon d'une partie de Donjons & Dragons 5e (SRD 5.1).

Ton rôle :
- Narre l'histoire dans un style "dark fantasy cozy" : cuir vieilli, parchemin, bougies, chaleur — mais pas glauque. Voix grave et patiente. Tu laisses respirer les silences.
- Décris les lieux avec sobriété, les PNJ avec une petite excentricité, les scènes avec une image marquante.
- Respecte les règles SRD. Pour tout jet important (combat, sauvegarde, test non trivial), utilise l'outil request_roll plutôt que de deviner le résultat.
- Reste en français. Ton joueur est francophone.
- Ne résume pas ce que le joueur vient de faire — enchaîne directement sur les conséquences.
- Conclus souvent par une question ouverte : "Que fais-tu ?" pour laisser la main au joueur.

Contexte mécanique :
- Théâtre de l'esprit : pas de grille tactique. Décris les distances en langage naturel ("à trois pas", "au fond de la salle").
- Les jets critiques (nat 20) font réussir et amplifier ; les nat 1 font rater et compliquer.

Format des réponses :
- Narration courte (3-6 phrases maximum par message)
- Pas de markdown, pas d'emojis
- Italique en HTML <em>...</em> uniquement pour les paroles d'un PNJ
`;

export interface GmTurnInput {
  sessionId: string;
  userMessage: string;
  history: MessageRow[];
  player: CharacterRow | null;
  companions: CharacterRow[];
  /** Campaign pitch / world summary — injected in system prompt. */
  worldSummary?: string | null;
}

export type GmEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'dice_request'; rollId: string; roll: DiceRollRecord; label: string }
  | { type: 'memory_recalled'; query: string; result: string }
  | { type: 'entity_recorded'; kind: string; name: string }
  | { type: 'companion'; characterId: string; characterName: string; content: string }
  | { type: 'combat_started'; combatId: string }
  | { type: 'combat_ended' }
  | { type: 'combat_update' }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface DiceRollRecord {
  id?: string;
  kind: string;
  /** Human-readable label chosen by the GM, e.g. "Perception", "Sauvegarde SAG". */
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

/**
 * Run the GM orchestration loop. Streams text deltas and tool results as
 * structured events. Caller persists the final message once the generator
 * yields { type: 'done' }.
 */
export async function* runGmTurn(input: GmTurnInput): AsyncGenerator<GmEvent> {
  const companionNameById = new Map(input.companions.map((c) => [c.id, c.name]));
  const messages: Anthropic.Messages.MessageParam[] = input.history
    .filter(
      (m) => m.author_kind === 'user' || m.author_kind === 'gm' || m.author_kind === 'character',
    )
    .map((m) => {
      if (m.author_kind === 'gm') {
        return { role: 'assistant' as const, content: m.content };
      }
      if (m.author_kind === 'character') {
        const name = (m.author_id && companionNameById.get(m.author_id)) || 'Compagnon';
        return { role: 'user' as const, content: `(${name} dit) ${m.content}` };
      }
      return { role: 'user' as const, content: m.content };
    });
  if (input.userMessage && input.userMessage.trim().length > 0) {
    messages.push({ role: 'user', content: input.userMessage });
  }

  const systemPrompt = buildSystemPrompt(input.player, input.companions, input.worldSummary);

  let safety = 0;
  while (safety < 6) {
    safety++;
    let response: Anthropic.Messages.Message;
    try {
      response = await anthropic().messages.create({
        model: MODELS.GM,
        max_tokens: 1024,
        system: systemPrompt,
        tools: GM_TOOLS,
        messages,
      });
    } catch (err) {
      yield { type: 'error', message: err instanceof Error ? err.message : 'LLM error' };
      return;
    }

    for (const block of response.content) {
      if (block.type === 'text') {
        yield { type: 'text_delta', delta: block.text };
      }
    }

    if (response.stop_reason !== 'tool_use') {
      yield { type: 'done' };
      return;
    }

    // Run every tool call, then loop.
    const assistantContent: Anthropic.Messages.ContentBlockParam[] = response.content;
    messages.push({ role: 'assistant', content: assistantContent });
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = await executeTool(block, input.sessionId);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result.result),
      });
      for (const ev of result.events) yield ev;
    }
    messages.push({ role: 'user', content: toolResults });
  }
  yield { type: 'error', message: 'Too many tool iterations' };
}

async function executeTool(
  block: Anthropic.Messages.ToolUseBlock,
  sessionId: string,
): Promise<{ result: unknown; events: GmEvent[] }> {
  switch (block.name) {
    case 'request_roll':
      return executeRoll(block.input as RequestRollInput, sessionId);
    case 'recall_memory': {
      const q = (block.input as { query: string }).query;
      const campaignId = await campaignForSession(sessionId);
      if (!campaignId) return { result: { context: 'Session invalide.' }, events: [] };
      try {
        const entities = await recallEntities(campaignId, q);
        const context =
          entities.length === 0
            ? 'Aucune entité correspondante en mémoire.'
            : entities
                .map((e) => `- ${e.kind} "${e.name}": ${e.short_description ?? '(pas de résumé)'}`)
                .join('\n');
        return {
          result: { entities, context },
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
      const input = block.input as RecordEntityInput;
      const campaignId = await campaignForSession(sessionId);
      if (!campaignId) return { result: { ok: false, error: 'Session invalide.' }, events: [] };
      const supabase = createSupabaseServiceClient();
      const { data: row } = await supabase
        .from('entities')
        .insert({
          campaign_id: campaignId,
          kind: input.kind,
          name: input.name,
          short_description: input.short_description ?? null,
        })
        .select('*')
        .single();
      try {
        if (row) {
          await upsertEntity({
            id: row.id,
            campaign_id: campaignId,
            kind: input.kind as EntityKind,
            name: input.name,
            short_description: input.short_description,
          });
        }
      } catch (err) {
        console.warn('Neo4j upsert failed, continuing', err);
      }
      return {
        result: { ok: true, id: row?.id },
        events: [{ type: 'entity_recorded', kind: input.kind, name: input.name }],
      };
    }
    case 'prompt_companion': {
      const input = block.input as { character_id: string; hint?: string };
      return executeCompanion(input, sessionId);
    }
    case 'start_combat': {
      const input = block.input as {
        npcs: Array<{ name: string; ac: number; hp: number; dex_mod?: number }>;
      };
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
      const combat = await startCombat({
        sessionId,
        npcs: input.npcs.map((n) => ({
          name: n.name,
          ac: n.ac,
          hp: n.hp,
          dexMod: n.dex_mod,
        })),
        characters: (characters ?? []) as CharacterRow[],
      });
      return {
        result: {
          combat_id: combat.id,
          round: combat.round,
          order: combat.initiative_order,
          combatants: combat.combatants,
        },
        events: [{ type: 'combat_started', combatId: combat.id }],
      };
    }
    case 'apply_damage': {
      const input = block.input as { combatant_id: string; amount: number };
      const enc = await activeEncounter(sessionId);
      if (!enc) return { result: { error: 'Aucun combat actif' }, events: [] };
      const next = await mutateEncounter(enc.id, (e) =>
        input.amount >= 0
          ? applyDamageToCombatant(e, input.combatant_id, input.amount)
          : healCombatant(e, input.combatant_id, -input.amount),
      );
      return {
        result: { combatants: next.combatants },
        events: [{ type: 'combat_update' }],
      };
    }
    case 'apply_condition': {
      const input = block.input as {
        combatant_id: string;
        condition: ConditionType;
        add: boolean;
        duration_rounds?: number;
      };
      const enc = await activeEncounter(sessionId);
      if (!enc) return { result: { error: 'Aucun combat actif' }, events: [] };
      const next = await mutateEncounter(enc.id, (e) =>
        toggleCondition(e, input.combatant_id, input.condition, input.add, input.duration_rounds),
      );
      return {
        result: { combatants: next.combatants },
        events: [{ type: 'combat_update' }],
      };
    }
    case 'next_turn': {
      const enc = await activeEncounter(sessionId);
      if (!enc) return { result: { error: 'Aucun combat actif' }, events: [] };
      const next = await mutateEncounter(enc.id, advanceTurnEncounter);
      return {
        result: { round: next.round, current_turn_index: next.current_turn_index },
        events: [{ type: 'combat_update' }],
      };
    }
    case 'end_combat': {
      const enc = await activeEncounter(sessionId);
      if (!enc) return { result: { error: 'Aucun combat actif' }, events: [] };
      await endCombat(enc.id);
      return { result: { ok: true }, events: [{ type: 'combat_ended' }] };
    }
    default:
      return { result: { error: `Unknown tool: ${block.name}` }, events: [] };
  }
}

function buildSystemPrompt(
  player: CharacterRow | null,
  companions: CharacterRow[],
  worldSummary?: string | null,
): string {
  const partyLines: string[] = [];
  if (player) {
    partyLines.push(
      `- Le joueur incarne ${player.name} (${player.species} · ${player.class} niv. ${player.level}). PV ${player.current_hp}/${player.max_hp}, CA ${player.ac}.`,
    );
  }
  if (companions.length > 0) {
    partyLines.push(
      "- Compagnons IA autour du feu (utilise l'outil prompt_companion pour leur donner la parole) :",
    );
    for (const c of companions) {
      const persona =
        typeof c.persona === 'object' && c.persona && 'notes' in c.persona
          ? String((c.persona as { notes?: unknown }).notes ?? '')
          : '';
      partyLines.push(
        `  · id="${c.id}" — ${c.name} (${c.species} ${c.class} niv. ${c.level})${persona ? ` — ${persona}` : ''}`,
      );
    }
  } else {
    partyLines.push(
      "- Le joueur n'a pas encore de compagnon IA. Si la situation s'y prête, tu peux évoquer qu'il est seul, mais NE propose PAS d'en introduire : c'est le joueur qui en recrute via la page Équipe.",
    );
  }

  const worldBlock = worldSummary ? `\nCampagne en cours :\n${worldSummary.trim()}\n` : '';

  return `${GM_SYSTEM_PROMPT}
${worldBlock}
Équipe actuelle :
${partyLines.join('\n')}

Quand un compagnon est présent, pense à lui laisser la parole régulièrement via prompt_companion — décris une scène, puis passe-lui le micro (indique character_id et éventuellement un hint).`;
}

async function campaignForSession(sessionId: string): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('sessions')
    .select('campaign_id')
    .eq('id', sessionId)
    .maybeSingle();
  return data?.campaign_id ?? null;
}

async function executeCompanion(
  input: { character_id: string; hint?: string },
  sessionId: string,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: character } = await supabase
    .from('characters')
    .select('*')
    .eq('id', input.character_id)
    .maybeSingle();
  if (!character) {
    return { result: { error: 'Compagnon introuvable' }, events: [] };
  }
  const { data: history } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  const text = await respondAsCompanion({
    sessionId,
    character,
    history: history ?? [],
    hint: input.hint,
  });
  return {
    result: { said: text || '(silence)' },
    events: text
      ? [
          {
            type: 'companion',
            characterId: character.id,
            characterName: character.name,
            content: text,
          },
        ]
      : [],
  };
}

async function executeRoll(
  input: RequestRollInput,
  sessionId: string,
): Promise<{ result: unknown; events: GmEvent[] }> {
  const advantage = input.advantage ?? 'normal';
  const roll = resolveRoll(input, advantage);
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('dice_rolls')
    .insert({
      session_id: sessionId,
      roll_kind: mapRollKind(input.kind),
      expression: input.dice,
      raw_dice: roll.dice,
      modifier: roll.modifier,
      total: roll.total,
      advantage,
      dc: input.dc ?? null,
      target_ac: input.target_ac ?? null,
      outcome: roll.outcome,
      context: { label: input.label },
    })
    .select('*')
    .single();

  const record: DiceRollRecord = {
    id: data?.id,
    kind: input.kind,
    label: input.label,
    expression: input.dice,
    dice: roll.dice,
    modifier: roll.modifier,
    total: roll.total,
    outcome: roll.outcome,
    advantage,
    ...(input.dc !== undefined ? { dc: input.dc } : {}),
    ...(input.target_ac !== undefined ? { targetAC: input.target_ac } : {}),
  };
  return {
    result: {
      total: roll.total,
      dice: roll.dice,
      outcome: roll.outcome,
      label: input.label,
    },
    events: [
      {
        type: 'dice_request',
        rollId: data?.id ?? 'local',
        roll: record,
        label: input.label,
      },
    ],
  };
}

function resolveRoll(
  input: RequestRollInput,
  advantage: 'normal' | 'advantage' | 'disadvantage',
): { dice: number[]; modifier: number; total: number; outcome: string | null } {
  const parsed = parseDiceExpression(input.dice);
  if (parsed.faces === 20 && parsed.count === 1 && input.kind !== 'damage') {
    const d20 = rollD20(parsed.modifier, advantage);
    const nat = d20.roll;
    const outcome =
      input.kind === 'attack'
        ? nat === 20
          ? 'crit'
          : nat === 1
            ? 'fumble'
            : input.target_ac !== undefined && d20.total >= input.target_ac
              ? 'hit'
              : 'miss'
        : input.dc !== undefined
          ? d20.total >= input.dc
            ? 'success'
            : 'failure'
          : null;
    return {
      dice: d20.rawRolls,
      modifier: parsed.modifier,
      total: d20.total,
      outcome,
    };
  }
  const r = rollExpression(input.dice);
  return { dice: r.dice, modifier: r.modifier, total: r.total, outcome: null };
}

function mapRollKind(
  kind: RequestRollInput['kind'],
): 'attack' | 'damage' | 'save' | 'check' | 'initiative' | 'concentration' {
  return kind;
}
