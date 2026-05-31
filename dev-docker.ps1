# ===============================
# TASKFORCE - DOCKER DEV
# Script de gestion Docker pour l'environnement de développement
# ===============================

$ErrorActionPreference = "Stop"

# Couleurs
$COLOR_RESET = "White"
$COLOR_SUCCESS = "Green"
$COLOR_WARNING = "Yellow"
$COLOR_ERROR = "Red"
$COLOR_INFO = "Cyan"

# Configuration
$COMPOSE_FILE = "docker-compose.dev.yml"
$ENV_FILE = ".env.dev"

# ===============================
# Fonctions utilitaires
# ===============================

function Write-ColorMessage {
    param(
        [string]$Message,
        [string]$Color = $COLOR_RESET
    )
    Write-Host $Message -ForegroundColor $Color
}

function Show-Header {
    Clear-Host
    Write-ColorMessage "`n╔════════════════════════════════════════════════════════════╗" $COLOR_INFO
    Write-ColorMessage "║        TASKFORCE - DOCKER DÉVELOPPEMENT                    ║" $COLOR_INFO
    Write-ColorMessage "╚════════════════════════════════════════════════════════════╝`n" $COLOR_INFO
}

function Check-Docker {
    try {
        $null = docker --version
        $dockerRunning = docker info 2>$null
        if (-not $dockerRunning) {
            Write-ColorMessage "❌ Docker n'est pas démarré. Veuillez démarrer Docker Desktop." $COLOR_ERROR
            exit 1
        }
        return $true
    } catch {
        Write-ColorMessage "❌ Docker n'est pas installé ou n'est pas accessible." $COLOR_ERROR
        Write-ColorMessage "   Téléchargez Docker Desktop: https://www.docker.com/products/docker-desktop" $COLOR_WARNING
        exit 1
    }
}

function Show-Menu {
    Write-ColorMessage "`n📋 MENU PRINCIPAL`n" $COLOR_SUCCESS
    Write-Host "  1. 🚀 Démarrer les services (foreground)"
    Write-Host "  2. 🔧 Démarrer les services (background)"
    Write-Host "  3. ⏹️  Arrêter les services"
    Write-Host "  4. 🔄 Redémarrer les services"
    Write-Host "  5. 🔨 Build (sans cache)"
    Write-Host "  6. 📋 Voir les logs"
    Write-Host "  7. 📊 État des conteneurs"
    Write-Host "  8. 🧹 Nettoyer (volumes inclus)"
    Write-Host "  9. 🗑️  Prune (supprimer images/containers inutilisés)"
    Write-Host "  10. 📦 Rebuild complet (down + build + up)"
    Write-Host "  0. ❌ Quitter`n"
    Write-ColorMessage "════════════════════════════════════════════════════════════`n" $COLOR_INFO
}

# ===============================
# Actions Docker
# ===============================

function Start-Services {
    Write-ColorMessage "`n🚀 Démarrage des services en mode foreground...`n" $COLOR_SUCCESS
    docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up
}

function Start-ServicesBackground {
    Write-ColorMessage "`n🔧 Démarrage des services en background...`n" $COLOR_SUCCESS
    docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorMessage "`n✅ Services démarrés avec succès !`n" $COLOR_SUCCESS
        Show-Services
    }
}

function Stop-Services {
    Write-ColorMessage "`n⏹️  Arrêt des services...`n" $COLOR_WARNING
    docker-compose -f $COMPOSE_FILE down
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorMessage "`n✅ Services arrêtés avec succès !`n" $COLOR_SUCCESS
    }
}

function Restart-Services {
    Write-ColorMessage "`n🔄 Redémarrage des services...`n" $COLOR_WARNING
    docker-compose -f $COMPOSE_FILE restart
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorMessage "`n✅ Services redémarrés avec succès !`n" $COLOR_SUCCESS
    }
}

function Build-Services {
    Write-ColorMessage "`n🔨 Build des services (sans cache)...`n" $COLOR_INFO
    docker-compose -f $COMPOSE_FILE build --no-cache
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorMessage "`nBuild termine avec succes !`n" $COLOR_SUCCESS
    }
}

