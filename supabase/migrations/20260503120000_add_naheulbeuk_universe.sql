-- Extend universe column to allow 'naheulbeuk' alongside 'dnd5e' and 'witcher'.
-- The Donjon de Naheulbeuk universe is a parodic D&D 5e adaptation
-- (Terre de Fangh, Zangdar, Compagnie de Naheulbeuk).

alter table public.campaigns
  drop constraint if exists campaigns_universe_check;

alter table public.campaigns
  add constraint campaigns_universe_check
  check (universe in ('dnd5e', 'witcher', 'naheulbeuk'));
