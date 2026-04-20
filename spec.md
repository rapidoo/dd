# spec.md — Plateforme de jeu de rôle D&D avec agents IA

> Spec produit/technique pour Claude Code. Lire `dnd5e_rules.md` pour les règles du jeu (formules, états, combat, magie). Ce document décrit **quoi construire** ; les règles décrivent **comment résoudre les mécaniques**.

---

## 0. Contexte et conventions pour Claude Code

**Mission** : construire une plateforme web où un humain joue à D&D 5e avec un MJ IA et, optionnellement, des compagnons PJ IA. Hébergement Vercel (front) + Supabase (back) + Neo4j AuraDB (mémoire de campagne).

**Conventions de travail** :
- Lire `dnd5e_rules.md` avant d'implémenter toute mécanique de jeu (jets, combat, magie, états).
- Toute logique de règles vit côté **serveur** (Supabase Edge Functions ou Next.js Server Actions). Le client n'est jamais source de vérité pour les jets ou les PV.
- Toute mutation passe par une fonction serveur unique avec validation stricte (Zod). Pas d'écriture directe depuis le client en dehors des messages de chat utilisateur.
- Les appels Anthropic se font côté serveur uniquement (la clé API ne fuit jamais au client).
- Logger chaque jet de dés (dés bruts + modificateurs + DD/CA + issue) dans `dice_rolls` pour audit/replay.
- Stack TypeScript bout en bout. Pas de `any`. Schémas partagés client/serveur via `/packages/shared` ou `/lib/types.ts`.
- Tests unitaires obligatoires sur les modules de règles (`/lib/rules/*`). Vitest.

**Avant chaque feature, Claude Code doit** :
1. Vérifier dans `dnd5e_rules.md` les règles concernées.
2. Proposer un plan court (modules, schéma DB, contrats API, tests).
3. Implémenter par petites PR mentales : DB → logique pure (testée) → endpoint serveur → UI.

---

## 1. Vision produit

Une plateforme web où un joueur peut :
- **Créer une campagne** (univers libre, module pré-écrit, ou monde généré par IA depuis un pitch).
- **Créer un PJ** assisté par l'IA (étape par étape ou à partir d'un concept).
- **Jouer en solo** avec un MJ IA + 0 à 5 compagnons PJ IA.
- **(v2)** Jouer en multi avec d'autres humains, l'IA complétant les places vides et tenant le rôle de MJ.

Différenciateurs :
- **MJ génératif** : crée à la volée PNJ, lieux, quêtes, descriptions d'ambiance, illustrations.
- **Mémoire de campagne en graphe** (Neo4j) : entités, relations, événements persistent et sont rappelés naturellement.
- **Théâtre de l'esprit assumé** : pas de grille tactique, focus narration et atmosphère, illustrations IA pour les scènes clés.

---

## 2. Stack technique

| Couche             | Choix                                                             |
|--------------------|-------------------------------------------------------------------|
| Front              | Next.js 15 (App Router), React 19, TypeScript                     |
| UI                 | Tailwind CSS v4, shadcn/ui, lucide-react                          |
| State client       | React Server Components + Zustand pour l'état de session locale   |
| Streaming LLM      | Server-Sent Events via Route Handlers Next.js                     |
| Hébergement front  | Vercel                                                            |
| Auth               | Supabase Auth — magic link email                                  |
| Base relationnelle | Supabase Postgres (RLS activé partout)                            |
| Realtime           | Supabase Realtime (channels par session) — archi prête, usage v2  |
| Stockage fichiers  | Supabase Storage (illustrations générées)                         |
| Logique serveur    | Next.js Server Actions + Supabase Edge Functions (Deno) pour LLM  |
| Mémoire graphe     | Neo4j AuraDB Free (driver `neo4j-driver` côté serveur)            |
| LLM MJ             | `claude-opus-4-7`                                                 |
| LLM PJ compagnons  | `claude-sonnet-4-5`                                               |
| LLM utilitaires    | `claude-haiku-4-5` (titrage, résumés, extraction d'entités)       |
| Image gen          | À confirmer — proposition : `black-forest-labs/flux-schnell` via Replicate ou fal.ai. Décision à prendre avant la phase image. |
| Validation         | Zod (schémas partagés client/serveur)                             |
| Tests              | Vitest (unit), Playwright (e2e sur parcours critiques)            |
| Lint/format        | Biome (lint + format en une commande)                             |
| CI                 | GitHub Actions : lint + typecheck + tests sur PR                  |

**Pourquoi Next.js App Router** : Server Actions = wrapper naturel pour Anthropic + Supabase server-side, streaming SSE natif via Route Handlers, déploiement Vercel zero-config, écosystème mature pour shadcn/Tailwind.

**Pourquoi Opus pour le MJ** : la qualité narrative et la cohérence sur les longs contextes (mémoire de campagne, plusieurs PJ à orchestrer, génération de contenu créatif) justifient le coût supérieur. Sonnet 4.5 pour les PJ = roleplay réactif + tool use fiable à coût raisonnable.

---

## 3. Architecture générale

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js client components, RSC, Zustand)           │
└──────────┬──────────────────────────────────────────────────┘
           │  Server Actions / Route Handlers (SSE)
