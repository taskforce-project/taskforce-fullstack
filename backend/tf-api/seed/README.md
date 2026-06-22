# Seed de démo — TaskForce

`dev_seed.sql` peuple un **workspace de démo réaliste** rattaché à `admin@taskforce.dev`
(le « CEO »), pour tester Smart Assign, l'UI/UX, les rôles, les équipes, etc.

## Contenu

- **Workspace** `taskforce-demo` (« TaskForce HQ »), owner = admin.
- **8 coéquipiers** avec profils de compétences variés (Sarah/Frontend, Marcus/Backend,
  Aïcha/Fullstack, Tom/DevOps, Lina/Design, Omar/QA, Nina/Data-IA, Diego/Junior).
- **3 projets** : Web Application (WEB), API Platform (API), Infrastructure (OPS) — chacun
  avec statuts/types/labels + membres.
- **22 issues** : story points, priorités, statuts variés, labels qui matchent les compétences,
  et **beaucoup de non assignées** pour tester Smart Assign.
- **3 équipes** (Frontend Guild / Backend Guild / Platform & QA) associées aux projets.
- **Historique d'assignations** (`assignment_events`) → alimente le score historique.

## Lancer

> Prérequis : migrations Flyway appliquées (le backend a démarré au moins une fois) — `admin@taskforce.dev` doit exister.

**Windows / PowerShell** (méthode robuste, gère l'UTF-8 — accents + emojis) :

```powershell
docker cp backend/tf-api/seed/dev_seed.sql taskforce-postgres-dev:/tmp/dev_seed.sql
docker exec taskforce-postgres-dev psql -U postgres -d taskforce-db -f /tmp/dev_seed.sql
```

> ⚠️ PowerShell ne supporte pas la redirection `<`. Utiliser `docker cp` + `psql -f` ci-dessus.
> Sous bash/Linux/macOS, `docker exec -i taskforce-postgres-dev psql -U postgres -d taskforce-db < backend/tf-api/seed/dev_seed.sql` marche aussi.

(adapter le nom du conteneur / db / user si modifiés dans `docker-compose.dev.yml` :
conteneur `taskforce-postgres-dev`, db `taskforce-db`, user `postgres`.)

## Re-run / modifier

Le script est **idempotent** : il supprime le workspace `taskforce-demo` (cascade) puis le
reconstruit. On peut donc éditer `dev_seed.sql` (ajouter des membres, issues, compétences…)
et relancer la même commande autant de fois qu'on veut. Les comptes coéquipiers (table `users`)
sont upsert par email et persistent entre les runs.

## Notes

- Les coéquipiers sont **data-only** (pas de comptes Keycloak) : on se connecte en tant
  qu'`admin@taskforce.dev` et on les voit comme équipe / candidats Smart Assign. Ils ne peuvent
  pas se connecter eux-mêmes. (Pour des comptes connectables, voir `user01..user10@taskforce.dev`
  créés par la migration V31, mot de passe Keycloak `Taskforce@2024`.)
- Les avatars sont générés automatiquement (DiceBear, seedé sur l'email) — cohérent avec PROD-3.8.
- Après le seed, dans l'app : switcher vers le workspace **TaskForce HQ**.
