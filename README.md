# DetD — JDR solo avec MJ et compagnons IA

Plateforme web pour jouer en solo à un JDR narratif avec un **MJ IA** et **0–5
compagnons IA**. Trois univers pris en charge : **Donjons & Dragons 5e**,
**The Witcher** et **Le Donjon de Naheulbeuk**.

## Stack

- **Front** : Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4
- **Back** : Server Actions · Route Handlers (SSE)
- **Data** : Supabase Postgres (état transactionnel, RLS) · Neo4j AuraDB (mémoire de campagne — entités, sessions, faits)
- **LLM** : abstraction multi-provider (`lib/ai/llm/`) — **Anthropic** (prod), **Mistral**, ou **Ollama / Gemma 4** (dev-only)
- **Validation** : Zod · **Tests** : Vitest · **Lint** : Biome

Voir `spec.md` pour l'architecture complète et `dnd5e_rules.md` pour les règles.

## Architecture — IA spécialisées + machine à états serveur

L'orchestration ne repose plus sur un mégacontrôleur "Conteur omniscient". Le
serveur tient une machine à états turn-by-turn (`lib/server/turn-orchestrator.ts`)
qui dispatche à trois IA scopées :

| Rôle | Module | Modèle (Anthropic) | Quand |
|---|---|---|---|
| **Narrateur** | `lib/ai/gm-agent.ts` | Opus 4.7 | Hors combat + résolution de l'action du PJ en combat |
| **NPC** | `lib/ai/npc-agent.ts` | Haiku 4.5 | Tour d'un PNJ pendant un combat (cible un ennemi vivant, lance un jet, passe la main) |
| **Compagnon** | `lib/ai/companion-agent.ts` | Haiku 4.5 | Interactions narratives + tour automatique en combat |

Une seule connexion SSE par input joueur ; l'orchestrateur enchaîne les tours
côté serveur et signale les changements d'auteur via les events `turn_start` /
`turn_end` que le client traduit en bulles distinctes.

Le **combat** est serveur-autoritaire (`lib/server/combat-loop.ts`) : initiative,
curseur, fin auto, optimistic CAS sur la version du `combat_encounters`.

## Onboarding personnage (tirage de dés)

Création de PJ et de compagnons unifiée autour d'une **section de tirage**
bloquante :

- **Modèles canoniques** par univers (Geralt, Jaskier, Yennefer pour Witcher ;
  La Compagnie de Naheulbeuk au complet ; archétypes pour D&D) — pré-remplissent
  nom, espèce, classe, caractéristiques, compétences, historique, personnalité.
- **Or de départ** : formule par classe (PHB pour D&D, équivalents thématiques
  pour Witcher/Naheulbeuk). **Un seul tirage**, animation des dés, pas de
  relance — submit du formulaire bloqué tant que les dés ne sont pas lancés.
- **Équipement de base** : kit déterministe par classe et univers (catalogue
  dans `lib/rules/equipment.ts`).
- **Sorts de départ** : liste par classe lanceuse uniquement
  (`lib/rules/spells.ts`). Les non-lanceurs (Jaskier en Barde witcher, paladin
  niv. 1, etc.) n'ont pas de sorts.
- L'**univers est forcé** à celui de la campagne — pas de mismatch possible.

À la persistance, les items du kit sont normalisés en `InventoryItem` canonique
(id unique, qty, weapon-block parsé) — voir `lib/server/inventory-normalize.ts`.

## Univers pris en charge

### Donjons & Dragons 5e (SRD 5.1)

Système par défaut. Règles complètes (jets, combat, sorts, repos, conditions,
sauvegardes de mort, repos courts/longs).

Templates : Le Paladin · L'Archère · La Mage · Le Clerc · La Voleuse · Le Barbare.

### The Witcher

Univers du Continent. Sorceleurs, mages, alchimistes ; signes (Igni, Aard,
Yrden, Quen, Axii) traités comme cantrips ; armes argent/acier ; potions.

- **Espèces** : Humain, Elfe, Nain, Demi-Elfe, Halfelin, Vampire supérieur (Régis)
- **Classes** : Sorceleur, Mage, Voleur, Éclaireur, Guerrier, Alchimiste, Barde
- **Templates** : Geralt de Riv · Jaskier · Yennefer de Vengerberg · Zoltan Chivay · Emiel Regis Rohellec Terzieff-Godefroy
- **Modules pré-configurés** : Contrat du Village Maudit · Héritage de la Sorcière · Malédiction du Bois de Brokilon · Tournoi de la Lame Noire

### Le Donjon de Naheulbeuk

Terre de Fangh, ton humoristique. Compagnie d'aventuriers complète au début de
session.

- **Espèces** : Humain, Nain, Elfe, Demi-Elfe, Ogre, Orc, Gobelin, Halfelin, Troll, Demi-Démon, Houchou
- **Classes** : Ranger, Voleur, Magicien, Guerrier, Barbare, Paladin, Barde, Prêtre
- **Templates** : Le Ranger · Le Voleur · La Magicienne · Le Nain · L'Elfe · L'Ogre · Le Barbare · La Prêtresse de Thô · Théo de Reuk · Belzébith · Reivax