┌──────────▼──────────────────────────────────────────────────┐
│  Next.js server (Vercel)                                     │
│  - Auth (Supabase SSR helpers)                               │
│  - Orchestration MJ ↔ PJ                                     │
│  - Tool use Anthropic (jets, mémoire, génération)            │
└──┬───────────────┬──────────────┬────────────┬──────────────┘
   │               │              │            │
┌──▼──────┐  ┌─────▼──────┐  ┌───▼────┐  ┌────▼──────────┐
│Supabase │  │Neo4j AuraDB│  │Anthropic│  │ Image gen API │
│Postgres │  │ (graphe)   │  │  API    │  │  (Replicate)  │
│+Realtime│  │            │  │         │  │               │
└─────────┘  └────────────┘  └─────────┘  └───────────────┘
```

**Séparation des responsabilités** :
- **Postgres** : source de vérité transactionnelle (campagnes, PJ, sessions, messages, jets, état de combat).
- **Neo4j** : mémoire narrative interrogeable (entités, relations, événements).
- **Anthropic API** : génération de texte (MJ, PJ, utilitaires).
- **Image gen** : illustrations d'ambiance, portraits PNJ, scènes clés.

---

## 4. Schéma de données

### 4.1 Postgres (Supabase)

Convention : snake_case, UUID v7 partout (`gen_random_uuid()` ou helper). Toutes les tables ont `created_at`, `updated_at`. RLS activée systématiquement.

```sql
-- Utilisateurs (géré par Supabase Auth dans auth.users)
-- On ne crée pas de table users, on référence auth.users(id)

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  setting_mode text not null check (setting_mode in ('homebrew','module','generated')),
  setting_pitch text,                  -- prompt utilisateur si setting_mode='generated'
  module_id text,                      -- référence à un module pré-écrit si applicable
  world_summary text,                  -- résumé persistant du monde (mis à jour par le MJ)
  current_session_id uuid,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  owner_id uuid references profiles(id) on delete set null,  -- null = PJ contrôlé par IA
  is_ai boolean not null default false,
  name text not null,
  race text not null,
  class text not null,
  level int not null default 1 check (level between 1 and 20),
  background text,
  alignment text,
  -- Caractéristiques (1-30)
  str int not null check (str between 1 and 30),
  dex int not null check (dex between 1 and 30),
  con int not null check (con between 1 and 30),
  int_score int not null check (int_score between 1 and 30),
  wis int not null check (wis between 1 and 30),
  cha int not null check (cha between 1 and 30),
  -- Dérivés persistés (recalculés serveur)
  max_hp int not null,
  current_hp int not null,
  temp_hp int not null default 0,
  ac int not null,
  speed int not null default 9,
  -- Données riches en JSONB (validées par Zod)
  proficiencies jsonb not null default '{}'::jsonb,
                                  -- {skills:[], saves:[], weapons:[], armor:[], tools:[]}
  features jsonb not null default '[]'::jsonb,
                                  -- traits raciaux + features de classe
  inventory jsonb not null default '[]'::jsonb,
                                  -- liste d'objets avec quantités
  spells_known jsonb not null default '[]'::jsonb,
  spell_slots jsonb not null default '{}'::jsonb,
                                  -- {1:{max:4,used:0}, 2:{max:3,used:0}, ...}
  conditions jsonb not null default '[]'::jsonb,
                                  -- états actifs avec durée et source
  death_saves jsonb not null default '{"successes":0,"failures":0}'::jsonb,
  exhaustion int not null default 0 check (exhaustion between 0 and 6),
  -- Persona (pour les PJ IA)
  persona jsonb,                  -- {personality, ideals, bonds, flaws, voice_notes}
  portrait_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  session_number int not null,
  title text,
  summary text,                   -- résumé généré en fin de session
  started_at timestamptz default now() not null,
  ended_at timestamptz,
  unique (campaign_id, session_number)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  -- 'user' = humain ; 'gm' = MJ IA ; 'character' = PJ (humain ou IA) ; 'system' = méta
  author_kind text not null check (author_kind in ('user','gm','character','system')),
  author_id uuid,                 -- profile_id si user, character_id si character, null sinon
  content text not null,
  -- Métadonnées : type narratif (description, dialogue, action), références d'entités, etc.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now() not null
);
create index on messages (session_id, created_at);

