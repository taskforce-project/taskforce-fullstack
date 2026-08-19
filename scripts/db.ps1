# ============================================================
#  scripts/db.ps1 — acces base de donnees & shells conteneurs (dev)
#  Usage : .\scripts\db.ps1 <action>
#  Actions : psql  seed  sh-be  sh-kc
# ============================================================
param([Parameter(Position=0, Mandatory=$true)][string]$Action)
. "$PSScriptRoot\_lib.ps1"

$script:PgContainer = 'taskforce-postgres-dev'
$script:DbName      = 'taskforce-db'

switch ($Action) {
  'psql'  { Run "psql -> $script:PgContainer"; docker exec -it $script:PgContainer psql -U postgres -d $script:DbName }

  # Charge le seed de DEMO en preservant l'UTF-8.
  # IMPORTANT : NE PAS faire `Get-Content seed.sql | docker exec -i ... psql`.
  # PowerShell ré-encode alors le flux vers la codepage OEM de la console et chaque
  # octet UTF-8 non representable devient « ? » (ex. « Itération » -> « It??ration »).
  # On copie donc le fichier brut dans le conteneur, puis on lance psql -f a l'interieur
  # (aucun pipe hote => encodage sur, quelle que soit la console).
  'seed'  {
    $seed = Join-Path $script:RepoRoot 'backend/tf-api/seed/dev_seed.sql'
    if (-not (Test-Path -LiteralPath $seed)) { Warn "Seed introuvable : $seed"; break }
    Run "seed -> $script:DbName ($script:PgContainer)"
    docker cp $seed "$($script:PgContainer):/tmp/dev_seed.sql"
    if ($LASTEXITCODE -ne 0) { Warn 'docker cp a echoue'; break }
    docker exec -e PGCLIENTENCODING=UTF8 $script:PgContainer psql -U postgres -d $script:DbName -v ON_ERROR_STOP=1 -f /tmp/dev_seed.sql
    if ($LASTEXITCODE -eq 0) { Ok 'Seed charge (UTF-8 preserve).' } else { Warn 'Seed en erreur (voir sortie psql).' }
    docker exec $script:PgContainer rm -f /tmp/dev_seed.sql 2>$null
  }

  'sh-be' { Run 'shell -> taskforce-backend-dev';  docker exec -it taskforce-backend-dev sh }
  'sh-kc' { Run 'shell -> taskforce-keycloak-dev'; docker exec -it taskforce-keycloak-dev sh }
  default { Warn "Action db inconnue : $Action (psql | seed | sh-be | sh-kc)" }
}
