# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

D&D 5e single-player platform with an AI Dungeon Master and 0–5 AI companions. The repo is a Next.js 16 app backed by Supabase (Postgres + Auth + RLS), Neo4j (campaign memory graph), and a swappable LLM provider layer (Anthropic in prod, Ollama/Gemma 4 optional in dev).

Two reference docs drive every non-trivial decision — read before coding:
- `spec.md` — product architecture, DB schema, workflows, roadmap
- `dnd5e_rules.md` — the rules the engine must implement verbatim

## Commands

```bash
pnpm dev                         # next dev
pnpm build && pnpm start         # production build
pnpm lint                        # biome check (no write)
pnpm lint:fix                    # biome check --write
pnpm typecheck                   # tsc --noEmit
pnpm test                        # vitest run (unit)
pnpm test:watch
pnpm test:coverage               # vitest with v8 coverage
pnpm test -- lib/rules/dice      # single suite (any vitest filter)
pnpm test:e2e                    # playwright — see e2e quirks below
```

e2e quirks: `playwright.config.ts` boots its own `next dev` on port 3001 with `ALLOW_TEST_LOGIN=1`. If a dev server is already running in the project dir (Next locks `.next/dev/`), use `PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm test:e2e`. Test auth goes through `POST /api/test/login`, guarded by flag + `NODE_ENV !== 'production'` + `VERCEL_ENV !== 'production'` (triple-check — never reachable in prod).

## Absolute rules (non-negotiable)

1. **Rules engine is server-only.** All D&D math lives in `lib/rules/` as pure TypeScript. Never duplicate a formula on the client — the client reads results, it doesn't compute them. Target ≥90% vitest coverage here (currently 97.5%).
2. **Mutations go through Zod-validated Server Actions** (`lib/server/*.ts` with `'use server'`). Never bypass validation, even for "trusted" internal callers.
3. **No secrets in client code.** Service-role Supabase, Anthropic key, Neo4j creds stay on the server. Env access goes through `lib/db/env.ts` — don't read `process.env` ad hoc.
4. **Tenant-guard every service-role DB write that consumes LLM input.** The GM loop runs as service-role (needed for dice_rolls, combat_encounters, inventory). Every `character_id` / `combatant_id` emitted by the model must be verified via `lib/ai/tenant-guard.ts` before hitting the DB — otherwise prompt injection can mutate another campaign.

## Architecture — big picture

### Session turn lifecycle (the hot path)

`/app/api/sessions/[id]/stream/route.ts` is the SSE endpoint. One GM turn flows:

1. **Auth + ownership check** — `supabase.auth.getUser()` then fetch `sessions.campaign_id` through RLS. A non-owner gets 404 (leaks nothing).
2. **Rate limit** — `lib/server/rate-limit.ts` sliding window, 20 turns/min/user.
3. **Debug shortcut** — `lib/ai/debug-mode.ts` intercepts `/debug <cmd>` messages in dev/preview only, skipping the LLM entirely for UI smoke tests.
4. **`runGmTurn()` generator** (`lib/ai/gm-agent.ts`) — streams `GmEvent`s. Inside:
   - `compactHistory()` from `rolling-summary.ts` keeps only the last 6 messages verbatim; older ones are replaced by a Haiku-generated summary stored in `sessions.summary` + `sessions.summary_cursor`. Regenerated every ~8 new messages.
   - `listEntitiesForCampaign()` from Neo4j (source of truth for campaign memory) injects up to 6 known entities into the system prompt ("Mémoire" block), with the session numbers where each was seen.
   - LLM tool-use loop (max 6 iterations) — the model emits `request_roll`, `apply_damage`, `start_combat`, `cast_spell`, `prompt_companion`, etc. Each tool has a Zod input schema validated before side-effects.
   - `hasRollDelegation()` safeguard: if the GM writes "Fais un jet" / "Lance un dé" **without** calling `request_roll`, the turn is swallowed and the model is re-prompted. Same pattern is tested in `tests/unit/gm-roll-delegation.test.ts`.