create table dice_rolls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  character_id uuid references characters(id) on delete set null,
  roll_kind text not null,         -- 'attack','damage','save','check','initiative','death_save'
  expression text not null,        -- ex: '1d20+5'
  raw_dice int[] not null,         -- résultats bruts
  modifier int not null default 0,
  total int not null,
  advantage text check (advantage in ('normal','advantage','disadvantage')),
  dc int,                          -- DD ciblé si applicable
  target_ac int,                   -- CA ciblée si applicable
  outcome text,                    -- 'hit','miss','crit','fumble','success','failure'
  context jsonb not null default '{}'::jsonb,  -- ex: {ability:'dex', skill:'stealth'}
  created_at timestamptz default now() not null
);
create index on dice_rolls (session_id, created_at);

create table combat_encounters (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  status text not null default 'active' check (status in ('active','ended')),
  round int not null default 1,
  current_turn_index int not null default 0,
  initiative_order jsonb not null default '[]'::jsonb,
                                   -- [{combatant_id, kind:'pc'|'npc', initiative}]
  combatants jsonb not null default '[]'::jsonb,
                                   -- snapshot stats des PNJ pour le combat
  started_at timestamptz default now() not null,
  ended_at timestamptz
);

-- Cache de référence des entités importantes (les détails riches vivent dans Neo4j)
create table entities (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  kind text not null check (kind in ('npc','location','faction','item','quest','event')),
  name text not null,
  short_description text,
  neo4j_node_id text,              -- pointeur vers le nœud Neo4j
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index on entities (campaign_id, kind);

create table generated_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  kind text not null check (kind in ('scene','portrait','map','item')),
  prompt text not null,
  storage_path text not null,      -- chemin dans Supabase Storage
  entity_id uuid references entities(id) on delete set null,
  created_at timestamptz default now() not null
);
```

**RLS** : politique de base = un utilisateur ne voit/écrit que les données de ses campagnes. Pour le MVP solo, c'est suffisant. Pour le multi (v2), ajouter une table `campaign_members` et adapter les policies.

### 4.2 Neo4j (mémoire de campagne)

Schéma graphe minimal. Les nœuds sont scopés par `campaign_id` (propriété sur tous les nœuds, indexée).

**Types de nœuds** : `Character`, `NPC`, `Location`, `Faction`, `Item`, `Quest`, `Event`, `Session`.

**Relations principales** :
- `(NPC)-[:LIVES_IN]->(Location)`
- `(NPC)-[:MEMBER_OF]->(Faction)`
- `(NPC)-[:KNOWS {sentiment, since_event}]->(Character|NPC)`
- `(Character)-[:VISITED {at_session}]->(Location)`
- `(Character)-[:OWNS]->(Item)`
- `(Quest)-[:GIVEN_BY]->(NPC)`, `(Quest)-[:CONCERNS]->(Location|NPC|Faction)`
- `(Event)-[:HAPPENED_AT]->(Location)`, `(Event)-[:INVOLVED]->(Character|NPC)`
- `(Session)-[:CONTAINS]->(Event)`

**Contraintes/index** :
```cypher
CREATE CONSTRAINT entity_id IF NOT EXISTS
  FOR (n:Entity) REQUIRE n.id IS UNIQUE;
