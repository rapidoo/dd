'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '../db/server';
import type { CharacterRow, Universe } from '../db/types';
import { deriveCharacter } from '../rules/derivations';
import { getClassesForUniverse, getSpeciesForUniverse } from '../rules/srd';
import type { AbilityScores } from '../rules/types';
import { requireUser } from './auth';
import type { ServerResult } from './campaigns';
import { normalizeKitItem } from './inventory-normalize';

const itemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(40),
  damage: z.string().trim().max(80).optional(),
  effect: z.string().trim().max(400).optional(),
  count: z.coerce.number().int().min(1).max(999).optional(),
  description: z.string().trim().max(400).optional(),
});

const spellSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  level: z.coerce.number().int().min(0).max(9),
  school: z.string().trim().max(60).optional(),
  description: z.string().trim().max(600),
});

const currencySchema = z.object({
  cp: z.coerce.number().int().min(0).default(0),
  sp: z.coerce.number().int().min(0).default(0),
  ep: z.coerce.number().int().min(0).default(0),
  gp: z.coerce.number().int().min(0).default(0),
  pp: z.coerce.number().int().min(0).default(0),
});

const createSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  // Species/class are validated against the campaign's universe AFTER ownership
  // check (see createCharacter). Universe-agnostic check would reject Witcher
  // sorceleurs and Naheulbeuk classes that aren't in the D&D dict.
  speciesId: z.string().trim().min(1).max(40),
  classId: z.string().trim().min(1).max(40),
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
  inventory: z.array(itemSchema).max(40).default([]),
  spells: z.array(spellSchema).max(40).default([]),
  currency: currencySchema.optional(),
});

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseFormEntries(formData: FormData) {
  const abilities: AbilityScores = {
    str: Number(formData.get('str') ?? 10),
    dex: Number(formData.get('dex') ?? 10),
    con: Number(formData.get('con') ?? 10),
    int: Number(formData.get('int') ?? 10),
    wis: Number(formData.get('wis') ?? 10),
    cha: Number(formData.get('cha') ?? 10),
  };
  const inventory = formData
    .getAll('inventory')
    .map((raw) => safeParseJson<unknown>(String(raw), null))
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
  const spells = formData
    .getAll('spells')
    .map((raw) => safeParseJson<unknown>(String(raw), null))
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
  const currencyRaw = formData.get('currency');
  const currency = currencyRaw ? safeParseJson(String(currencyRaw), undefined) : undefined;
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
    inventory,
    spells,
    currency,
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

  // Verify campaign ownership via RLS-respecting query, and read the universe
  // so we can validate species/class against the right dictionary.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, universe')
    .eq('id', input.campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, error: 'Campagne introuvable' };
  const universe: Universe = (campaign.universe as Universe | null) ?? 'dnd5e';

  if (!(input.speciesId in getSpeciesForUniverse(universe))) {
    return { ok: false, error: `Espèce inconnue pour cet univers : ${input.speciesId}` };
  }
  if (!(input.classId in getClassesForUniverse(universe))) {
    return { ok: false, error: `Classe inconnue pour cet univers : ${input.classId}` };
  }

  const derived = deriveCharacter({
    universe,
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
      spells_known: input.spells,
      inventory: input.inventory.map(normalizeKitItem),
      currency: input.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
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
