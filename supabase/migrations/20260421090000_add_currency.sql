-- Bourse D&D 5e : cuivre, argent, électrum, or, platine.
-- Stockée comme JSONB pour rester en phase avec inventory + conditions.
alter table public.characters
  add column if not exists currency jsonb not null
  default '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb;
