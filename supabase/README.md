# Supabase — bootstrap d'une base depuis zéro

Si tu dois recréer la base (nouveau projet Supabase, branche de dev, reset
complet), voici la procédure.

## Ordre d'application

Les migrations sont datées et doivent être appliquées dans l'ordre
chronologique :

| # | Fichier | Contenu |
|---|---|---|
| 1 | `migrations/20260420120000_init_schema.sql` | 9 tables (profiles, campaigns, characters, sessions, messages, dice_rolls, combat_encounters, entities, generated_assets), triggers `updated_at`, trigger `handle_new_user` |
| 2 | `migrations/20260420120100_rls_policies.sql` | RLS activé partout + policies basées sur `owns_campaign(campaign_id)` |
| 3 | `migrations/20260421090000_add_currency.sql` | Ajoute la colonne `currency` JSONB sur `characters` |
| 4 | `migrations/20260421130000_message_cap.sql` | Cap 16 KB sur `messages.content` + `campaigns.world_summary`, 8 KB sur `sessions.summary` (anti-blob-abuse) |

## Procédure rapide (Dashboard)

1. Supabase Dashboard → **SQL Editor** → **New query**
2. Ouvre `bootstrap.sql` (généré à partir des migrations) et copie tout
3. Colle dans l'éditeur → **Run**
4. Vérifie avec `node scripts/verify-db.mjs` depuis la racine du projet ;
   tu dois voir les 9 tables avec 0 rows

## Procédure via CLI (si tu as les droits sur l'org Supabase)

```bash
supabase link --project-ref <ref>
supabase db push
```

## Convention

- Toute nouvelle migration va dans `migrations/YYYYMMDDHHMMSS_description.sql`
- Idempotente dès que possible (`if not exists`, `create or replace`, `alter ... if exists`)
- Met à jour `bootstrap.sql` en concaténant les migrations
- Documente ici la ligne de tableau correspondante

## Régénérer `bootstrap.sql`

```bash
cat supabase/migrations/*.sql > supabase/bootstrap.sql
```

## Secrets

Aucun secret dans ces fichiers. Les clés API vivent uniquement dans
`.env.local` (git-ignored) et dans les variables d'environnement
Vercel / CI.
