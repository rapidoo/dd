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
