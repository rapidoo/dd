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

`/app/api/sessions/[id]/stream/route.ts` is the SSE endpoint. One player input opens a single SSE stream; the **server orchestrator** (`lib/server/turn-orchestrator.ts`) drives a state machine that may chain multiple turns inside that stream — narrator, NPCs, companions — until the cursor lands back on the PC or combat ends.

1. **Auth + ownership check** — `supabase.auth.getUser()` then fetch `sessions.campaign_id` through RLS. A non-owner gets 404 (leaks nothing).
2. **Rate limit** — `lib/server/rate-limit.ts` sliding window, 20 player inputs/min/user. Each input may produce many turns; the limit is on connections, not turns.
3. **Debug shortcut** — `lib/ai/debug-mode.ts` intercepts `/debug <cmd>` messages in dev/preview only, skipping the LLM entirely for UI smoke tests.
4. **`runTurnLoop()` generator** (`lib/server/turn-orchestrator.ts`) dispatches each turn to the right agent based on the current combat state:
   - **NARRATIVE mode** (no active combat) → `runGmTurn()` (`lib/ai/gm-agent.ts`). Narrates, can call `start_combat` to enter combat.
   - **COMBAT mode + cursor on PC** → if user just spoke, narrator resolves their action; otherwise loop returns and waits for input.
   - **COMBAT mode + cursor on NPC** → `runNpcTurn()` (`lib/ai/npc-agent.ts`). Single-NPC scope, Haiku tier, picks a target and rolls.
   - **COMBAT mode + cursor on companion** → `respondAsCompanion()` (`lib/ai/companion-agent.ts`) called directly (not via the GM tool).
   - Each turn is bracketed by `turn_start` / `turn_end` events the route translates to SSE so the client renders distinct chat bubbles per author.
   - Cap: `MAX_DEPTH=12` chained turns per player input (defensive; a normal combat round is well below).
5. **Per-turn persistence** — the route handler accumulates each turn's deltas and writes one message row per turn at `turn_end`:
   - Narrator → `author_kind='gm'`.
   - NPC → `author_kind='character'`, `author_id=null`, `metadata.npc_name = …`.
   - Companion → persisted by `respondAsCompanion` itself (`author_kind='character'`, `author_id=<uuid>`).
6. **Fire-and-forget concierge** — `lib/ai/concierge.ts` reads the aggregated narration once everything settled, extracts entities → Neo4j and inventory/currency deltas → Postgres.

Shared tool executors (`lib/ai/tool-executors.ts`) — `executeRoll`, `executePassTurn`, `executeApplyCondition` — are used by every agent so dice rolls, condition application, and turn advancement go through the same tenant-guarded paths.

### Combat loop (server-authoritative)

`lib/server/combat-loop.ts` owns the encounter lifecycle. Agents only declare actions and roll dice; the server handles turn advancement, KO skip, and end-of-combat detection.

- `startEncounter` — rolls initiative for every PC/companion + provided NPCs, persists `combat_encounters` row with `participants_order` (kind-discriminated initiative list) and `npcs` JSONB. `version` int starts at 0 for optimistic CAS.
- `advanceUntilNextActor` — increments `current_turn_index`, skipping participants at 0 PV; on a round wrap, ticks every participant's conditions (PCs in their `characters.conditions`, NPCs in the `npcs` JSONB). Auto-calls `endEncounter` when `checkAllNpcsDown(state)`.
- `applyDamageToParticipant` — discriminates by `kind` from `participants_order`. NPCs mutate the `npcs` JSONB via `casUpdate` (reads version, increments, retries up to 3 times on conflict). PCs/companions write `characters.current_hp` directly — **no mirror in the encounter row**, `characters` is the source of truth.
- `applyConditionToParticipant` — same routing for conditions.
- `buildCombatState` — assembles the rich `CombatState` (round, currentTurnIndex, participants[]) by joining `npcs` JSONB with the `characters` rows for PC/companion entries. Emitted as the `combat_state` SSE event after every mutation; the client `<CombatTracker>` consumes it directly without refetching party rows.
- `executeRoll` (`tool-executors.ts`) auto-applies damage when `request_roll(kind=damage|heal, target_combatant_id=…)` is called, then triggers `advanceUntilNextActor`.

The two retired tools (`next_turn`, `end_combat`) are still in the sanitizer's `TOOL_NAMES` list so prose mentions are stripped from narration even if a model writes them.

### LLM provider abstraction (`lib/ai/llm/`)

