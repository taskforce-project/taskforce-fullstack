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
