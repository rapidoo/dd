# DetD — Donjons & Dragons 5e avec agents IA

Plateforme web permettant de jouer à Donjons & Dragons 5e en solo avec un MJ IA
(Claude Opus 4.7) et 0-5 compagnons IA (Claude Sonnet 4.5).

## Stack

- **Front** : Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4
- **Back** : Next.js Server Actions · Route Handlers (SSE)
- **Data** : Supabase Postgres (état transactionnel, RLS) · Neo4j AuraDB (mémoire de campagne — entités, sessions, faits narratifs)
- **LLM** : abstraction multi-provider (`lib/ai/llm/`) — **Anthropic** (stable) ou **Ollama / Gemma 4** (expérimental, dev-only)
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

### Ollama (Gemma 4) — **⚠️ en cours de stabilisation, non production-ready**

Mode local gratuit utilisant uniquement la famille **gemma4**. Utile pour tester
sans consommer la facture Anthropic, mais la qualité narrative, la fiabilité
des tool-calls et la tolérance aux formats JSON restent en cours d'évaluation.
**Ne pas utiliser en prod Vercel** — l'URL localhost n'est pas joignable depuis
le déploiement.

| Rôle | Modèle | Taille |
|---|---|---|
| BUILDER | `gemma4:31b` | 20 GB |
| GM | `gemma4:26b` | 18 GB |
| COMPANION | `gemma4:26b` | 18 GB (même modèle que GM, évite un rechargement en RAM) |
| UTIL | `gemma4:e2b` | 7.2 GB |

Setup local :
```bash
ollama serve
ollama pull gemma4:31b gemma4:26b gemma4:e2b
# .env.local :
LLM_PROVIDER=ollama
# (ANTHROPIC_API_KEY devient optionnelle dans ce mode)
pnpm dev
```

Limites connues du mode Ollama :
- Les tool-calls dépendent du support du modèle (erreur typée
  `model_no_tool_support` si un modèle gemma4 ne le gère pas encore).
- Le concierge utilise `format: 'json'` pour forcer un JSON propre ; les
  échecs éventuels sont loggés côté serveur (`[concierge] no_json` /
  `schema_invalid` / …) — surveillez la console `pnpm dev`.
- Les modèles tournent en non-streaming (contrairement au streaming SSE
  d'Anthropic) ; la narration apparaît en un bloc à la fin du tour.

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
