# ============================================================
#  scripts/db.ps1 — acces base de donnees & shells conteneurs (dev)
#  Usage : .\scripts\db.ps1 <action>
#  Actions : psql  sh-be  sh-kc
# ============================================================
param([Parameter(Position=0, Mandatory=$true)][string]$Action)
. "$PSScriptRoot\_lib.ps1"

switch ($Action) {
  'psql'  { Run 'psql -> taskforce-postgres-dev'; docker exec -it taskforce-postgres-dev psql -U postgres -d taskforce_dev }
  'sh-be' { Run 'shell -> taskforce-backend-dev';  docker exec -it taskforce-backend-dev sh }
  'sh-kc' { Run 'shell -> taskforce-keycloak-dev'; docker exec -it taskforce-keycloak-dev sh }
  default { Warn "Action db inconnue : $Action" }
}
