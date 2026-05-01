-- Add universe column to campaigns table
-- Universe determines the game system: dnd5e or witcher

alter table public.campaigns
add column universe text not null default 'dnd5e' check (universe in ('dnd5e', 'witcher'));

create index campaigns_universe_idx on public.campaigns(universe);
