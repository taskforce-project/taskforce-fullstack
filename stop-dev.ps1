# ===============================
# Script d'arrêt Docker DEV
# ===============================

Write-Host "🛑 Arrêt de l'environnement Taskforce (DEV)" -ForegroundColor Cyan
Write-Host ""

# Se placer à la racine du projet
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Demander si on doit supprimer les volumes
Write-Host "Supprimer également les volumes (données) ? (y/N)" -ForegroundColor Yellow
$removeVolumes = Read-Host

if ($removeVolumes -eq "y" -or $removeVolumes -eq "Y") {
    Write-Host "🗑️  Arrêt et suppression des volumes..." -ForegroundColor Yellow
    docker-compose -f docker-compose.dev.yml down -v
} else {
    Write-Host "⏹️  Arrêt des services (volumes conservés)..." -ForegroundColor Yellow
    docker-compose -f docker-compose.dev.yml down
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Services arrêtés avec succès !" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Erreur lors de l'arrêt des services" -ForegroundColor Red
    exit 1
}
