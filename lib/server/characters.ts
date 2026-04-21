'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '../db/server';
import type { CharacterRow } from '../db/types';
import { deriveCharacter } from '../rules/derivations';
import { CLASSES, SPECIES } from '../rules/srd';
import type { AbilityScores } from '../rules/types';
import { requireUser } from './auth';
import type { ServerResult } from './campaigns';

const createSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  speciesId: z.string().refine((v) => v in SPECIES, 'Espèce inconnue'),
  classId: z.string().refine((v) => v in CLASSES, 'Classe inconnue'),
  level: z.coerce.number().int().min(1).max(20).default(1),
  background: z.string().trim().max(80).optional().nullable(),
  alignment: z.string().trim().max(40).optional().nullable(),
  abilities: z.object({
    str: z.coerce.number().int().min(1).max(30),
    dex: z.coerce.number().int().min(1).max(30),
    con: z.coerce.number().int().min(1).max(30),
    int: z.coerce.number().int().min(1).max(30),
    wis: z.coerce.number().int().min(1).max(30),
    cha: z.coerce.number().int().min(1).max(30),
  }),
  skillProficiencies: z.array(z.string()).max(8),
  personality: z.string().trim().max(1000).optional().nullable(),
});

function parseFormEntries(formData: FormData) {
  const abilities: AbilityScores = {
    str: Number(formData.get('str') ?? 10),
    dex: Number(formData.get('dex') ?? 10),
    con: Number(formData.get('con') ?? 10),
    int: Number(formData.get('int') ?? 10),
    wis: Number(formData.get('wis') ?? 10),
    cha: Number(formData.get('cha') ?? 10),
  };
  return {
    campaignId: formData.get('campaignId'),
    name: formData.get('name'),
    speciesId: formData.get('speciesId'),
    classId: formData.get('classId'),
    level: formData.get('level'),
    background: formData.get('background') || null,
    alignment: formData.get('alignment') || null,
    abilities,
    skillProficiencies: formData.getAll('skillProficiencies').map(String),
    personality: formData.get('personality') || null,
  };
}

export async function createCharacter(
  _prev: ServerResult<CharacterRow> | null,
  formData: FormData,
): Promise<ServerResult<CharacterRow>> {
  const parsed = createSchema.safeParse(parseFormEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Formulaire invalide',
      fieldErrors: z.treeifyError(parsed.error).properties as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Verify campaign ownership via RLS-respecting query.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', input.campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, error: 'Campagne introuvable' };

  const derived = deriveCharacter({
    classId: input.classId,
    speciesId: input.speciesId,
    level: input.level,
    abilityScores: input.abilities,
    skillProficiencies: input.skillProficiencies,
  });

  const { data, error } = await supabase
    .from('characters')
    .insert({
      campaign_id: input.campaignId,
      owner_id: user.id,
      is_ai: false,
      name: input.name,
      species: input.speciesId,
      class: input.classId,
      background: input.background,
      alignment: input.alignment,
      level: input.level,
      str: derived.abilityScores.str,
      dex: derived.abilityScores.dex,
      con: derived.abilityScores.con,
      int_score: derived.abilityScores.int,
      wis: derived.abilityScores.wis,
      cha: derived.abilityScores.cha,
      max_hp: derived.maxHP,
      current_hp: derived.maxHP,
      temp_hp: 0,
      ac: derived.ac,
      speed: Math.round(derived.speed),
      proficiencies: {
        savingThrows: derived.savingThrowProficiencies,
        skills: derived.skillProficiencies,
      },
      spell_slots: derived.spellSlots,
      persona: input.personality ? { notes: input.personality } : null,
    })
    .select('*')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Création impossible' };
  }
  revalidatePath(`/campaigns/${input.campaignId}`);
  redirect(`/campaigns/${input.campaignId}`);
}
