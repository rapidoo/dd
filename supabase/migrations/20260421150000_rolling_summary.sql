-- Sliding context compaction : la colonne `summary` stocke désormais le
-- résumé roulant (plus seulement le résumé de fin). `summary_cursor` pointe
-- vers le dernier message couvert, pour savoir quand regénérer.
alter table public.sessions
  add column if not exists summary_cursor uuid references public.messages(id) on delete set null;

comment on column public.sessions.summary is
  'Rolling summary — couvre l''histoire jusqu''à summary_cursor. Généré par Haiku.';
comment on column public.sessions.summary_cursor is
  'ID du dernier message inclus dans summary. NULL si aucun résumé encore généré.';
