# scripts/

Scripts utilitaires, **séparés par responsabilité**. **Entrée unique : `make <cible>`** (depuis la racine).
Alternatives : le menu interactif **`..\tf.ps1`** (`make menu`) ou l'appel direct d'un script.

| Script | Responsabilité | Actions |
| ------ | -------------- | ------- |
| `_lib.ps1` | Helpers partagés (dot-sourcé) | détection `docker compose`, couleurs, env-files, URLs |
| `docker.ps1` | Orchestration Docker | `setup up upd down restart rebuild logs prod-up prod-down prod-rebuild obs obs-down ps urls clean` |
| `quality.ps1` | Tests / qualité | `test-fe cov-fe test-be cov-be lint build-fe build-be` |
| `security-scan.ps1` | Scans sécurité + rapports (JSON/HTML/SARIF) | `-Images -Source -Static -Severity HIGH` |
| `db.ps1` | Base & shells (conteneurs dev) | `psql sh-be sh-kc` |
| `update-readme-badges.ps1` | Utilitaire : maj des badges de version du README | — |

## Documentation générée et vérifiée (`*.mjs`)

Ces scripts **produisent ou contrôlent** des documents de `taskforce-docs/`. Ils existent pour une
raison unique : une consigne écrite « pense à régénérer ce diagramme » dérive toujours, un script non.

| Script | Responsabilité | Source de vérité |
| ------ | -------------- | ---------------- |
| `generate-schema-docs.mjs` | Régénère `Modele_Donnees_MCD_MLD.md` et `Dictionnaire_Donnees.md` | La base **réelle** (`information_schema` via `docker exec psql`) |
| `generate-class-diagram.mjs` | Régénère `Diagramme_Classes_UML.md` | Les sources annotées `@Entity` |
| `check-mermaid.mjs` | Vérifie que **tous** les blocs ` ```mermaid ` du corpus sont parsables | Les documents eux-mêmes |
| `lib/domaines.mjs` | Classification métier partagée par les deux générateurs | — |

```bash
node scripts/generate-schema-docs.mjs            # régénère (--check pour vérifier sans écrire)
node scripts/generate-class-diagram.mjs
npm i --no-save mermaid jsdom                    # dépendances du contrôle, non enregistrées
node scripts/check-mermaid.mjs                   # sortie 0 si tout rend, 1 sinon
```

> **Pourquoi `check-mermaid.mjs`** : un diagramme Mermaid invalide **n'échoue pas bruyamment**. Obsidian
> et GitHub affichent un cadre vide ou le code brut, le document paraît complet, et personne ne s'en
> aperçoit avant qu'un lecteur n'ouvre la page. Ce contrôle transforme une défaillance silencieuse en
> code de sortie. Les générateurs, eux, portent des **gardes bloquantes** (table non classée, entité
> orpheline) plutôt que d'ignorer silencieusement ce qu'ils ne savent pas traiter.

> Les anciens scripts bash (`*.sh`) et les doublons à la racine (`docker.ps1`, `dev-docker.*`, `start-dev.*`,
> `stop-dev.ps1`, `init-dev.ps1`, `prod-docker.ps1`) ont été **consolidés ici**. Cross-platform : utiliser le `Makefile`.

## Lancer

```bash
make help                 # liste des cibles (entrée unique)
make dev-up               # = scripts/docker.ps1 up
make test-be              # = scripts/quality.ps1 test-be
make menu                 # ouvre le menu interactif tf.ps1
```

```powershell
# Alternatives directes (Windows)
.\tf.ps1                      # menu interactif
.\scripts\docker.ps1 up       # script directement
```

> Toute la logique vit dans ces scripts ; le **Makefile** (entrée) et **`tf.ps1`** (menu) ne font que
> **choisir et lancer** ces scripts. Prérequis Windows : `choco install make`.
