# ============================================================
#  scripts/docker.ps1 — orchestration Docker (dev / prod / outils)
#  Usage : .\scripts\docker.ps1 <action> [service]
#  Actions : setup up upd down restart rebuild logs prod-up prod-down
#            prod-rebuild obs obs-down ps urls clean
# ============================================================
param(
  [Parameter(Position=0, Mandatory=$true)][string]$Action,
  [Parameter(Position=1)][string]$Service
)
. "$PSScriptRoot\_lib.ps1"

switch ($Action) {
  'setup' {
    Run 'setup dev'
    if (-not (Test-Path 'backend/tf-api/.env.dev')) {
      Copy-Item 'backend/tf-api/.env.dev.example' 'backend/tf-api/.env.dev'
      Ok '.env.dev cree depuis .env.dev.example'
    } else { Info '.env.dev existe deja' }
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { Ok 'Docker est demarre.' } else { Warn 'Docker ne semble pas demarre.' }
  }
  'setup-prod' {
    Run 'setup prod'
    if (-not (Test-Path 'backend/tf-api/.env.prod')) {
      Copy-Item 'backend/tf-api/.env.prod.example' 'backend/tf-api/.env.prod'
      Warn '.env.prod cree depuis .env.prod.example -> RENSEIGNE les vraies valeurs !'
    } else { Info '.env.prod existe deja' }
  }
  'up'       { Run 'dev up (premier plan)'; Invoke-Compose ($DEV + (DevEnv) + @('up')) }
  'upd'      { Run 'dev up -d';             Invoke-Compose ($DEV + (DevEnv) + @('up','-d')); Show-Urls }
  'down'     { Run 'dev down';              Invoke-Compose ($DEV + @('down')) }
  'restart'  { Run 'dev restart';           Invoke-Compose ($DEV + @('down')); Invoke-Compose ($DEV + (DevEnv) + @('up','-d')) }
  'rebuild'  { Run 'dev rebuild';           Invoke-Compose ($DEV + @('build','--no-cache')); Invoke-Compose ($DEV + (DevEnv) + @('up','-d')) }
  'build'    { Run 'dev build --no-cache';  Invoke-Compose ($DEV + @('build','--no-cache')) }
  'clean-dev'{ Run 'dev down -v';           Invoke-Compose ($DEV + @('down','-v')) }
  'logs'     { if ($Service) { Invoke-Compose ($DEV + @('logs','-f',$Service)) } else { Invoke-Compose ($DEV + @('logs','-f')) } }

  'prod-up'      { Run 'prod up -d';   Invoke-Compose ($PROD + (ProdEnv) + @('up','-d')) }
  'prod-down'    { Run 'prod down';    Invoke-Compose ($PROD + @('down')) }
  'prod-rebuild' { Run 'prod rebuild'; Invoke-Compose ($PROD + @('build','--no-cache')); Invoke-Compose ($PROD + (ProdEnv) + @('up','-d')) }
  'prod-clean'   { Run 'prod down -v';  Invoke-Compose ($PROD + @('down','-v')) }

  'obs'      { Run 'tools observability up -d'; Invoke-Compose ($TOOLS + @('--profile','observability','up','-d')); Ok 'SigNoz : http://localhost:3301' }
  'obs-down' { Run 'tools observability down';  Invoke-Compose ($TOOLS + @('--profile','observability','down')) }

  'ps'   { Run 'conteneurs taskforce'; docker ps -a --filter 'name=taskforce' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' }
  'urls' { Show-Urls }
  'clean' {
    Warn 'Supprime conteneurs + volumes (dev & prod) + prune. Continuer ? (o/N)'
    $r = Read-Host
    if ($r -eq 'o' -or $r -eq 'O') {
      Invoke-Compose ($DEV + @('down','-v')); Invoke-Compose ($PROD + @('down','-v')); docker system prune -f
      Ok 'Nettoyage termine.'
    } else { Info 'Annule.' }
  }
  default { Warn "Action docker inconnue : $Action" }
}
