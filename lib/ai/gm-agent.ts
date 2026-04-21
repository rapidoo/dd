import type Anthropic from '@anthropic-ai/sdk';
import { createSupabaseServiceClient } from '../db/server';
import type { MessageRow } from '../db/types';
import { parseDiceExpression, rollD20, rollExpression } from '../rules/dice';
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
}

export type GmEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'dice_request'; rollId: string; roll: DiceRollRecord; label: string }
  | { type: 'memory_recalled'; query: string; result: string }
  | { type: 'entity_recorded'; kind: string; name: string }
  | { type: 'companion'; characterId: string; characterName: string; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface DiceRollRecord {
  id?: string;
  kind: string;
  expression: string;
  dice: number[];
  modifier: number;
  total: number;
  outcome: string | null;
  advantage: 'normal' | 'advantage' | 'disadvantage';
}

/**
 * Run the GM orchestration loop. Streams text deltas and tool results as
 * structured events. Caller persists the final message once the generator
 * yields { type: 'done' }.
 */
export async function* runGmTurn(input: GmTurnInput): AsyncGenerator<GmEvent> {
  const messages: Anthropic.Messages.MessageParam[] = input.history
    .filter((m) => m.author_kind === 'user' || m.author_kind === 'gm')
    .map((m) => ({
      role: m.author_kind === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));
  messages.push({ role: 'user', content: input.userMessage });

  let safety = 0;
  while (safety < 6) {
    safety++;
    let response: Anthropic.Messages.Message;
    try {
      response = await anthropic().messages.create({
        model: MODELS.GM,
        max_tokens: 1024,
        system: GM_SYSTEM_PROMPT,
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
    case 'recall_memory':
      return {
        result: { context: 'Aucune entité connue pour cette requête (mémoire non câblée).' },
        events: [{ type: 'memory_recalled', query: 'n/a', result: 'empty' }],
      };
    case 'record_entity': {
      const input = block.input as RecordEntityInput;
      return {
        result: { ok: true },
        events: [{ type: 'entity_recorded', kind: input.kind, name: input.name }],
      };
    }
    case 'prompt_companion': {
      const input = block.input as { character_id: string; hint?: string };
      return executeCompanion(input, sessionId);
    }
    default:
      return { result: { error: `Unknown tool: ${block.name}` }, events: [] };
  }
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
    expression: input.dice,
    dice: roll.dice,
    modifier: roll.modifier,
    total: roll.total,
    outcome: roll.outcome,
    advantage,
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