`LLM_PROVIDER=anthropic|ollama` (default anthropic) selects a backend implementing the `LlmProvider` interface (`types.ts`). The two adapters (`anthropic.ts`, `ollama.ts`) translate between:
- Our `ChatMessage[]` (user / assistant / tool) and each backend's native format
- `ToolDef` (`inputSchema`) ↔ Anthropic `input_schema` ↔ Ollama OpenAI-style `function.parameters`
- `toolCalls[]` + `stopReason` ↔ Anthropic content blocks ↔ Ollama `tool_calls`

`modelFor(role)` resolves per-role defaults with env overrides. Current tiers:

| Role | Anthropic | Ollama |
|---|---|---|
| BUILDER (persona-suggest) | claude-haiku-4-5 | gemma4:31b |
| GM / NARRATOR (runGmTurn) | **claude-opus-4-7** | gemma4:26b |
| COMPANION (respondAsCompanion) | claude-haiku-4-5 | gemma4:26b |
| NPC (runNpcTurn) | claude-haiku-4-5 | gemma4:26b |
| UTIL (concierge, rolling summary) | claude-haiku-4-5 | gemma4:e2b |

Ollama mode is **experimental, dev-only**, not production-ready — localhost is not reachable from Vercel, and tool support / JSON reliability vary per model. The `LlmError` union (`model_no_tool_support`, `ollama_unreachable`, `model_missing`, `bad_response`, `provider_error`) surfaces actionable hints.

### Companion reply flow

Two paths invoke `respondAsCompanion()` in `lib/ai/companion-agent.ts`:

1. **In-combat (automatic)** — when the orchestrator's cursor lands on a companion, `runTurnLoop` calls `respondAsCompanion` directly. The companion picks a target and rolls via `request_roll`; the server advances the cursor.
2. **Narrative interaction (GM-triggered)** — out-of-combat, the narrator can call the `prompt_companion` tool to give a companion the floor. After the companion replies, the client fires a follow-up SSE with `?trigger=companion_spoke` so the narrator can react.

In both cases the companion's message is persisted as `author_kind='character'` with `author_id=<companion uuid>`.

### NPC turn flow

`lib/ai/npc-agent.ts:runNpcTurn` runs one NPC's turn during combat. The orchestrator passes it the current `Participant` entry (single NPC, name, AC, HP, conditions) plus the full combat state so the agent can pick a target. Tool set is minimal: `request_roll`, `apply_condition`, `pass_turn`. The narrator never plays NPCs — the prompt explicitly tells it to stay out of NPC turns.

NPC messages are persisted with `author_kind='character'`, `author_id=null`, and `metadata.npc_name` set so the UI can label the bubble.

### Data boundaries

- `lib/db/server.ts` exports two clients. `createSupabaseServerClient()` uses cookies + anon key → **RLS-scoped to the current user**. `createSupabaseServiceClient()` bypasses RLS → **only for server-internal work that tenant-guard already verifies**.
- `lib/db/types.ts` is the hand-written row-type source of truth (not generated). Keep in sync with migrations.
- `supabase/migrations/*.sql` must be applied in timestamp order; `supabase/bootstrap.sql` is a concatenation for a cold-start run via SQL Editor. Regenerate with `cat supabase/migrations/*.sql > supabase/bootstrap.sql` after adding a migration.

### Testing notes

- Vitest tests mock the LLM at `vi.mock('../../lib/ai/llm', …)` — not at the SDK boundary. Mock must return `{ text, toolCalls: [], stopReason: 'end_turn' }`.
- Rules tests live in `lib/rules/__tests__/` and are pure — no mocking needed.
- Playwright e2e uses `tests/e2e/helpers/auth.ts` for test-user provisioning via Supabase admin + the `/api/test/login` cookie stamp.

## When adding a new tool

1. Declare the tool in `lib/ai/tools.ts` (`ToolDef` with `inputSchema`). Decide which agent set(s) it belongs to: `NARRATOR_TOOLS`, `NPC_TOOLS`, `COMPANION_TOOLS`.
2. If the tool is shared between agents (e.g. another flavor of `request_roll`), add the executor to `lib/ai/tool-executors.ts`. Otherwise put the case in the agent that owns it (narrator's `executeTool` in `gm-agent.ts`, NPC's switch in `npc-agent.ts`, etc.).
3. Add a Zod schema next to the executor. Validate before any side-effect.
4. If the tool mutates state using an id from the LLM, tenant-guard it first (`characterInSession`, `combatantBelongsToSession`).
5. If the tool has a side-effect the concierge would duplicate (inventory/currency), think about ordering — concierge runs AFTER all turns from the aggregated narration, so mid-turn tool calls remain the source of truth.
6. Update the relevant system prompt only if the new behavior is non-obvious from the tool description. Keep prompts short — they're sent every turn.
