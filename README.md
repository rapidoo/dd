# DetD — Donjons & Dragons 5e avec agents IA

Plateforme web permettant de jouer à Donjons & Dragons 5e en solo avec un MJ IA
(Claude Opus 4.7) et 0-5 compagnons IA (Claude Sonnet 4.5).

## Stack

- **Front** : Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4
- **Back** : Next.js Server Actions · Route Handlers (SSE)
- **Data** : Supabase Postgres (état transactionnel, RLS) · Neo4j AuraDB (mémoire de campagne — entités, sessions, faits narratifs)
- **LLM** : abstraction multi-provider (`lib/ai/llm/`) — **Anthropic** (stable), **Mistral** (nouveau), ou **Ollama / Gemma 4** (expérimental, dev-only)
- **Validation** : Zod · **Tests** : Vitest · **Lint** : Biome

Voir `spec.md` pour l'architecture complète et `dnd5e_rules.md` pour les règles.

## Providers LLM

Le switch `LLM_PROVIDER` (env) choisit le backend :

### Anthropic — **mode stable, utilisé en prod**
| Rôle | Modèle | Usage |
|---|---|---|
| BUILDER | `claude-haiku-4-5` | Création de PJ/compagnons (noms, personnalités) |
| **GM** | `claude-opus-4-7` | Narration MJ (seul rôle sur Opus — richesse stylistique visible au joueur) |
| COMPANION | `claude-haiku-4-5` | Voix des compagnons IA |
| UTIL | `claude-haiku-4-5` | Concierge (entités + butin) + résumé roulant |

### Mistral — **nouveau provider, configuration simple**

Provider alternatif utilisant l'API Mistral. Configuration requise dans `.env.local`:

```bash
LLM_PROVIDER=mistral
MISTRAL_API_KEY=votre_clé_api
# MISTRAL_BASE_URL=https://api.mistral.ai (optionnel, par défaut)
```

| Rôle | Modèle par défaut | Usage |
|---|---|---|
| BUILDER | `mistral-large-2407` | Création de PJ/compagnons |
| **GM** | `mistral-large-2407` | Narration MJ |
| COMPANION | `mistral-small-2402` | Voix des compagnons IA |
| UTIL | `mistral-small-2402` | Concierge + résumé roulant |

### Ollama (Gemma 4) — **⚠️ en cours de stabilisation, non production-ready**

Mode local gratuit utilisant uniquement la famille **gemma4**. Utile pour tester
sans consommer la facture Anthropic, mais la qualité narrative, la fiabilité
des tool-calls et la tolérance aux formats JSON restent en cours d'évaluation.
**Ne pas utiliser en prod Vercel** — l'URL localhost n'est pas joignable depuis
le déploiement.

| Rôle | Modèle | Taille | Notes |
|---|---|---|---|
| BUILDER | `gemma4:e4b` | 9.6 GB | Réponses courtes (noms, persona) — pas besoin de raisonnement |
| GM | `gemma4:26b` | 18 GB | Modèle de raisonnement — `think:false` envoyé par défaut |
| COMPANION | `gemma4:26b` | 18 GB | Même modèle que GM (évite un rechargement en RAM) |
| UTIL | `gemma4:e4b` | 9.6 GB | Concierge + résumé roulant |

Setup local :
```bash
ollama serve
ollama pull gemma4:e4b gemma4:26b
# .env.local :
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434   # défaut, optionnel
# (ANTHROPIC_API_KEY devient optionnelle dans ce mode)
pnpm dev
```

Override par rôle (utile pour benchmarker un autre tag gemma4) :
```bash
LLM_MODEL_BUILDER=gemma4:31b   # si vous voulez la qualité maxi pour la création
LLM_MODEL_GM=gemma4:e4b        # plus rapide, qualité narrative moindre
LLM_MODEL_COMPANION=gemma4:26b
LLM_MODEL_UTIL=gemma4:e4b
```

Limites connues du mode Ollama :
- **Modèles de raisonnement gemma4:26b/:31b** : ils émettent ~150 tokens de
  pensée cachée avant la réponse visible. L'adaptateur envoie automatiquement
  `think: false` (silencieusement ignoré sur les modèles non-raisonnement comme
  e4b) ; sinon les courts `maxTokens` budgétés par les Server Actions
  (ex. `suggestName` à 40) renvoient une réponse vide.
- Les tool-calls dépendent du support du modèle (erreur typée
  `model_no_tool_support` si un tag gemma4 ne le gère pas) — e4b, 26b et 31b
  sont vérifiés tool-capable.
