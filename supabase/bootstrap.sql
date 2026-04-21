-- ============================================================================
-- Initial schema for D&D 5e platform
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles — one row per authenticated user
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- campaigns
-- ----------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  setting_mode text not null check (setting_mode in ('homebrew', 'module', 'generated')),
  setting_pitch text,
  module_id text,
  world_summary text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_owner_idx on public.campaigns(owner_id);

-- ----------------------------------------------------------------------------
-- characters
-- ----------------------------------------------------------------------------
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  is_ai boolean not null default false,

  name text not null check (char_length(name) between 1 and 80),
  species text not null,
  class text not null,
  subclass text,
  background text,
  alignment text,
  level int not null default 1 check (level between 1 and 20),

  -- Ability scores
  str int not null default 10 check (str between 1 and 30),
  dex int not null default 10 check (dex between 1 and 30),
  con int not null default 10 check (con between 1 and 30),
  int_score int not null default 10 check (int_score between 1 and 30),
  wis int not null default 10 check (wis between 1 and 30),
  cha int not null default 10 check (cha between 1 and 30),

  -- Derived (server-calculated)
  max_hp int not null default 0,
  current_hp int not null default 0,
  temp_hp int not null default 0 check (temp_hp >= 0),
  ac int not null default 10,
  speed int not null default 9,

  -- JSONB structures
  proficiencies jsonb not null default '{}'::jsonb,
  features jsonb not null default '[]'::jsonb,
  inventory jsonb not null default '[]'::jsonb,
  spells_known jsonb not null default '[]'::jsonb,
  spell_slots jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  death_saves jsonb not null default '{"successes":0,"failures":0,"stable":false,"dead":false}'::jsonb,
  concentration jsonb not null default '{"active":false,"spellName":null,"level":null}'::jsonb,
  exhaustion int not null default 0 check (exhaustion between 0 and 6),

  -- Persona for AI companions + identity
  persona jsonb,
  portrait_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index characters_campaign_idx on public.characters(campaign_id);
create index characters_owner_idx on public.characters(owner_id);

-- ----------------------------------------------------------------------------
-- sessions
-- ----------------------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  session_number int not null,
  title text,
  summary text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (campaign_id, session_number)
);

create index sessions_campaign_idx on public.sessions(campaign_id);

-- campaigns.current_session_id refers to sessions — add after sessions exists
alter table public.campaigns
  add column current_session_id uuid references public.sessions(id) on delete set null;

-- ----------------------------------------------------------------------------
-- messages — chat transcript per session
-- ----------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  author_kind text not null check (author_kind in ('user', 'gm', 'character', 'system')),
  author_id uuid,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index messages_session_created_idx on public.messages(session_id, created_at);

-- ----------------------------------------------------------------------------
-- dice_rolls — audit log for every server-side roll
-- ----------------------------------------------------------------------------
create table public.dice_rolls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  roll_kind text not null check (roll_kind in ('attack','damage','save','check','initiative','death_save','concentration','hit_die')),
  expression text not null,
  raw_dice int[] not null,
  modifier int not null default 0,
  total int not null,
  advantage text not null default 'normal' check (advantage in ('normal','advantage','disadvantage')),
  dc int,
  target_ac int,
  outcome text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index dice_rolls_session_created_idx on public.dice_rolls(session_id, created_at);

