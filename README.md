# DetD — Donjons & Dragons 5e avec agents IA

Plateforme web permettant de jouer à Donjons & Dragons 5e en solo avec un MJ IA
(Claude Opus 4.7) et 0-5 compagnons IA (Claude Sonnet 4.5).

## Stack

- **Front** : Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4
- **Back** : Next.js Server Actions · Route Handlers (SSE)
- **Data** : Supabase Postgres (RLS) · Neo4j AuraDB (mémoire graphe)
- **LLM** : Anthropic SDK — Opus (MJ), Sonnet (compagnons), Haiku (utilitaires)
- **Validation** : Zod · **Tests** : Vitest · **Lint** : Biome

Voir `spec.md` pour l'architecture complète et `dnd5e_rules.md` pour les règles.

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

## Prochaines étapes (v0.2+)

- Onboarding guidé complet (campagne → pitch → PJ → première session)
- Génération d'images (scènes / portraits) — Replicate / fal.ai
- Sous-vues Sorts et Sac (actuellement agrégées dans la fiche)
- Rate limiting des appels LLM
- Playwright e2e sur les parcours critiques
- Déploiement Vercel + preview URL