- Le concierge utilise `format: 'json'` pour forcer un JSON propre ; les
  échecs éventuels sont loggés côté serveur (`[concierge] no_json` /
  `schema_invalid` / …) — surveillez la console `pnpm dev`.
- Les modèles tournent en non-streaming (contrairement au streaming SSE
  d'Anthropic) ; la narration apparaît en un bloc à la fin du tour.
- Une réponse tronquée (budget `maxTokens` atteint) est désormais remontée
  via `stopReason: 'max_tokens'` — utile pour distinguer une vraie réponse
  vide d'une coupure.

## Démarrer en local

```bash
pnpm install
cp .env.local.example .env.local   # puis remplir les 7 variables
pnpm supabase db push              # ou copier les .sql dans SQL Editor
pnpm dev
```

## Workflows vérifiés

| Sprint | Livrable |
|---|---|
| 0 | Bootstrap Next.js + Tailwind + Biome + Vitest + CI GitHub Actions |
| 1 | `/lib/rules` — 16 modules purs, 226 tests, 97.5% coverage |
| 2 | Schéma Postgres + RLS + Auth magic link |
| 3 | Design system (tokens du design `session.html`) |
| 4 | Foyer (dashboard, création campagne, profil) |
| 5 | Création de personnage avec dérivations serveur |
| 6 | Session narrative + streaming SSE avec Opus GM |
| 7 | Compagnons Sonnet autour du feu |
| 8 | Combat narratif théâtre de l'esprit |
| 9 | Fiche de personnage + contrôles HP |
| 10 | Repos court et long |
| 11 | Mémoire Neo4j + journal |
| 12 | Polish + docs |
| 13 | **Support The Witcher** — univers alternatif avec races, classes, modules et mécaniques uniques (signes, alchimie, faiblesses des monstres, moralité grise) |

## Univers pris en charge

### Donjons & Dragons 5e (SRD 5.1)
Le système par défaut, pleinement implémenté avec règles complètes (jets, combat, sorts, repos, etc.).

### The Witcher — **nouveau**

Support complet pour l'univers de The Witcher avec :

- **5 races** : Humain, Elfe, Nain, Demi-Elfe, Halfelin
- **6 classes** : Sorceleur, Mage, Voleur, Éclaireur, Guerrier, Alchimiste
- **4 modules pré-configurés** :
  - Le Contrat du Village Maudit (Niv. 1-2)
  - L'Héritage de la Sorcière (Niv. 2-3)
  - La Malédiction du Bois de Brokilon (Niv. 3-4)
  - Le Tournoi de la Lame Noire (Niv. 4-6)
- **Système de signes** (Igni, Aard, Quen, Yrden, Axii) — *à venir*
- **Alchimie** (potions, ingrédients, risques) — *à venir*
- **Faiblesses des monstres** (multiplicateurs de dégâts) — *à venir*
- **Moralité grise et réputation** — *à venir*

La sélection de l'univers se fait lors de la création de campagne. Toutes les données (races, classes, modules) sont automatiquement filtrées selon l'univers choisi.

## Commandes

```bash
pnpm lint          # biome check
pnpm lint:fix      # biome check --write
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm test:coverage # vitest avec coverage v8
pnpm test:watch    # vitest watch
pnpm build         # next build
pnpm dev           # next dev
```

## Règles d'or (voir `CLAUDE.md`)

- Toute logique de règles vit côté **serveur** (`/lib/rules`).
- Toute mutation passe par une Server Action Zod-validée.
- Les clés API (Anthropic, Supabase service role, Neo4j) ne quittent jamais le serveur.
- `pnpm test` doit rester vert. Objectif 90%+ de couverture sur `/lib/rules`.

## Arborescence

```
app/                    pages Next.js (App Router)
├─ api/sessions/[id]/stream  route SSE — flux du MJ
├─ auth/callback             magic link exchange
├─ campaigns/
│  ├─ [id]/
│  │  ├─ characters/new      création de PJ
│  │  ├─ journal             chronique + codex
│  │  ├─ play                écran de session (chat + panneau)
│  │  ├─ sheet               fiche + contrôles HP/repos
│  │  └─ team                compagnons IA
│  └─ new                    wizard de création de campagne
├─ dashboard                 foyer
└─ design                    catalogue du design system

components/             UI partagé (dice overlay, sidebar, messages, stats)
lib/
├─ ai/                  agents Claude (GM, compagnons, tools)
├─ db/                  Supabase SSR clients + types de ligne
├─ neo4j/               driver + Cypher paramétrés
├─ rules/               moteur D&D 5e pur (dice, combat, sorts, etc.)
└─ server/              Server Actions (campaigns, sessions, combat, rest…)

supabase/migrations/    SQL (schéma + RLS)
tests/                  vitest unit + (à venir) Playwright e2e
```

## Conformité SRD D&D 5e

`lib/rules/` implémente les règles SRD 5.1 en TypeScript pur (≥ 97 % de
couverture). Audit détaillé contre `dnd5e_rules.md` :

### Implémenté

- Jets de d20 avec avantage/désavantage (annulation correcte, pas de stacking)
- Critiques : dés d'arme doublés, modificateurs non doublés
- 18 compétences mappées sur leur carac. + **Expertise** (maîtrise doublée) + scores passifs
- Bonus de maîtrise par niveau (+2 → +6)
- CA avec caps DEX, STR min, désavantage discrétion, bouclier +2
- Sauvegardes de mort complètes : 3 succès = stabilisé · 3 échecs = mort ·
  nat 20 = reprise à 1 PV · nat 1 = 2 échecs
- 14 conditions officielles + échelle d'épuisement 6 niveaux
- Emplacements de sorts (lanceurs complets + partiels, tables 1-20 verbatim)
- DD de sauvegarde sort, bonus d'attaque sort, concentration (DD `max(10, dmg/2)`)
- Repos court (dépense de DV) / long (PV + slots + exhaustion −1 si nourri)
- XP + ASI aux niveaux 4/8/12/16/19
- Turn economy : 1 action / 1 bonus / 1 réaction / mouvement / interactions libres

### Manques à fort impact narratif

| Règle SRD | État | Conséquence en jeu |
|---|---|---|
| Attaques d'opportunité | ❌ absent | Un joueur fuit un combat sans conséquence ; "désengager" perd son sens |
| Couverture (+2 / +5 / totale) | ❌ absent | Le MJ décrit "tu te caches derrière le muret" mais la CA ne bouge pas |
| Stabilisation via Médecine DD 10 | ❌ absent | Pas de soin manuel d'un PJ tombé — seuls les sorts guérisseurs fonctionnent |
| Upcast (sort à niveau supérieur) | ❌ absent | Impossible de représenter "Boule de feu en niv. 5 = +2d6" |
| Rituels | ❌ absent | Sorts utilitaires lents (Détection, Communication) impossibles hors slot |

### Manques à impact moyen

| Règle | État | Détail |
|---|---|---|
| Propriétés d'armes | 🟡 partiel | `weapon-attack.ts` gère `finesse` + `ranged`. Manquent : `versatile` (1d8→1d10 à 2 mains), `heavy`, `reach`, `thrown`, `two-handed`, `loading`, `ammunition` |
| Point-buy 8–15 | ❌ absent | Le wizard accepte des scores bruts, sans validation du budget 27 points |
| Table de rencontres (XP par CR) | ❌ absent | Pas bloquant en solo narratif, empêche tout calibrage auto de difficulté |

## Prochaines étapes (v0.2+)

- **Combler les manques SRD prioritaires** : attaques d'opportunité, couverture, upcast, stabilisation Médecine DD 10 (~250 lignes + tests, débloque 4 motifs narratifs déjà tentés par le MJ)
- Stabiliser le mode Ollama (fiabilité tool-calls, JSON concierge, streaming)
- Onboarding guidé complet (campagne → pitch → PJ → première session)
- Génération d'images (scènes / portraits) — Replicate / fal.ai
- Sous-vues Sorts et Sac (actuellement agrégées dans la fiche)
- Propriétés d'armes complètes (versatile, heavy, reach, thrown, two-handed)
- Point-buy 8–15 sur le wizard de création de PJ
- Playwright e2e sur les parcours critiques
- Déploiement Vercel + preview URL

### The Witcher — Roadmap
- [ ] **Modèles de personnages** : Geralt (Sorceleur 5), Jaskier (Barde 4), Yennefer (Mage 5), Zoltan (Guerrier 4), Regis (Alchimiste Vampire 5)
- [ ] Implémentation complète des **12 races** et **10 classes** de l'univers
- [ ] Système de **signes** avec gestion des emplacements et coûts
- [ ] Système d'**alchimie** (potions, bombes, huiles)
- [ ] **Faiblesses des monstres** avec multiplicateurs de dégâts automatiques
- [ ] **Système de réputation** et moralité grise
- [ ] 6 modules supplémentaires pour couvrir les niveaux 1-10
