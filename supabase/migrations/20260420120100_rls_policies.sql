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
