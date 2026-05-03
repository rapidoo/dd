/**
 * /debug mode — shortcircuits Opus and triggers the same tools it would
 * invoke, so you can exercise the UI (dice cards, HP bar, bourse,
 * inventaire, emplacements, combat tracker…) without spending tokens.
 *
 * Trigger from the session input box:
 *   /debug help
 *   /debug dice                        → d20+5 check
 *   /debug crit                        → attack with nat 20
 *   /debug fumble                      → attack with nat 1
 *   /debug damage 5                    → 5 dmg on the player
 *   /debug heal 3                      → 3 hp heal on the player
 *   /debug loot                        → gold + items on the player
 *   /debug spell 2                     → consume a level-2 slot
 *   /debug rest short | rest long      → trigger a rest
 *   /debug combat                      → start a small combat with bandits
 *   /debug condition poisoned          → apply condition
 *   /debug companion                   → ask the first companion to speak
 */

import { createSupabaseServiceClient } from '../db/server';
import type { CharacterRow } from '../db/types';
import { parseDiceExpression, rollD20, rollExpression } from '../rules/dice';
import type { ConditionType } from '../rules/types';
import { getActiveCombatState, getActiveEncounter, startEncounter } from '../server/combat-loop';
import { respondAsCompanion } from './companion-agent';
import type { DiceRollRecord, GmEvent } from './gm-agent';
import { executeRoll, renderCombatBlock } from './gm-agent';

export function isDebugCommand(message: string): boolean {
  return message.trim().startsWith('/debug');
}