CREATE INDEX campaign_scope IF NOT EXISTS
  FOR (n:Entity) ON (n.campaign_id);
```

**Pattern d'écriture** : `MERGE` systématique sur `(id, campaign_id)` pour idempotence (familier pour Fred — UrbaHive).

**Pattern de lecture pour la mémoire MJ** :
```cypher
MATCH (n {campaign_id: $cid})
WHERE n.name CONTAINS $query OR any(alias IN n.aliases WHERE alias CONTAINS $query)
OPTIONAL MATCH (n)-[r]-(related {campaign_id: $cid})
RETURN n, collect({rel: type(r), node: related}) AS context
LIMIT 10;
```

---

## 5. Architecture des agents

### 5.1 Agent MJ (Maître de Jeu)

**Modèle** : `claude-opus-4-7`

**Rôle** : narrer, incarner les PNJ, arbitrer les règles, faire avancer l'intrigue, générer du contenu à la volée.

**System prompt (squelette)** :
```
Tu es le Maître de Jeu (MJ) d'une partie de Donjons & Dragons 5e.
Style : [TON DE LA CAMPAGNE — sombre / héroïque / pulp / etc.]
Univers : [RÉSUMÉ DU MONDE DEPUIS world_summary]

Règles de conduite :
- Tu narres à la 2e personne pour le joueur ("Tu vois...").
- Tu décris ambiances et conséquences, jamais les pensées des PJ.
- Tu demandes un jet quand la résolution est incertaine — utilise l'outil request_roll.
- Tu n'inventes pas les résultats des jets : tu attends le retour de l'outil.
- Tu rappelles les éléments de mémoire pertinents avec recall_memory avant de décrire un PNJ ou lieu déjà rencontré.
- Tu mets à jour la mémoire avec record_event après tout évènement notable.
- Quand un PJ IA doit agir, tu déclenches prompt_companion.
- Tu respectes scrupuleusement les règles de D&D 5e fournies en contexte.

Contexte mémoire pertinent : [INJECTÉ DYNAMIQUEMENT]
Personnages présents : [FICHES RÉSUMÉES]
État courant : [scène, lieu, combat actif ou non]
```

**Outils disponibles (tool use Anthropic)** :

| Outil               | Description                                                 |
|---------------------|-------------------------------------------------------------|
| `request_roll`      | Demande un jet à un PJ (humain ou IA). Bloque la narration. |
| `apply_damage`      | Applique des dégâts/soins à une cible.                      |
| `apply_condition`   | Ajoute/retire un état (empoisonné, agrippé, etc.).          |
| `update_resource`   | Consomme/restaure un emplacement de sort, des PV temp, etc. |
| `start_combat`      | Initialise un combat (initiative, combatants).              |
| `end_combat`        | Termine le combat actif.                                    |
| `recall_memory`     | Interroge le graphe Neo4j (entité, lieu, événement).        |
| `record_entity`     | Crée/met à jour un PNJ, lieu, faction, item.                |
| `record_event`      | Enregistre un événement narratif dans Neo4j.                |
| `prompt_companion`  | Invite un PJ IA à agir (laisse le tour au sub-agent).       |
| `generate_image`    | Génère une illustration de scène (asynchrone).              |
| `query_rules`       | Recherche dans `dnd5e_rules.md` (par RAG simple ou keyword).|

### 5.2 Agents PJ compagnons

**Modèle** : `claude-sonnet-4-5`

**Rôle** : incarner un PJ IA cohérent avec sa fiche et sa persona. Réagir aux situations posées par le MJ. Lancer ses propres jets via tool use.

**System prompt (squelette)** :
```
Tu incarnes [NOM], un(e) [RACE] [CLASSE] de niveau [N].
Personnalité : [persona.personality]
Idéaux / Liens / Défauts : [...]
Voix : [persona.voice_notes — accent, tics de langage, niveau de langue]

Tu es un compagnon dans un groupe d'aventuriers. Tu ne parles que pour ton personnage.
Tu réagis à ce que le MJ vient de décrire et à ce que les autres PJ disent ou font.

