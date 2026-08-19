# ============================================================
#  scripts/_lib.ps1 — helpers partages (a dot-sourcer)
#  . "$PSScriptRoot\_lib.ps1"
# ============================================================

# Racine du repo = parent du dossier scripts/
$script:RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $script:RepoRoot
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# Detection de la commande compose (v2 "docker compose" sinon v1 "docker-compose")
$script:DkExe = 'docker'
$script:DkPre = @('compose')
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { $script:DkExe = 'docker-compose'; $script:DkPre = @() }

$script:DEV   = @('-f','docker-compose.dev.yml')
$script:PROD  = @('-f','docker-compose.prod.yml')
$script:TOOLS = @('-f','docker-compose.tools.yml')

function Invoke-Compose([string[]]$A) { & $script:DkExe @($script:DkPre + $A) }
function DevEnv  { if (Test-Path 'backend/tf-api/.env.dev')  { @('--env-file','backend/tf-api/.env.dev') }  else { @() } }
function ProdEnv { if (Test-Path 'backend/tf-api/.env.prod') { @('--env-file','backend/tf-api/.env.prod') } else { @() } }

function Run($m)  { Write-Host "`n> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  $m" -ForegroundColor Yellow }
function Info($m) { Write-Host "  $m" -ForegroundColor Gray }

function Show-Urls {
  Write-Host ''
  Write-Host '  URLs (dev)' -ForegroundColor Cyan
  Info 'Frontend   http://localhost:3000'
  Info 'Landing    http://localhost:18081'
  Info 'Backend    http://localhost:8080/api'
  Info 'Swagger    http://localhost:8080/api/swagger-ui.html'
  Info 'Keycloak   http://localhost:8180'
  Info 'pgAdmin    http://localhost:5050'
  Info 'MinIO      http://localhost:9001'
  Info 'RabbitMQ   http://localhost:15672'
  Info 'SigNoz     http://localhost:3301'
}
