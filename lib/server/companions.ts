'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '../db/server';
import type { CharacterRow } from '../db/types';
import { deriveCharacter } from '../rules/derivations';
import { CLASSES, SPECIES } from '../rules/srd';
import { requireUser } from './auth';
import type { ServerResult } from './campaigns';

const schema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  speciesId: z.string().refine((v) => v in SPECIES),
  classId: z.string().refine((v) => v in CLASSES),
  persona: z.string().trim().min(1).max(600),
});

export async function createCompanion(
  _prev: ServerResult<CharacterRow> | null,
  formData: FormData,
): Promise<ServerResult<CharacterRow>> {
  const parsed = schema.safeParse({
    campaignId: formData.get('campaignId'),
    name: formData.get('name'),
    speciesId: formData.get('speciesId'),
    classId: formData.get('classId'),
    persona: formData.get('persona'),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Formulaire invalide',
      fieldErrors: z.treeifyError(parsed.error).properties as Record<string, string[]>,
    };
  }
  await requireUser();
  const supabase = await createSupabaseServerClient();

  // Reasonable default companion stats for a level-5 ally.
  const abilities = { str: 13, dex: 13, con: 14, int: 12, wis: 12, cha: 11 };
  const derived = deriveCharacter({
    classId: parsed.data.classId,
    speciesId: parsed.data.speciesId,
    level: 5,
    abilityScores: abilities,
    skillProficiencies: [],
  });
  const { data, error } = await supabase
    .from('characters')
    .insert({
      campaign_id: parsed.data.campaignId,
      owner_id: null,
      is_ai: true,
      name: parsed.data.name,
      species: parsed.data.speciesId,
      class: parsed.data.classId,
      level: 5,
      str: derived.abilityScores.str,
      dex: derived.abilityScores.dex,
      con: derived.abilityScores.con,
      int_score: derived.abilityScores.int,
      wis: derived.abilityScores.wis,
      cha: derived.abilityScores.cha,
      max_hp: derived.maxHP,
      current_hp: derived.maxHP,
      ac: derived.ac,
      speed: Math.round(derived.speed),
      proficiencies: {
        savingThrows: derived.savingThrowProficiencies,
        skills: derived.skillProficiencies,
      },
      spell_slots: derived.spellSlots,
      persona: { notes: parsed.data.persona },
    })
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Création impossible' };
  revalidatePath(`/campaigns/${parsed.data.campaignId}/team`);
  redirect(`/campaigns/${parsed.data.campaignId}/team`);
}