## Auto-intro et règles narratives

- **Ouverture automatique** : à l'arrivée sur une session vide, le Conteur
  ouvre l'aventure tout seul (décor, party présentée à partir des fiches,
  hook narratif, "Que fais-tu ?"). Aucun input requis.
- **Mode combat visuel** : la chat et l'input passent en thème "blood" pendant
  un combat actif (radial-gradient rouge, badge ⚔ ROUND N).
- **Argent vs objets** : tout argent trouvé est crédité automatiquement par le
  concierge ; pour un objet, le narrateur **demande l'intention** au joueur
  avant de mettre à jour l'inventaire.

## Démarrer en local

```bash
pnpm install
cp .env.local.example .env.local   # remplir les 7 variables
pnpm supabase db push              # ou copier supabase/bootstrap.sql dans SQL Editor
pnpm dev
```

## Providers LLM

`LLM_PROVIDER=anthropic|mistral|ollama` (défaut `anthropic`).

### Anthropic — prod
| Rôle | Modèle |
|---|---|
| BUILDER (persona-suggest) | `claude-haiku-4-5` |
| **NARRATOR** (Conteur) | `claude-opus-4-7` |
| COMPANION | `claude-haiku-4-5` |
| NPC | `claude-haiku-4-5` |
| UTIL (concierge, résumé) | `claude-haiku-4-5` |

### Mistral
```bash
LLM_PROVIDER=mistral
MISTRAL_API_KEY=...
```
NARRATOR sur `mistral-large-2407`, autres rôles sur `mistral-small-2402`.

### Ollama / Gemma 4 — dev-only

Mode local utilisant la famille `gemma4`. Fiabilité tool-calls et JSON
variables — **non production-ready**, l'URL localhost n'est pas joignable
depuis Vercel.

```bash
ollama serve
ollama pull gemma4:e2b gemma4:26b
LLM_PROVIDER=ollama
```

| Rôle | Modèle | Notes |
|---|---|---|
| BUILDER | `gemma4:31b` | Réponses courtes |
| NARRATOR | `gemma4:26b` | `think:false` envoyé pour tronquer la pensée cachée |
| COMPANION/NPC | `gemma4:26b` | Même modèle évite un rechargement RAM |
| UTIL | `gemma4:e2b` | Concierge + résumé |

## Commandes

```bash
pnpm lint          # biome check
pnpm lint:fix      # biome check --write
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run (376 tests)
pnpm test:coverage # vitest avec coverage v8
pnpm test:watch
pnpm build         # next build
pnpm dev
```

## Règles d'or (voir `CLAUDE.md`)

- Logique de règles **server-only** (`/lib/rules`, ≥ 90 % coverage).
- Toute mutation passe par une Server Action Zod-validée.
- Clés API (Anthropic, Supabase service role, Neo4j) jamais côté client.
- Tenant-guard chaque écriture service-role consommant une sortie LLM.

## Arborescence

```
app/
├─ api/sessions/[id]/stream         route SSE — orchestrateur multi-tours
├─ campaigns/
│  ├─ [id]/
│  │  ├─ characters/new             création PJ (templates + tirage)
│  │  ├─ play                       écran de session (chat + tracker combat)
│  │  ├─ sheet                      fiche + contrôles HP/repos
│  │  └─ team                       compagnons IA (création + tirage)
│  └─ new                           wizard campagne (univers, monde, modules)
└─ dashboard

lib/
├─ ai/                              agents — narrator, NPC, companion + universe prompts
├─ rules/                           moteur pur — dice, combat, equipment, spells, templates
└─ server/                          orchestrator, combat-loop, server actions
```

## Conformité SRD D&D 5e

`lib/rules/` implémente le SRD 5.1 en TypeScript pur (97.5 % de couverture).

### Implémenté

- Jets de d20 avec avantage/désavantage · critiques · expertise · scores passifs
- Bonus de maîtrise par niveau · CA avec caps DEX · sauvegardes de mort complètes
- 14 conditions + échelle d'épuisement · emplacements de sorts (full + partiel)
- DD de sauvegarde sort · bonus d'attaque sort · concentration · upcast pour `goodberry`
- Repos court (DV) / long · XP + ASI aux niveaux 4/8/12/16/19
- Turn economy : action / bonus / réaction / mouvement

### Manques à fort impact

| Règle | État | Conséquence |
|---|---|---|
| Attaques d'opportunité | ❌ | Fuir un combat sans coût |
| Couverture (+2 / +5 / totale) | ❌ | "Tu te caches derrière le muret" sans bonus CA |
| Stabilisation via Médecine DD 10 | ❌ | Pas de soin manuel d'un PJ tombé |
| Upcast complet (boule de feu niv. 5+) | ❌ | Sort fixé au niveau d'apprentissage |
| Rituels | ❌ | Pas de Détection lente hors slot |

## Prochaines étapes

- Combler les manques SRD prioritaires (AoO, couverture, upcast, stabilisation)
- Picker de sorts (au-delà du starter set par classe)
- Stabiliser Ollama (tool-calls, JSON, streaming)
- Génération d'images (Replicate / fal.ai)
- Playwright e2e sur les parcours critiques
- Déploiement Vercel + preview URL
