'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '../db/server';
import type { CharacterRow, Universe } from '../db/types';
import { deriveCharacter } from '../rules/derivations';
import { getClassesForUniverse, getSpeciesForUniverse } from '../rules/srd';
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

const schema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  // Universe-scoped validation happens after we read the campaign's universe.
  speciesId: z.string().trim().min(1).max(40),
  classId: z.string().trim().min(1).max(40),
  persona: z.string().trim().min(1).max(600),
  // Optional: when a template is selected on the client, the form posts the
  // template's level + abilities so the companion gets the same stat block as
  // a templated PC. Without these, sane defaults below are used.
  level: z.coerce.number().int().min(1).max(20).optional(),
  abilities: z
    .object({
      str: z.coerce.number().int().min(1).max(30),
      dex: z.coerce.number().int().min(1).max(30),
      con: z.coerce.number().int().min(1).max(30),
      int: z.coerce.number().int().min(1).max(30),
      wis: z.coerce.number().int().min(1).max(30),
      cha: z.coerce.number().int().min(1).max(30),
    })
    .optional(),
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

export async function createCompanion(
  _prev: ServerResult<CharacterRow> | null,
  formData: FormData,
): Promise<ServerResult<CharacterRow>> {
  // Abilities & level are optional — only present when a template is applied.
  const rawStr = formData.get('str');
  const hasAbilities =
    rawStr !== null && formData.get('dex') !== null && formData.get('con') !== null;
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
  const parsed = schema.safeParse({
    campaignId: formData.get('campaignId'),
    name: formData.get('name'),
    speciesId: formData.get('speciesId'),
    classId: formData.get('classId'),
    persona: formData.get('persona'),
    level: formData.get('level') ?? undefined,
    abilities: hasAbilities
      ? {
          str: formData.get('str'),
          dex: formData.get('dex'),
          con: formData.get('con'),
          int: formData.get('int'),
          wis: formData.get('wis'),
          cha: formData.get('cha'),
        }
      : undefined,
    inventory,
    spells,
    currency,
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

  // Read the campaign's universe to validate species/class against the right
  // dictionary. Witcher / Naheulbeuk classes don't live in the D&D dict.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, universe')
    .eq('id', parsed.data.campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, error: 'Campagne introuvable' };
  const universe: Universe = (campaign.universe as Universe | null) ?? 'dnd5e';

  if (!(parsed.data.speciesId in getSpeciesForUniverse(universe))) {
    return { ok: false, error: `Espèce inconnue pour cet univers : ${parsed.data.speciesId}` };
  }
  if (!(parsed.data.classId in getClassesForUniverse(universe))) {
    return { ok: false, error: `Classe inconnue pour cet univers : ${parsed.data.classId}` };
  }

  // Reasonable default companion stats for a level-5 ally.
  const abilities = parsed.data.abilities ?? {
    str: 13,
    dex: 13,
    con: 14,
    int: 12,
    wis: 12,
    cha: 11,
  };
  const level = parsed.data.level ?? 5;
  const derived = deriveCharacter({
    universe,
    classId: parsed.data.classId,
    speciesId: parsed.data.speciesId,
    level,
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
      level,
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
      spells_known: parsed.data.spells,
      inventory: parsed.data.inventory.map(normalizeKitItem),
      currency: parsed.data.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      persona: { notes: parsed.data.persona },
    })
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Création impossible' };
  revalidatePath(`/campaigns/${parsed.data.campaignId}/team`);
  redirect(`/campaigns/${parsed.data.campaignId}/team`);
}