Règles :
- Tu ne narres jamais comme le MJ. Tu joues ton perso.
- Tu utilises take_action pour proposer une action mécanique (attaque, sort, compétence).
- Tu utilises speak pour ce que ton personnage dit (en italique pour les actions courtes).
- Tu connais ta fiche et tes capacités — pas plus.
- Tu n'inventes pas le monde, c'est le rôle du MJ.

Ta fiche : [FICHE COMPLÈTE]
Contexte récent : [N derniers messages de la session]
```

**Outils disponibles** :

| Outil          | Description                                                 |
|----------------|-------------------------------------------------------------|
| `take_action`  | Déclare une action mécanique (résolue par le serveur).      |
| `speak`        | Émet une réplique ou une pensée jouée.                      |
| `use_item`     | Utilise un objet de l'inventaire.                           |
| `cast_spell`   | Lance un sort (résout consommation d'emplacement).          |

### 5.3 Orchestration

Boucle de session simplifiée :

```
boucle session:
  attendre input (humain OU prompt_companion du MJ)
  router input → MJ
  MJ génère (streaming texte vers UI)
    si tool_use:
      exécuter outil côté serveur (jet, mémoire, etc.)
      réinjecter résultat → MJ continue
    si MJ déclenche prompt_companion(pj_id):
      invoquer agent PJ correspondant avec contexte récent
      streamer sa réponse à l'UI
      si tool_use du PJ → résoudre puis MJ commente
  persister messages, jets, mises à jour de fiches
  mettre à jour Neo4j si record_event/record_entity invoqués
