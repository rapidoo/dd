'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '../db/server';
import type { CharacterRow } from '../db/types';
import { applyHealing as applyHeal, applyDamage as applyHpDamage } from '../rules/hitPoints';
import { takeLongRest, takeShortRest } from '../rules/rest';
import { availableSlot, consumeSpellSlot, restoreAllSpellSlots } from '../rules/spellcasting';
import type { HitDie, SpellSlots } from '../rules/types';
import { requireUser } from './auth';
import type { ServerResult } from './campaigns';

async function loadCharacter(id: string): Promise<CharacterRow | null> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('characters').select('*').eq('id', id).maybeSingle();
  return data;
}

const castSchema = z.object({
  characterId: z.string().uuid(),
  level: z.coerce.number().int().min(1).max(9),
});

export async function castSpell(input: {
  characterId: string;
  level: number;
}): Promise<ServerResult<CharacterRow>> {
  const parsed = castSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Requête invalide' };
  const character = await loadCharacter(parsed.data.characterId);
  if (!character) return { ok: false, error: 'Personnage introuvable' };
  const slots = character.spell_slots as SpellSlots;
  if (!availableSlot(slots, parsed.data.level as 1)) {
    return { ok: false, error: "Plus d'emplacement disponible à ce niveau" };
  }
  const next = consumeSpellSlot(slots, parsed.data.level as 1);
  if (!next) return { ok: false, error: 'Consommation impossible' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('characters')
    .update({ spell_slots: next })
    .eq('id', parsed.data.characterId)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Échec' };
  revalidatePath(`/campaigns/${character.campaign_id}`);
  return { ok: true, data };
}

const hpSchema = z.object({
  characterId: z.string().uuid(),
  delta: z.coerce.number().int(),
});

export async function adjustHP(input: {
  characterId: string;
  delta: number;
}): Promise<ServerResult<CharacterRow>> {
  const parsed = hpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Requête invalide' };
  const character = await loadCharacter(parsed.data.characterId);
  if (!character) return { ok: false, error: 'Personnage introuvable' };
  const hp = { current: character.current_hp, max: character.max_hp, temp: character.temp_hp };
  const updated =
    parsed.data.delta >= 0
      ? applyHeal(hp, parsed.data.delta)
      : applyHpDamage(hp, -parsed.data.delta).state;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('characters')
    .update({ current_hp: updated.current, temp_hp: updated.temp })
    .eq('id', parsed.data.characterId)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Échec' };
  revalidatePath(`/campaigns/${character.campaign_id}`);
  return { ok: true, data };
}

const restSchema = z.object({
  characterId: z.string().uuid(),
  kind: z.enum(['short', 'long']),
  diceToSpend: z.coerce.number().int().min(0).max(20).optional(),
});

export async function takeRest(input: {
  characterId: string;
  kind: 'short' | 'long';
  diceToSpend?: number;
}): Promise<ServerResult<CharacterRow>> {
  const parsed = restSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Requête invalide' };
  const character = await loadCharacter(parsed.data.characterId);
  if (!character) return { ok: false, error: 'Personnage introuvable' };

  // Hit dice tracked on the character as ( level - used ). For MVP we assume no
  // hit dice spent outside of this action — available = level.
  const hitDie: HitDie =
    ((character.spell_slots as Record<string, unknown>)?._hit_die as HitDie) ?? 'd8';
  const conMod = Math.floor((character.con - 10) / 2);

  if (parsed.data.kind === 'short') {
    const dice = Math.min(parsed.data.diceToSpend ?? character.level, character.level);
    const result = takeShortRest({
      hitDice: { die: hitDie, max: character.level, available: character.level },
      diceToSpend: dice,
      conMod,
      currentHP: character.current_hp,
      maxHP: character.max_hp,
    });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('characters')
      .update({ current_hp: result.newCurrentHP })
      .eq('id', parsed.data.characterId)
      .select('*')
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? 'Échec' };
    revalidatePath(`/campaigns/${character.campaign_id}`);
    return { ok: true, data };
  }

  // Long rest
  const longResult = takeLongRest({
    hitDice: { die: hitDie, max: character.level, available: character.level },
    maxHP: character.max_hp,
    spellSlots: character.spell_slots as SpellSlots,
    exhaustionLevel: character.exhaustion,
  });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('characters')
    .update({
      current_hp: longResult.newCurrentHP,
      spell_slots: restoreAllSpellSlots(character.spell_slots as SpellSlots),
      exhaustion: longResult.exhaustionLevel,
    })
    .eq('id', parsed.data.characterId)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Échec' };
  revalidatePath(`/campaigns/${character.campaign_id}`);
  return { ok: true, data };
}
