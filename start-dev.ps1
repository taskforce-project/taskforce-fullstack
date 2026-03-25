# ===============================
# Script de démarrage Docker DEV
# ===============================

Write-Host "🐳 Démarrage de l'environnement Taskforce (DEV)" -ForegroundColor Cyan
Write-Host ""

# Vérifier que Docker est démarré
$dockerRunning = docker info 2>$null
if (-not $dockerRunning) {
    Write-Host "❌ Docker n'est pas démarré. Veuillez démarrer Docker Desktop." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Docker est démarré" -ForegroundColor Green

# Se placer à la racine du projet
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Vérifier les fichiers nécessaires
if (-not (Test-Path "docker-compose.dev.yml")) {
    Write-Host "❌ Fichier docker-compose.dev.yml introuvable" -ForegroundColor Red
    exit 1
}

# Demander confirmation pour nettoyer les volumes (optionnel)
Write-Host ""
Write-Host "Voulez-vous nettoyer les volumes existants ? (y/N)" -ForegroundColor Yellow
$clean = Read-Host
if ($clean -eq "y" -or $clean -eq "Y") {
    Write-Host "🧹 Nettoyage des volumes..." -ForegroundColor Yellow
    docker-compose -f docker-compose.dev.yml down -v
}

Write-Host ""
Write-Host "🚀 Démarrage des services..." -ForegroundColor Cyan
docker-compose -f docker-compose.dev.yml up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Services démarrés avec succès !" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Services disponibles :" -ForegroundColor Cyan
    Write-Host "  - Frontend:         http://localhost:3000" -ForegroundColor White
    Write-Host "  - API Backend:      http://localhost:8080/api" -ForegroundColor White
    Write-Host "  - Swagger UI:       http://localhost:8080/api/swagger-ui.html" -ForegroundColor White
    Write-Host "  - Keycloak Admin:   http://localhost:8180 (admin/admin)" -ForegroundColor White
    Write-Host "  - pgAdmin:          http://localhost:5050 (admin@taskforce.dev/admin)" -ForegroundColor White
    Write-Host "  - PostgreSQL:       localhost:5432 (postgres/PostgreSQLP54!)" -ForegroundColor White
    Write-Host ""
    Write-Host "📊 Voir les logs :" -ForegroundColor Cyan
    Write-Host "  docker-compose -f docker-compose.dev.yml logs -f" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🛑 Arrêter les services :" -ForegroundColor Cyan
    Write-Host "  docker-compose -f docker-compose.dev.yml down" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Erreur lors du démarrage des services" -ForegroundColor Red
    Write-Host "Consultez les logs avec : docker-compose -f docker-compose.dev.yml logs" -ForegroundColor Yellow
    exit 1
}