-- ----------------------------------------------------------------------------
-- combat_encounters
-- ----------------------------------------------------------------------------
create table public.combat_encounters (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  status text not null default 'active' check (status in ('active','ended')),
  round int not null default 1,
  current_turn_index int not null default 0,
  initiative_order jsonb not null default '[]'::jsonb,
  combatants jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index combat_session_idx on public.combat_encounters(session_id);

-- ----------------------------------------------------------------------------
-- entities — Neo4j node cache / lookup
-- ----------------------------------------------------------------------------
create table public.entities (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  kind text not null check (kind in ('npc','location','faction','item','quest','event')),
  name text not null,
  short_description text,
  neo4j_node_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index entities_campaign_kind_idx on public.entities(campaign_id, kind);

-- ----------------------------------------------------------------------------
-- generated_assets — image storage pointer
-- ----------------------------------------------------------------------------
create table public.generated_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  kind text not null check (kind in ('scene','portrait','map','item')),
  prompt text not null,
  storage_path text not null,
  entity_id uuid references public.entities(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute procedure public.touch_updated_at();
create trigger campaigns_touch before update on public.campaigns
  for each row execute procedure public.touch_updated_at();
create trigger characters_touch before update on public.characters
  for each row execute procedure public.touch_updated_at();
create trigger entities_touch before update on public.entities
  for each row execute procedure public.touch_updated_at();
-- ============================================================================
-- RLS policies — users see/write only their own campaign data
-- ============================================================================

-- Helper: returns true if the current auth.user owns the given campaign.
create or replace function public.owns_campaign(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campaigns
    where id = cid and owner_id = auth.uid()
  );
$$;

-- Helper: returns campaign_id for a session id (cached lookup).
create or replace function public.campaign_of_session(sid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select campaign_id from public.sessions where id = sid;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());

create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- No insert/delete policies: trigger inserts, cascade handles delete.

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
alter table public.campaigns enable row level security;

create policy campaigns_owner_all on public.campaigns
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- characters
-- ---------------------------------------------------------------------------
alter table public.characters enable row level security;

create policy characters_via_campaign on public.characters
  for all using (owns_campaign(campaign_id)) with check (owns_campaign(campaign_id));

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
alter table public.sessions enable row level security;

create policy sessions_via_campaign on public.sessions
  for all using (owns_campaign(campaign_id)) with check (owns_campaign(campaign_id));

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
alter table public.messages enable row level security;

create policy messages_via_session on public.messages
  for all using (owns_campaign(campaign_of_session(session_id)))
  with check (owns_campaign(campaign_of_session(session_id)));

-- ---------------------------------------------------------------------------
-- dice_rolls
-- ---------------------------------------------------------------------------
alter table public.dice_rolls enable row level security;

-- Read-only for clients: server (service role) writes, clients only see them.
create policy dice_rolls_read_via_session on public.dice_rolls
  for select using (owns_campaign(campaign_of_session(session_id)));

-- ---------------------------------------------------------------------------
-- combat_encounters
-- ---------------------------------------------------------------------------
alter table public.combat_encounters enable row level security;

create policy combat_read_via_session on public.combat_encounters
  for select using (owns_campaign(campaign_of_session(session_id)));

-- ---------------------------------------------------------------------------
-- entities
-- ---------------------------------------------------------------------------
alter table public.entities enable row level security;

create policy entities_via_campaign on public.entities
  for all using (owns_campaign(campaign_id)) with check (owns_campaign(campaign_id));

-- ---------------------------------------------------------------------------
-- generated_assets
-- ---------------------------------------------------------------------------
alter table public.generated_assets enable row level security;

create policy assets_via_campaign on public.generated_assets
  for select using (owns_campaign(campaign_id));
-- Bourse D&D 5e : cuivre, argent, électrum, or, platine.
-- Stockée comme JSONB pour rester en phase avec inventory + conditions.
alter table public.characters
  add column if not exists currency jsonb not null
  default '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb;
-- Cap DB-side sur la taille des messages + du résumé de session :
-- évite un texte LLM boucle qui saturerait la table.
-- 16 KB par message couvre largement une narration Opus détaillée.
alter table public.messages
  add constraint messages_content_len check (char_length(content) <= 16384);

-- session.summary est généré par Haiku, pas par l'utilisateur. 8 KB suffit.
alter table public.sessions
  add constraint sessions_summary_len check (summary is null or char_length(summary) <= 8192);

-- campaigns.world_summary est composé serveur ; 16 KB permet les modules les plus denses.
alter table public.campaigns
  add constraint campaigns_world_summary_len check (
    world_summary is null or char_length(world_summary) <= 16384
  );