```

**Important** : un seul agent stream à la fois pour ne pas embrouiller l'UI. La file est gérée serveur.

---

## 6. Workflows clés

### 6.1 Création de campagne

3 modes au choix dans l'UI :

1. **Homebrew** : nom + ton + univers libre, le MJ improvise.
2. **Module** : choix dans une liste de modules livrés en seed (1 module starter pour MVP, ex. "L'Auberge du Cerf Bondissant").
3. **Generated** : l'utilisateur entre un pitch (ex. "campagne sombre dans une cité portuaire dirigée par une guilde de voleurs"). Le MJ (Opus) génère :
   - `world_summary` (3–5 paragraphes)
   - 5–8 PNJ initiaux avec relations → écrits dans Neo4j
   - 2–3 lieux principaux → Neo4j
   - 1 quête d'amorce (hook) → Neo4j
   - Une scène d'ouverture prête à jouer

### 6.2 Création de personnage

Wizard en étapes (assistance Sonnet 4.5) :
1. Race
2. Classe
3. Caractéristiques (méthode au choix : standard / point-buy / 4d6)
4. Historique
5. Compétences/maîtrises (selon classe + historique)
6. Sorts (si lanceur)
7. Équipement de départ
8. Persona (personnalité, idéaux, liens, défauts) — Haiku peut générer des suggestions
9. Portrait (image gen optionnelle)

Tous les calculs dérivés (PV max, CA, modificateurs, DD de sort) sont **calculés serveur** depuis `dnd5e_rules.md`. Jamais saisis à la main.

### 6.3 Boucle de jeu en session

```
Joueur tape une action
  → Server Action : ajoute message (author_kind='user') en DB
  → Invoque MJ (Opus) avec :
      - system prompt MJ
      - N derniers messages de la session
      - Fiches résumées des PJ présents
      - Mémoire pertinente (si l'input cite un PNJ/lieu connu)
  → Stream SSE vers le client
  → Si MJ appelle un outil :
      - request_roll → UI affiche un bouton "Lancer le jet" pour le joueur ciblé
        (humain : clic ; IA : son agent décide). Résultat → DB → réinjecté dans la conv MJ.
      - apply_damage / apply_condition / etc. → mutation DB → notif UI (HP bar, etc.)
      - recall_memory → Cypher Neo4j → texte injecté
      - record_event → écriture Neo4j (asynchrone, non bloquant pour la narration)
      - prompt_companion → invoque agent PJ
  → MJ termine son tour de parole
  → Le joueur peut répondre ; ou si un PJ IA a été invité, son tour se déclenche.
```

### 6.4 Combat

Quand le MJ déclare un combat :
1. `start_combat` ouvre une row dans `combat_encounters`.
2. Initiative : tous les combattants roulent (jets persistés). UI affiche l'ordre.
3. À chaque tour : le serveur sait qui agit. Le MJ narre l'environnement et les PNJ. Les PJ (humains ou IA) agissent à leur tour.
4. Toutes les mécaniques (attaques, sauvegardes, dégâts, états) passent par les outils — le MJ ne calcule rien lui-même.
5. `end_combat` quand un camp est défait ou que le MJ décide la fin.

**Note** : pas de grille en MVP. Distances et positions sont décrites narrativement (« à proximité », « à 10 mètres »). Les attaques d'opportunité sont déclenchées par le MJ via narration.

### 6.5 Génération d'illustrations

Déclenchée par le MJ via `generate_image`. Cas d'usage :
- Portrait d'un PNJ marquant à sa première apparition.
- Scène clé (entrée d'un donjon, révélation, climax).
- Item magique unique.

Asynchrone : le MJ continue à narrer, l'image apparaît dans le fil quand prête. Persistée dans `generated_assets` + Supabase Storage.

### 6.6 Fin de session et mémoire

À `Terminer la session` :
1. Haiku résume la session (3–5 paragraphes) → `sessions.summary`.
2. Haiku extrait les évènements/entités notables non encore en graphe → propose au MJ de les enregistrer (auto-validation pour MVP).
3. `world_summary` de la campagne mis à jour si nécessaire.

---

## 7. Contrats API (Server Actions / Route Handlers)

Toutes les fonctions retournent `{ok: true, data} | {ok: false, error}`. Tous les inputs validés par Zod.

```ts
// Campagnes
createCampaign(input: { name, settingMode, settingPitch?, moduleId? })
listCampaigns()
getCampaign(id)

// Personnages
createCharacter(input: CharacterDraft)         // calcule HP/CA/etc serveur
updateCharacter(id, patch: CharacterPatch)     // recalcule les dérivés
deleteCharacter(id)

// Sessions
startSession(campaignId)
endSession(sessionId)                          // déclenche résumé + extraction mémoire
listSessions(campaignId)

// Messages (chat)
postUserMessage(sessionId, content)            // déclenche le tour MJ
// → Route Handler GET /api/session/:id/stream pour SSE

// Outils MJ (appelés en interne par l'orchestrateur, pas exposés au client)
toolRequestRoll(sessionId, target, rollSpec)
toolApplyDamage(characterId, amount, type)
toolApplyCondition(characterId, condition, durationRounds?)
toolRecallMemory(campaignId, query)            // → Neo4j
toolRecordEntity(campaignId, entity)
toolRecordEvent(campaignId, event)
toolPromptCompanion(sessionId, characterId)
toolGenerateImage(campaignId, prompt, kind)

// Combat
startCombat(sessionId, npcs)
endCombat(combatId)
nextTurn(combatId)
```

---

## 8. UI / écrans

Pages principales (Next.js App Router) :

```
/                              → landing + login
/dashboard                     → liste des campagnes
/campaigns/new                 → wizard création
/campaigns/[id]                → vue campagne (PJ, sessions passées, monde)
/campaigns/[id]/characters/new → wizard création PJ
/campaigns/[id]/play           → écran de jeu (chat principal)
/campaigns/[id]/codex          → vue lecture du graphe (PNJ, lieux, quêtes)
/settings                      → profil, préférences IA
```

**Écran de jeu (`/play`)** — layout 3 colonnes (responsive : stack en mobile) :
- **Gauche** : liste des PJ présents avec barres PV/sorts, état actif (qui parle).
- **Centre** : fil de chat avec messages typés (MJ, PJ, système, jets), illustrations inline, streaming en cours.
- **Droite** : panneau contextuel (combat tracker si actif, sinon mémoire récente / scène en cours).

Composants critiques :
- `MessageBubble` (variants par `author_kind`)
- `DiceRollCard` (affiche dés bruts + total + DD/CA + résultat)
- `CharacterPanel` (HP, sorts, états, actions rapides)
- `CombatTracker` (ordre d'initiative, tour courant, raccourci "fin de tour")
- `MemoryDrawer` (recherche dans le codex en cours de partie)

---

## 9. Modules de code (organisation)

```
/app                          # Next.js App Router
  /(auth)/login
  /(app)/dashboard
  /(app)/campaigns/...
  /api/session/[id]/stream    # SSE
/components                   # composants UI
  /game                       # MessageBubble, DiceRollCard, CombatTracker...
  /forms                      # wizards création
  /ui                         # shadcn re-exports
/lib
  /rules                      # logique pure D&D — testée à fond
    abilities.ts              # modificateur, jet de carac
    combat.ts                 # initiative, attaque, dégâts, critique
    spells.ts                 # DD sort, emplacements, concentration
    conditions.ts             # application/levée d'états
    leveling.ts               # XP, bonus de maîtrise, ASI
    dice.ts                   # roller serveur (RNG crypto)
    derivations.ts            # HP max, CA, depuis fiche
  /agents
    gm.ts                     # builder system prompt + tools MJ
    companion.ts              # builder system prompt + tools PJ
    orchestrator.ts           # boucle session
    tools/                    # une fct par tool Anthropic
  /memory
    neo4j.ts                  # client + helpers MERGE
    queries.ts                # Cypher recall / record
    extractor.ts              # Haiku-driven extraction post-session
  /db
    supabase-server.ts        # client SSR
    supabase-browser.ts       # client browser
    schema.ts                 # Zod schemas alignés sur DB
  /llm
    anthropic.ts              # client + streaming SSE
    image.ts                  # client image gen
  /types.ts                   # types partagés
/supabase
  /migrations                 # SQL versionné
  /functions                  # Edge Functions (si besoin de Deno)
/tests
  /rules                      # vitest sur /lib/rules
  /e2e                        # playwright
/dnd5e_rules.md               # référence règles (lue par Claude Code et par query_rules)
/spec.md                      # ce fichier
/CLAUDE.md                    # instructions persistantes pour Claude Code
```

---

## 10. Sécurité et secrets

- `ANTHROPIC_API_KEY` : Vercel env var, jamais exposée au client.
- `SUPABASE_SERVICE_ROLE_KEY` : Vercel env var, utilisée uniquement dans Server Actions / Route Handlers serveur.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` : OK côté client.
- `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` : Vercel env var, serveur uniquement.
- `IMAGE_GEN_API_KEY` : Vercel env var, serveur uniquement.

RLS Postgres = défense en profondeur même si le client est compromis. Pas de bypass via service role en dehors des Server Actions explicitement justifiées (résumés post-session, etc.).

Rate-limit sur `postUserMessage` (par user/min) pour éviter l'abus de l'API Anthropic.

---

## 11. Roadmap

### MVP (v0.1) — ordre de priorité tel que défini

1. **Fondations**
   - Setup Next.js + Tailwind + shadcn + Supabase (auth magic link) + Neo4j AuraDB
   - Migrations DB initiales + RLS de base
   - CI : lint, typecheck, tests
   - Tests unitaires `/lib/rules` (modificateurs, dérivations, dés)

2. **Création de personnage**
   - Wizard guidé (mode manuel d'abord, assistance IA en second temps)
   - Calcul serveur HP/CA/modificateurs/DD sort
   - Persistance + édition

3. **Session narrative simple (sans combat)**
   - Création de campagne (mode homebrew uniquement pour MVP-MVP, puis generated)
   - Chat MJ Opus avec streaming SSE
   - Outils : `request_roll`, `recall_memory`, `record_entity`, `record_event`
   - Compagnons IA Sonnet : `speak`, `take_action` (skill checks)

4. **Combat tour par tour**
   - `start_combat` / `end_combat`
   - Initiative + tracker UI
   - `apply_damage`, `apply_condition`, `update_resource`
   - Jets de mort / inconscience / stabilisation

5. **Sorts et magie**
   - Emplacements de sorts UI + serveur
   - Concentration (un sort à la fois, sauv CON sur dégâts)
   - Cantrips (sans coût d'emplacement)
   - Sorts de zone : narratif (pas de grille)

6. **Campagne multi-sessions persistante**
   - Résumé de fin de session (Haiku)
   - Extraction d'entités/événements vers Neo4j
   - Codex consultable
   - Reprise de session : injection automatique de la mémoire pertinente

### v0.2 — Polish

- Génération de monde (mode `generated`) complète
- Génération d'illustrations en cours de partie
- Module starter pré-écrit (1 aventure niveaux 1–3)
- Préférences IA par user (verbosité MJ, style narratif)
- Édition du codex à la main

### v1.0 — Multi-joueurs

- `campaign_members` + invitations par lien
- Realtime Supabase : présence, sync de l'état de session
- Tour de parole (qui peut écrire quand) selon contexte (RP libre vs combat ordonné)
- Mode "MJ humain assisté" (un humain est MJ, l'IA suggère)

### v2.0+

- TTS (narration audio MJ)
- Export PDF de la campagne (résumé + portraits + codex)
- Marketplace de modules communautaires
- Grille tactique optionnelle

---

## 12. Critères d'acceptation MVP

Le MVP est livré quand un utilisateur peut :
- [ ] S'inscrire/se connecter par magic link
- [ ] Créer une campagne homebrew avec un nom et un pitch
- [ ] Créer un PJ niveau 1 valide (toutes mécaniques cohérentes avec `dnd5e_rules.md`)
- [ ] Ajouter 1–3 compagnons PJ IA avec persona
- [ ] Démarrer une session, jouer 30 min de narration + au moins 1 combat de 1–3 PNJ
- [ ] Tous les jets sont auditables (visibles dans `dice_rolls`, affichés en UI)
- [ ] Les PV, sorts, états sont mis à jour correctement et de façon cohérente
- [ ] Terminer la session, voir le résumé, retrouver les PNJ rencontrés dans le codex
- [ ] Reprendre une 2e session : le MJ se rappelle naturellement de la première

Tests automatisés exigés sur :
- Toutes les fonctions de `/lib/rules` (couverture > 90 %)
- Parcours e2e : création compte → création campagne → création PJ → 1 message dans une session → vérif persistance

---

## 13. Décisions à prendre / risques

À trancher en cours de route :
- **Choix exact du provider image** (Replicate vs fal.ai vs autre) : décision avant la phase image gen.
- **Sub-agents Sonnet 4.5 ou Sonnet 4.6** : 4.6 est plus récent et meilleur. Re-évaluer avant la phase compagnons.
- **Limite de contexte MJ** : Opus 4.7 a 200k tokens. Stratégie de compression du contexte (résumés glissants) à définir au moment où une session dépasse ~50k tokens.
- **Coût** : Opus n'est pas bon marché. Prévoir un compteur de tokens par campagne et alerter l'utilisateur. Possibilité de fallback Sonnet 4.6 pour le MJ si abus.
- **Modules pré-écrits et licence** : ne PAS utiliser de contenu propriétaire WotC. Le module starter sera 100 % original sous notre licence.

Risques identifiés :
- **Hallucination des règles par le MJ** : mitigé par les tools (jets faits serveur) et `query_rules` pour les cas complexes. Le MJ ne calcule rien lui-même.
- **Dérive de cohérence entre sessions** : mitigé par Neo4j + résumés. À monitorer.
- **Latence Opus** : streaming masque, mais TTFB peut être perçu. Mesurer et communiquer (animation "le MJ réfléchit...").

---

## 14. Conventions Claude Code

À chaque nouvelle feature, Claude Code doit :
1. Lire la section pertinente de `dnd5e_rules.md` ET de ce `spec.md`.
2. Annoncer un plan court (3–7 lignes) avant de coder.
3. Coder par incréments testables.
4. Écrire les tests `vitest` dans la même PR/commit que la logique de règles.
5. Mettre à jour ce `spec.md` si une décision d'architecture évolue.
6. Préférer la lisibilité à la brièveté ; pas de magie. Commenter le "pourquoi", pas le "quoi".
7. Pas de `// TODO` non assignés : soit on fait, soit on crée une issue GitHub.
8. Toujours valider les inputs serveur avec Zod, même internes.
9. Logger les erreurs serveur de façon structurée (objet, pas de string concat).
10. Demander confirmation avant : migration DB destructive, suppression de données, ajout de dépendance lourde.

---

*Fin du spec. Document vivant, à amender au fur et à mesure des décisions.*
