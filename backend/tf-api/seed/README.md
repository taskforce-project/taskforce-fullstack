# Seed de démo — TaskForce

`dev_seed.sql` peuple un **workspace de démo réaliste** rattaché à `admin@taskforce.dev`
(le « CEO »), pour tester Smart Assign, l'UI/UX, les rôles, les équipes, etc.

## Contenu (seed QA complet — couvre tous les écrans)

- **Workspace** `taskforce-demo` (« TaskForce HQ »), owner = admin.
- **8 coéquipiers** avec profils compétences (capacité h/sem + séniorité + growth ciblé pour Diego).
- **3 projets** (WEB / API / OPS) avec statuts/types/labels + membres.
- **27 issues** : tous statuts (dont **Cancelled**), toutes priorités (dont **URGENT**), story points,
  **dates en retard / dues demain / futures**, descriptions, **sous-tâches** (épopée WEB-11), labels,
  beaucoup de non-assignées (Smart Assign).
- **Sous-ressources d'issue** : commentaires (dont **@mention**), **checklist**, **relations** (blocks/relates),
  **worklogs** (time tracking).
- **3 cycles** WEB (terminé / **actif** pour le burndown / brouillon) + issues du sprint actif.
- **Notifications** (inbox admin) : assigned/mention/commented/dueSoon/overdue/statusChanged/overload, mix lu/non-lu.
- **Favoris projet**, **pages** (doc projet), **invitations en attente** (email sans compte).
- **Abonnement PRO** (admin) + **historique** Stripe → page Billing peuplée *sans Stripe réel*.
- **Demandes Enterprise** (sales).
- **3 équipes** + association projets · **historique d'assignations** (score Smart Assign).

> ⚠️ Requiert les migrations **V41→V48** appliquées (rebuild backend récent).
> Le flux Stripe *réel* (checkout depuis la landing / portail) nécessite tes **vraies clés Stripe** (config `.env`) — le seed ne couvre que l'affichage de l'abonnement.

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