async function loadParty(sessionId: string): Promise<{
  campaignId: string | null;
  player: CharacterRow | null;
  companions: CharacterRow[];
}> {
  const supabase = createSupabaseServiceClient();
  const { data: session } = await supabase
    .from('sessions')
    .select('campaign_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return { campaignId: null, player: null, companions: [] };
  const { data: characters } = await supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', session.campaign_id)
    .order('created_at', { ascending: true });
  const all = (characters ?? []) as CharacterRow[];
  return {
    campaignId: session.campaign_id,
    player: all.find((c) => !c.is_ai) ?? null,
    companions: all.filter((c) => c.is_ai),
  };
}

export async function* runDebugCommand(
  sessionId: string,
  rawMessage: string,
): AsyncGenerator<GmEvent> {
  const parts = rawMessage
    .trim()
    .replace(/^\/debug\s*/, '')
    .split(/\s+/)
    .filter(Boolean);
  const cmd = parts[0]?.toLowerCase() ?? 'help';
  const arg1 = parts[1];
  const supabase = createSupabaseServiceClient();

  const say = (text: string): GmEvent => ({ type: 'text_delta', delta: text });

  switch (cmd) {
    case 'help':
    case '':
      yield say(
        [
          '— DEBUG —',
          '/debug dice | crit | fumble — jets',
          '/debug damage <n> | heal <n> — PV joueur',
          '/debug loot — pièces + objets',
          '/debug spell <niveau> — consomme un emplacement',
          '/debug rest short | rest long — repos',
          '/debug combat — ouvre un combat',
          '/debug condition <type> — applique une condition',
          '/debug companion — fait parler un compagnon',
        ].join('\n'),
      );
      yield { type: 'done' };
      return;

    case 'dice':
    case 'crit':
    case 'fumble': {
      const forced = cmd === 'crit' ? 20 : cmd === 'fumble' ? 1 : null;
      const d20 =
        forced !== null
          ? { roll: forced, rawRolls: [forced], modifier: 5, total: forced + 5 }
          : rollD20(5, 'normal');
      const record: DiceRollRecord = {
        kind: 'check',
        label: 'Debug — test',
        expression: '1d20+5',
        dice: d20.rawRolls,
        modifier: 5,
        total: d20.total,
        outcome:
          d20.roll === 20
            ? 'crit'
            : d20.roll === 1
              ? 'fumble'
              : d20.total >= 15
                ? 'success'
                : 'failure',
        advantage: 'normal',
        dc: 15,
      };
      yield say(`Jet de test (${cmd}). `);
      yield { type: 'dice_request', rollId: 'debug', roll: record, label: record.label };
      yield { type: 'done' };
      return;
    }

    case 'damage':
    case 'heal': {
      const { player } = await loadParty(sessionId);
      if (!player) {
        yield say('Pas de PJ dans cette campagne.');
        yield { type: 'done' };
        return;
      }
      const amount = Math.max(1, Number(arg1) || 5);
      const delta = cmd === 'damage' ? amount : -amount;
      const { data: c } = await supabase
        .from('characters')
        .select('current_hp, max_hp')
        .eq('id', player.id)
        .single();
      if (!c) return;
      const next =
        delta >= 0 ? Math.max(0, c.current_hp - delta) : Math.min(c.max_hp, c.current_hp - delta);
      await supabase.from('characters').update({ current_hp: next }).eq('id', player.id);
      yield say(
        `${cmd === 'damage' ? 'Dégâts' : 'Soins'} ${amount} sur ${player.name}. PV ${next}/${c.max_hp}.`,
      );
      yield { type: 'party_update' };
      yield { type: 'done' };
      return;
    }

    case 'loot': {
      const { player } = await loadParty(sessionId);
      if (!player) {
        yield say('Pas de PJ.');
        yield { type: 'done' };
        return;
      }
      // Currency
      const { data: cur } = await supabase
        .from('characters')
        .select('currency')
        .eq('id', player.id)
        .single();
      const currency = (cur?.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }) as {
        cp: number;
        sp: number;
        ep: number;
        gp: number;
        pp: number;
      };
      const nextCurrency = { ...currency, gp: currency.gp + 25, sp: currency.sp + 12 };
      await supabase.from('characters').update({ currency: nextCurrency }).eq('id', player.id);

      // Items
      const { data: inv } = await supabase
        .from('characters')
        .select('inventory')
        .eq('id', player.id)
        .single();
      const items = (inv?.inventory ?? []) as Array<{
        id: string;
        name: string;
        qty: number;
        type?: string;
        description?: string;
      }>;
      const nextItems = [
        ...items,
        {
          id: `i-${Date.now()}-1`,
          name: 'Potion de soin',
          qty: 2,
          type: 'consumable' as const,
          description: '2d4+2 PV.',
        },
        {
          id: `i-${Date.now()}-2`,
          name: 'Lettre scellée',
          qty: 1,
          type: 'misc' as const,
          description: 'Sigle inconnu, cire noire.',
        },
      ];
      await supabase.from('characters').update({ inventory: nextItems }).eq('id', player.id);

      yield say('Butin ajouté : 25 po, 12 pa, 2 × Potion de soin, 1 × Lettre scellée.');
      yield { type: 'party_update' };
      yield { type: 'done' };
      return;
    }

    case 'spell': {
      const { player } = await loadParty(sessionId);
      if (!player) {
        yield say('Pas de PJ.');
        yield { type: 'done' };
        return;
      }
      const level = Math.max(1, Math.min(9, Number(arg1) || 1));
      const { data: c } = await supabase
        .from('characters')
        .select('spell_slots')
        .eq('id', player.id)
        .single();
      const slots = (c?.spell_slots ?? {}) as Record<string, { max: number; used: number }>;
      const slot = slots[String(level)];
      if (!slot || slot.used >= slot.max) {
        yield say(`Pas d'emplacement niv. ${level} disponible.`);
        yield { type: 'done' };
        return;
      }
      const nextSlots = { ...slots, [level]: { ...slot, used: slot.used + 1 } };
      await supabase.from('characters').update({ spell_slots: nextSlots }).eq('id', player.id);
      yield say(
        `Emplacement niv. ${level} consommé (${slot.max - slot.used - 1}/${slot.max} restants).`,
      );
      yield { type: 'party_update' };
      yield { type: 'done' };
      return;
    }

    case 'rest': {
      const { player } = await loadParty(sessionId);
      if (!player) {
        yield say('Pas de PJ.');
        yield { type: 'done' };
        return;
      }
      const kind = arg1 === 'long' ? 'long' : 'short';
      if (kind === 'long') {
        const { data: c } = await supabase
          .from('characters')
          .select('max_hp, spell_slots, exhaustion')
          .eq('id', player.id)
          .single();
        if (!c) return;
        const slots = (c.spell_slots ?? {}) as Record<string, { max: number; used: number }>;
        const restored: Record<string, { max: number; used: number }> = {};
        for (const [lvl, s] of Object.entries(slots)) restored[lvl] = { max: s.max, used: 0 };
        await supabase
          .from('characters')
          .update({
            current_hp: c.max_hp,
            spell_slots: restored,
            exhaustion: Math.max(0, c.exhaustion - 1),
          })
          .eq('id', player.id);
        yield say('Repos long : PV max, tous les emplacements restaurés.');
      } else {
        const { data: c } = await supabase
          .from('characters')
          .select('current_hp, max_hp, con')
          .eq('id', player.id)
          .single();
        if (!c) return;
        const r = rollExpression('1d8');
        const conMod = Math.floor((c.con - 10) / 2);
        const gained = Math.max(1, r.total + conMod);
        const next = Math.min(c.max_hp, c.current_hp + gained);
        await supabase.from('characters').update({ current_hp: next }).eq('id', player.id);
        yield say(`Repos court : 1d8 (${r.dice[0]}) + ${conMod} = +${gained} PV.`);
      }
      yield { type: 'party_update' };
      yield { type: 'done' };
      return;
    }

    case 'combat': {
      const { campaignId, player, companions } = await loadParty(sessionId);
      if (!campaignId) {
        yield say('Session invalide.');
        yield { type: 'done' };
        return;
      }
      const enc = await getActiveEncounter(sessionId);
      if (enc) {
        yield say('Un combat est déjà en cours.');
        yield { type: 'done' };
        return;
      }
      const characters = [player, ...companions].filter((c): c is CharacterRow => !!c);
      const state = await startEncounter({
        sessionId,
        npcs: [
          { name: 'Bandit arbalétrier', ac: 12, hp: 11, dexMod: 2 },
          { name: 'Bandit hache', ac: 12, hp: 11, dexMod: 1 },
        ],
        characters,
      });
      yield say('Combat lancé : 1 arbalétrier + 1 hachereau.');
      yield { type: 'combat_started', combatId: state.combatId };
      yield { type: 'combat_state', state };
      yield { type: 'done' };
      return;
    }

    case 'condition': {
      const { player } = await loadParty(sessionId);
      if (!player) {
        yield say('Pas de PJ.');
        yield { type: 'done' };
        return;
      }
      const type = (arg1 ?? 'poisoned') as ConditionType;
      const { data: c } = await supabase
        .from('characters')
        .select('conditions')
        .eq('id', player.id)
        .single();
      const conditions = (c?.conditions ?? []) as Array<{
        type: string;
        durationRounds?: number;
      }>;
      const next = conditions.some((x) => x.type === type)
        ? conditions.filter((x) => x.type !== type)
        : [...conditions, { type, durationRounds: 3 }];
      await supabase.from('characters').update({ conditions: next }).eq('id', player.id);
      yield say(
        `Condition ${type} ${conditions.some((x) => x.type === type) ? 'retirée' : 'appliquée'}.`,
      );
      yield { type: 'party_update' };
      const debugState = await getActiveCombatState(sessionId).catch(() => null);
      if (debugState) yield { type: 'combat_state', state: debugState };
      yield { type: 'done' };
      return;
    }

    case 'companion': {
      const { companions } = await loadParty(sessionId);
      const comp = companions[0];
      if (!comp) {
        yield say('Aucun compagnon.');
        yield { type: 'done' };
        return;
      }
      const { data: history } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      const compState = await getActiveCombatState(sessionId).catch(() => null);
      const turn = await respondAsCompanion({
        sessionId,
        character: comp,
        history: history ?? [],
        combatState: compState,
        combatBlock: renderCombatBlock(compState),
        executeRoll,
      });
      for (const ev of turn.events) yield ev;
      if (turn.text) {
        yield {
          type: 'companion',
          characterId: comp.id,
          characterName: comp.name,
          content: turn.text,
        };
      }
      yield { type: 'done' };
      return;
    }

    default:
      yield say(`Commande inconnue : ${cmd}. Tape /debug help.`);
      yield { type: 'done' };
      return;
  }
}

// Keep parseDiceExpression imported so the debug parser stays exposed for
// future commands; rest of the helpers were removed with the combat refactor.
export const _ref = {
  parseDiceExpression,
};
