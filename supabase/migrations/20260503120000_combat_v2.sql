-- ----------------------------------------------------------------------------
-- combat_v2 — server-authoritative combat
-- ----------------------------------------------------------------------------
-- The previous schema stored every combatant (PC, companion, NPC) in a single
-- `combatants` JSONB column, mirroring PC HP between `characters` and the
-- encounter row with eventual consistency. This migration switches to:
--   - `npcs` JSONB (only enemies live here; PC HP is read from `characters`)
--   - `participants_order` JSONB (initiative order with `kind` discriminator)
--   - `version` int (optimistic CAS to prevent race conditions on JSONB writes)
--
-- Any active encounters at deploy time are forcibly ended — combat state is
-- ephemeral and there is no production fleet to gracefully migrate.

-- Close any in-flight encounters so we don't have to backfill the new shape.
update public.combat_encounters
set status = 'ended', ended_at = coalesce(ended_at, now())
where status = 'active';

alter table public.combat_encounters
  rename column combatants to npcs;

alter table public.combat_encounters
  add column participants_order jsonb not null default '[]'::jsonb,
  add column version int not null default 0;

-- initiative_order is superseded by participants_order (which carries `kind`).
alter table public.combat_encounters
  drop column initiative_order;

comment on column public.combat_encounters.npcs is
  'JSONB array of {id, name, ac, currentHP, maxHP, dexMod, conditions[]}. NPCs only — PC/companion HP is read from characters table.';
comment on column public.combat_encounters.participants_order is
  'JSONB array of {id, kind: pc|companion|npc, initiative, dexMod} sorted by initiative DESC. Drives turn cursor.';
comment on column public.combat_encounters.version is
  'Monotonic counter for optimistic concurrency control. Mutations bump it via CAS.';
