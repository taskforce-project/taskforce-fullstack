# ===============================
# SCRIPT D'INITIALISATION - DÉVELOPPEMENT
# ===============================

Write-Host "🚀 Initialisation de l'environnement de développement Taskforce" -ForegroundColor Green
Write-Host ""

# Vérifier si Docker est installé
Write-Host "📦 Vérification de Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker installé: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
    Write-Host "   Téléchargez Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Vérifier si docker-compose est installé
Write-Host "📦 Vérification de Docker Compose..." -ForegroundColor Yellow
try {
    $composeVersion = docker-compose --version
    Write-Host "✅ Docker Compose installé: $composeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose n'est pas installé" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📁 Configuration des fichiers d'environnement..." -ForegroundColor Yellow

# Créer .env.dev s'il n'existe pas
$envDevPath = "backend\tf-api\.env.dev"
if (-Not (Test-Path $envDevPath)) {
    Write-Host "   Création de .env.dev..." -ForegroundColor Cyan
    Copy-Item "backend\tf-api\.env.dev.example" $envDevPath
    Write-Host "   ✅ .env.dev créé" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  .env.dev existe déjà" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Initialisation terminée !" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Prochaines étapes:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Démarrer les services en développement:" -ForegroundColor White
Write-Host "   .\docker.ps1 dev-up" -ForegroundColor Yellow
Write-Host ""
Write-Host "2. Accéder aux services:" -ForegroundColor White
Write-Host "   - Backend API:    http://localhost:8081/api" -ForegroundColor Cyan
Write-Host "   - Swagger UI:     http://localhost:8081/api/swagger-ui.html" -ForegroundColor Cyan
Write-Host "   - Keycloak:       http://localhost:8180" -ForegroundColor Cyan
Write-Host "   - pgAdmin:        http://localhost:5050" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Voir les logs:" -ForegroundColor White
Write-Host "   .\docker.ps1 dev-logs" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. Arrêter les services:" -ForegroundColor White
Write-Host "   .\docker.ps1 dev-down" -ForegroundColor Yellow
Write-Host ""
Write-Host "Pour plus d'aide:" -ForegroundColor White
Write-Host "   .\docker.ps1 help" -ForegroundColor Yellow
Write-Host ""

