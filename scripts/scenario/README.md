# Scénario — faire vivre un projet pour alimenter le Brain OS

Joue la vie complète d'un projet (issues → cycles → avancement → clôture) **via la vraie API REST**,
et vérifie que le Brain OS s'est rempli tout seul.

```powershell
.\scripts\db.ps1 seed              # base propre (DROP + rebuild de taskforce-demo)
node .\scripts\scenario\play.mjs   # le projet prend vie
```

Le projet est recréé à l'identique à chaque fois. Pour rejouer sans re-seeder :

```powershell
node .\scripts\scenario\play.mjs --reset   # supprime le projet existant d'abord
```

## Pourquoi pas du SQL ?

C'est **la** raison d'être de ce script. Un `INSERT` ne traverse pas Spring : aucun service appelé,
aucun événement publié, aucun listener réveillé. C'est exactement pourquoi `dev_seed.sql` produit
267 issues et **zéro** node de Brain OS lié à un projet.

Ici chaque étape est un appel HTTP réel. `CycleService` et `IssueService` publient donc pour de vrai
leurs événements de transition, et `BrainIngestionListener` écrit les nodes. Ce n'est pas une fixture :
c'est le test end-to-end de l'ingestion. **Si le cerveau se remplit, c'est que ça marche.**

## Ce que le scénario produit

| Cycle | État final | Node écrit dans le Brain OS |
| --- | --- | --- |
| `Sprint 1 · Fondations` | clôturé (4/5 livrées) | `Rétro — Sprint 1 · Fondations (PORT)` — faits **+ synthèse Qwen** |
| `Sprint 2 · Facturation` | encore actif (2/4 livrées) | `Cycle en cours — Sprint 2 · Facturation (PORT)` — faits seuls, mis à jour à chaque issue terminée |

Les deux nodes sont en domaine `HISTORIQUE` (`16 · Historique des actions`), type `ACTION_OODA`,
rattachés à leur cycle (`refType=CYCLE`) et reliés au graphe par wikilink + tags.

## À savoir

- **À lancer après le seed** : `db.ps1 seed` DROP `taskforce-demo` en cascade et effacerait le projet.
- **L'ingestion est asynchrone** (`@Async` + génération LLM) : le script attend les nodes jusqu'à 90 s.
- **Le token passe par `node:http`, pas `fetch`** : l'API valide l'issuer `http://keycloak:8080/...`
  (`SecurityConfig` le dérive de `KEYCLOAK_URL`), alors qu'on tape `localhost:8180` depuis l'hôte. Il
  faut donc forcer l'en-tête `Host` — et undici, le client de `fetch`, l'ignore silencieusement.
- **Aucune dépendance npm** : Node ≥ 18 suffit.

## Configuration (variables d'environnement)

| Variable | Défaut |
| --- | --- |
| `API_URL` | `http://localhost:8080` |
| `WORKSPACE_SLUG` | `taskforce-demo` (= TaskForce HQ) |
| `TF_USER` / `TF_PASS` | `admin@taskforce.dev` / `Admin@2024` |
| `PROJECT_IDENTIFIER` | `PORT` |
| `KEYCLOAK_HOST` / `KEYCLOAK_PORT` | `localhost` / `8180` |
| `KEYCLOAK_ISSUER_HOST` | `keycloak:8080` |
