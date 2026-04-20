# Instructions Claude Code

Ce projet est une plateforme de jeu de rôle D&D 5e avec agents IA.

## Documents de référence (à consulter avant toute feature)
- `spec.md` — architecture, schéma DB, workflows, roadmap
- `dnd5e_rules.md` — règles du jeu (formules, combat, magie, états)

## Workflow obligatoire
1. Lire les sections pertinentes des deux docs
2. Annoncer un plan court avant de coder
3. Tests vitest sur toute logique de règles (/lib/rules)
4. Pas de logique de règles côté client
5. Toute mutation passe par Server Action validée Zod