5. **Persist GM message** (Postgres `messages` table).
6. **Fire-and-forget concierge** — `lib/ai/concierge.ts` reads the final narration via a second LLM call (with `jsonMode:true` on Ollama), extracts entities → Neo4j (with a stable UUID + `:APPEARS_IN` edge to the current `Session` node) and inventory/currency deltas → Postgres. Errors log via `console.warn('[concierge.*]')` in dev. **This is why Opus doesn't need `grant_item`/`adjust_currency` RÈGLE ABSOLUE anymore** — the janitor handles bookkeeping from prose. Campaign memory (`public.entities` Postgres table) has moved to Neo4j; the Postgres table is now DEPRECATED and no longer read or written.

### LLM provider abstraction (`lib/ai/llm/`)

`LLM_PROVIDER=anthropic|ollama` (default anthropic) selects a backend implementing the `LlmProvider` interface (`types.ts`). The two adapters (`anthropic.ts`, `ollama.ts`) translate between:
- Our `ChatMessage[]` (user / assistant / tool) and each backend's native format
- `ToolDef` (`inputSchema`) ↔ Anthropic `input_schema` ↔ Ollama OpenAI-style `function.parameters`
- `toolCalls[]` + `stopReason` ↔ Anthropic content blocks ↔ Ollama `tool_calls`

`modelFor(role)` resolves per-role defaults with env overrides. Current tiers:

| Role | Anthropic | Ollama |
|---|---|---|
| BUILDER (persona-suggest) | claude-haiku-4-5 | gemma4:31b |
| GM (runGmTurn) | **claude-opus-4-7** | gemma4:26b |
| COMPANION (respondAsCompanion) | claude-haiku-4-5 | gemma4:26b |
| UTIL (concierge, rolling summary) | claude-haiku-4-5 | gemma4:e2b |

Ollama mode is **experimental, dev-only**, not production-ready — localhost is not reachable from Vercel, and tool support / JSON reliability vary per model. The `LlmError` union (`model_no_tool_support`, `ollama_unreachable`, `model_missing`, `bad_response`, `provider_error`) surfaces actionable hints.

### Companion reply flow

The GM tool `prompt_companion` calls `respondAsCompanion()` in `lib/ai/companion-agent.ts` — one-shot call with the companion's `persona` as system prompt, last 6 messages as context. The companion's message is persisted as `author_kind='character'`, and the client then fires a follow-up SSE with `?trigger=companion_spoke` so the GM can react.

### Data boundaries

- `lib/db/server.ts` exports two clients. `createSupabaseServerClient()` uses cookies + anon key → **RLS-scoped to the current user**. `createSupabaseServiceClient()` bypasses RLS → **only for server-internal work that tenant-guard already verifies**.
- `lib/db/types.ts` is the hand-written row-type source of truth (not generated). Keep in sync with migrations.
- `supabase/migrations/*.sql` must be applied in timestamp order; `supabase/bootstrap.sql` is a concatenation for a cold-start run via SQL Editor. Regenerate with `cat supabase/migrations/*.sql > supabase/bootstrap.sql` after adding a migration.

### Testing notes

- Vitest tests mock the LLM at `vi.mock('../../lib/ai/llm', …)` — not at the SDK boundary. Mock must return `{ text, toolCalls: [], stopReason: 'end_turn' }`.
- Rules tests live in `lib/rules/__tests__/` and are pure — no mocking needed.
- Playwright e2e uses `tests/e2e/helpers/auth.ts` for test-user provisioning via Supabase admin + the `/api/test/login` cookie stamp.

## When adding a new GM tool

1. Declare the tool in `lib/ai/tools.ts` (`ToolDef` with `inputSchema`).
2. Add a Zod schema + case in `executeTool()` in `lib/ai/gm-agent.ts`.
3. If the tool mutates state using an id from the LLM, tenant-guard it first (`characterInSession`, `combatantBelongsToSession`).
4. If the tool has a side-effect the concierge would duplicate (inventory/currency), think about ordering — concierge runs AFTER the turn from the final narration, so mid-turn tool calls remain the source of truth for that same turn.
5. Update the GM system prompt in `gm-agent.ts` only if the new behavior is non-obvious from the tool description. Keep the prompt short — it's sent every turn.
