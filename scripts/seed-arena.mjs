#!/usr/bin/env node
/**
 * Seed d'une campagne "Arène du Cœur Noir" pour tester combat + sorts.
 *
 * Utilisation :
 *   node scripts/seed-arena.mjs --email=<ton@email.com>
 *
 * Crée / met à jour (idempotent par owner) :
 *   - 1 campagne homebrew avec un world_summary qui pilote le MJ (5 vagues
 *     d'adversaires, focus sur les mécaniques : saves, concentration, aires,
 *     résistances, death saves).
 *   - 1 PJ Clerc niv. 3 (sorts niv. 1 + 2, CA 18, masse + bouclier).
 *   - 1 compagnon Guerrier niv. 3 (tank).
 *
 * Après la seed, connecte-toi et lance la session. Le MJ déclenche le
 * premier combat dès le premier message.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const emailArg = process.argv.find((a) => a.startsWith('--email='))?.slice(8);
if (!emailArg) {
  console.error('❌ Usage : node scripts/seed-arena.mjs --email=<ton@email.com>');
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function findUserByEmail(email) {
  // paginate until match
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page++;
  }
  return null;
}

const WORLD_SUMMARY = `Arène souterraine du Cœur Noir — pierre basaltique, sable chauffé par les braises, gradins vides où un témoin invisible observe. Lieu d'entraînement : on y apprend à saigner avant de mourir pour de vrai.

RÈGLE DU MJ (bac à sable mécanique) :
- Au premier message du joueur, déclenche la première vague. Annonce l'adversaire, puis appelle start_combat avec ses stats.
- Entre chaque vague, court dialogue + proposition de repos court (trigger_rest) avant la suivante.
- Pas d'intrigue, pas de PNJ bavards. Le focus est la mécanique : test des saves, concentration, conditions, death saves, magie.

VAGUES (enchaîner dans l'ordre) :
1. Gobelin éclaireur — CA 15, PV 7, DEX +2. Cimeterre 1d6 tranchant, arc court 1d6 perforant. Aperitif, 1 round suffit.
2. Duo bandits — chacun CA 12, PV 11, DEX +1. L'un à la rapière (1d8 perforant), l'autre à l'arc (1d6 perforant, 50 m). Test d'économie d'actions.
3. Ogre affamé — CA 11, PV 59, FOR +4. Gourdin 2d8 contondant (crit possible = 4d8). Force le joueur à soigner/concentrer.
4. Cultiste mage — CA 12, PV 22, DEX +1. Trois Fléchettes magiques (1d4+1 force auto). Lance "Peur" : save CHA DD 13 sinon effrayé 1 round. Résistant aux dégâts nécrotiques. Test de save + concentration du joueur.
5. Ours-garrou (boss) — CA 12, PV 42, FOR +4. Morsure 2d8+4 perforant + griffes 2d6+4 tranchant. Résistant aux dégâts non magiques non argentés. Test de damage types + boss.

Après la vague 5, laisse le joueur décider : continuer avec une vague-surprise, ou sortir de l'arène (repos long + fiche post-mortem). La victoire comme la mort sont traitées avec gravité mais sans drame.

Important : lance les dés pour les ennemis via request_roll — ne jamais décrire "tu perds 12 PV" dans le texte, passe par apply_damage. Propose des jets de compétence ouverts (Athlétisme pour pousser, Religion pour reconnaître un symbole) pour varier des simples attaques.`;

async function main() {
  const user = await findUserByEmail(emailArg);
  if (!user) {
    console.error(`❌ Utilisateur introuvable : ${emailArg}`);
    process.exit(1);
  }
  console.log(`✅ User ${user.email} (${user.id})`);

  // Campaign (upsert by owner + name)
  const { data: existingCampaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('owner_id', user.id)
    .eq('name', 'Arène du Cœur Noir')
    .maybeSingle();

  let campaignId;
  if (existingCampaign) {
    campaignId = existingCampaign.id;
    await supabase
      .from('campaigns')
      .update({
        world_summary: WORLD_SUMMARY,
        setting_mode: 'homebrew',
        setting_pitch:
          "Bac à sable mécanique — 5 vagues d'adversaires pour tester combat et sorts.",
      })
      .eq('id', campaignId);
    console.log(`♻️  Campagne existante mise à jour : ${campaignId}`);
  } else {
    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        owner_id: user.id,
        name: 'Arène du Cœur Noir',
        setting_mode: 'homebrew',
        setting_pitch:
          "Bac à sable mécanique — 5 vagues d'adversaires pour tester combat et sorts.",
        world_summary: WORLD_SUMMARY,
        status: 'active',
      })
      .select('id')
      .single();
    if (error) throw error;
    campaignId = data.id;
    console.log(`✨ Campagne créée : ${campaignId}`);
  }

  // Player PJ — Clerc niv. 3
  const player = {
    campaign_id: campaignId,
    owner_id: user.id,
    is_ai: false,
    name: "Thaela Bougie-d'Aube",
    species: 'human',
    class: 'cleric',
    subclass: 'Domaine de la Vie',
    background: 'Acolyte',
    alignment: 'Loyal Bon',
    level: 3,
    str: 14,
    dex: 10,
    con: 14,
    int_score: 10,
    wis: 16,
    cha: 12,
    max_hp: 24,
    current_hp: 24,
    temp_hp: 0,
    ac: 18,
    speed: 9,
    proficiencies: {
      armor: ['light', 'medium', 'heavy', 'shield'],
      weapons: ['simple'],
      saves: ['wis', 'cha'],
      skills: ['religion', 'medicine', 'insight', 'persuasion'],
    },
    features: [
      {
        name: 'Canalisation divine : tourner les morts-vivants',
        usesPerRest: 1,
        restType: 'short',
      },
      { name: 'Disciple de la Vie', description: '+2+niv quand soin direct' },
    ],
    inventory: [
      {
        id: 'i-mace',
        name: "Masse d'armes",
        qty: 1,
        type: 'weapon',
        weapon: { damageDice: '1d6', damageType: 'contondant', ability: 'str' },
      },
      { id: 'i-shield', name: 'Bouclier', qty: 1, type: 'armor' },
      { id: 'i-armor', name: 'Cotte de mailles', qty: 1, type: 'armor' },
      {
        id: 'i-potion-1',
        name: 'Potion de soin',
        qty: 2,
        type: 'consumable',
        description: '2d4+2 PV.',
      },
      {
        id: 'i-holy',
        name: 'Symbole sacré',
        qty: 1,
        type: 'misc',
        description: 'Focaliseur divin.',
      },
    ],
    spells_known: [
      { name: 'Flamme sacrée', level: 0, school: 'evocation' },
      { name: 'Lumière', level: 0, school: 'evocation' },
      { name: 'Thaumaturgie', level: 0, school: 'transmutation' },
      { name: 'Soins', level: 1, school: 'evocation', prepared: true },
      { name: 'Trait guidé', level: 1, school: 'evocation', prepared: true },
      { name: 'Bénédiction', level: 1, school: 'enchantment', prepared: true },
      { name: 'Mot de guérison', level: 1, school: 'evocation', prepared: true },
      { name: 'Sanctuaire', level: 1, school: 'abjuration', prepared: true },
      { name: 'Arme spirituelle', level: 2, school: 'evocation', prepared: true },
      { name: 'Immobilisation de personne', level: 2, school: 'enchantment', prepared: true },
      { name: 'Préservation des vivants', level: 2, school: 'necromancy', prepared: true },
    ],
    spell_slots: {
      1: { max: 4, used: 0 },
      2: { max: 2, used: 0 },
    },
    conditions: [],
    death_saves: { successes: 0, failures: 0, stable: false, dead: false },
    concentration: { active: false, spellName: null, level: null },
    exhaustion: 0,
    currency: { cp: 0, sp: 0, ep: 0, gp: 15, pp: 0 },
    persona: { notes: 'Jeune clerc de Pelor, patiente, tête froide. Connaît les hymnes par cœur.' },
  };

  // Companion — Fighter niv. 3 (tank)
  const companion = {
    campaign_id: campaignId,
    owner_id: user.id,
    is_ai: true,
    name: "Bran l'Épée-Sûre",
    species: 'human',
    class: 'fighter',
    subclass: 'Champion',
    background: 'Soldat',
    alignment: 'Neutre Bon',
    level: 3,
    str: 16,
    dex: 14,
    con: 14,
    int_score: 10,
    wis: 12,
    cha: 10,
    max_hp: 28,
    current_hp: 28,
    temp_hp: 0,
    ac: 18,
    speed: 9,
    proficiencies: {
      armor: ['light', 'medium', 'heavy', 'shield'],
      weapons: ['simple', 'martial'],
      saves: ['str', 'con'],
      skills: ['athletics', 'intimidation', 'perception', 'survival'],
    },
    features: [
      { name: 'Style de combat : Défense', description: '+1 CA en armure' },
      { name: 'Second souffle', usesPerRest: 1, restType: 'short' },
      { name: 'Fougue', usesPerRest: 1, restType: 'short' },
      { name: 'Critique amélioré', description: 'Crit sur 19-20' },
    ],
    inventory: [
      {
        id: 'i-long-sword',
        name: 'Épée longue',
        qty: 1,
        type: 'weapon',
        weapon: { damageDice: '1d8', damageType: 'tranchant', ability: 'str' },
      },
      { id: 'i-c-shield', name: 'Bouclier', qty: 1, type: 'armor' },
      { id: 'i-chain', name: 'Cotte de mailles', qty: 1, type: 'armor' },
      {
        id: 'i-bow',
        name: 'Arc court',
        qty: 1,
        type: 'weapon',
        weapon: { damageDice: '1d6', damageType: 'perforant', ranged: true },
      },
    ],
    spells_known: [],
    spell_slots: {},
    conditions: [],
    death_saves: { successes: 0, failures: 0, stable: false, dead: false },
    concentration: { active: false, spellName: null, level: null },
    exhaustion: 0,
    currency: { cp: 0, sp: 0, ep: 0, gp: 5, pp: 0 },
    persona: {
      notes:
        'Vétéran taciturne, cinquantaine, a connu trois guerres. Parle peu mais protège systématiquement les plus faibles.',
    },
  };

  // Upsert characters (by campaign + name)
  for (const c of [player, companion]) {
    const { data: existing } = await supabase
      .from('characters')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('name', c.name)
      .maybeSingle();
    if (existing) {
      await supabase.from('characters').update(c).eq('id', existing.id);
      console.log(`♻️  ${c.name} mis à jour`);
    } else {
      const { error } = await supabase.from('characters').insert(c);
      if (error) throw error;
      console.log(`✨ ${c.name} créé`);
    }
  }

  const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  console.log(`\n🎭 Prêt à jouer : ${siteUrl}/campaigns/${campaignId}/play`);
  console.log('   Premier message conseillé : "J\'entre dans l\'arène, prête."\n');
}

main().catch((err) => {
  console.error('❌ Seed arena failed:', err.message ?? err);
  process.exit(1);
});