function Show-Logs {
    Write-ColorMessage "`nAffichage des logs (Ctrl+C pour quitter)...`n" $COLOR_INFO
    docker-compose -f $COMPOSE_FILE logs -f
}

function Show-Services {
    Write-ColorMessage "`n📊 État des conteneurs :`n" $COLOR_INFO
    docker-compose -f $COMPOSE_FILE ps
    
    Write-ColorMessage "`n📋 Services disponibles :" $COLOR_SUCCESS
    Write-Host "  🌐 Frontend:        http://localhost:3000" -ForegroundColor White
    Write-Host "  🎨 Landing Page:    http://localhost:18081" -ForegroundColor White
    Write-Host "  🔌 API Backend:     http://localhost:8080/api" -ForegroundColor White
    Write-Host "  📚 Swagger UI:      http://localhost:8080/swagger-ui.html" -ForegroundColor White
    Write-Host "  🔐 Keycloak Admin:  http://localhost:8180 (admin/admin)" -ForegroundColor White
    Write-Host "  🗄️  pgAdmin:         http://localhost:5050 (admin@taskforce.dev/admin)" -ForegroundColor White
    Write-Host "  🐘 PostgreSQL:      localhost:5432 (postgres/postgres)" -ForegroundColor White
}

function Clean-All {
    Write-ColorMessage "`n🧹 Nettoyage complet (avec volumes)...`n" $COLOR_WARNING
    Write-Host "⚠️  Attention : Cela supprimera toutes les données ! (y/N) : " -NoNewline -ForegroundColor $COLOR_WARNING
    $confirmation = Read-Host
    
    if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
        docker-compose -f $COMPOSE_FILE down -v
        Write-ColorMessage "`n✅ Nettoyage terminé !`n" $COLOR_SUCCESS
    } else {
        Write-ColorMessage "`n❌ Nettoyage annulé.`n" $COLOR_INFO
    }
}

function Prune-Docker {
    Write-ColorMessage "`n🗑️  Suppression des ressources Docker inutilisées...`n" $COLOR_WARNING
    Write-Host "⚠️  Continuer ? (y/N) : " -NoNewline -ForegroundColor $COLOR_WARNING
    $confirmation = Read-Host
    
    if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
        docker system prune -af --volumes
        Write-ColorMessage "`n✅ Prune terminé !`n" $COLOR_SUCCESS
    } else {
        Write-ColorMessage "`n❌ Prune annulé.`n" $COLOR_INFO
    }
}

function Rebuild-Complete {
    Write-ColorMessage "`n📦 Rebuild complet...`n" $COLOR_INFO
    
    Write-ColorMessage "Étape 1/3 : Arrêt des services..." $COLOR_WARNING
    docker-compose -f $COMPOSE_FILE down
    
    Write-ColorMessage "Étape 2/3 : Build sans cache..." $COLOR_INFO
    docker-compose -f $COMPOSE_FILE build --no-cache
    
    Write-ColorMessage "Étape 3/3 : Démarrage des services..." $COLOR_SUCCESS
    docker-compose -f $COMPOSE_FILE up -d
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorMessage "`n✅ Rebuild complet terminé !`n" $COLOR_SUCCESS
        Show-Services
    }
}

# ===============================
# Menu principal
# ===============================

function Main {
    Show-Header
    Check-Docker
    
    Write-ColorMessage "✅ Docker est prêt !`n" $COLOR_SUCCESS
    
    while ($true) {
        Show-Menu
        $choice = Read-Host "Choisissez une option"
        
        switch ($choice) {
            "1" { Start-Services; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "2" { Start-ServicesBackground; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "3" { Stop-Services; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "4" { Restart-Services; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "5" { Build-Services; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "6" { Show-Logs }
            "7" { Show-Services; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "8" { Clean-All; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "9" { Prune-Docker; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "10" { Rebuild-Complete; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "0" { 
                Write-ColorMessage "`n👋 Au revoir !`n" $COLOR_SUCCESS
                exit 0
            }
            default { 
                Write-ColorMessage "`nOption invalide. Reessayez.`n" $COLOR_ERROR
                Start-Sleep -Seconds 1
            }
        }
        
        Show-Header
    }
}

# Lancer le script
Main
