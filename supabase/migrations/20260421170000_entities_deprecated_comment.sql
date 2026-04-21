-- La mémoire de campagne (PNJ, lieux, factions, objets, quêtes, événements)
-- est désormais stockée dans Neo4j comme source de vérité. Cette table reste
-- en place pour rollback, mais n'est plus écrite ni lue par l'application.
-- Une migration future la supprimera une fois la stabilité confirmée.
comment on table public.entities is
  'DEPRECATED — entity memory moved to Neo4j (see lib/neo4j/queries.ts). Kept for rollback; drop in a future migration.';
