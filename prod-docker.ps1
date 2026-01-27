# ===============================
# TASKFORCE - DOCKER PRODUCTION
# Script de gestion Docker pour l'environnement de production
# ===============================

$ErrorActionPreference = "Stop"

# Couleurs
$COLOR_RESET = "White"
$COLOR_SUCCESS = "Green"
$COLOR_WARNING = "Yellow"
$COLOR_ERROR = "Red"
$COLOR_INFO = "Cyan"

# Configuration
$COMPOSE_FILE = "docker-compose.prod.yml"
$ENV_FILE = ".env.prod"

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
    Write-ColorMessage "`n╔════════════════════════════════════════════════════════════╗" $COLOR_ERROR
    Write-ColorMessage "║        TASKFORCE - DOCKER PRODUCTION ⚠️                     ║" $COLOR_ERROR
    Write-ColorMessage "╚════════════════════════════════════════════════════════════╝`n" $COLOR_ERROR
    Write-ColorMessage "⚠️  MODE PRODUCTION - SOYEZ PRUDENT !`n" $COLOR_WARNING
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
        exit 1
    }
}

function Check-EnvFile {
    if (-not (Test-Path $ENV_FILE)) {
        Write-ColorMessage "❌ Fichier $ENV_FILE introuvable !" $COLOR_ERROR
        Write-ColorMessage "   Créez-le à partir de .env.example avec des valeurs sécurisées !" $COLOR_WARNING
        exit 1
    }
}

function Show-Menu {
    Write-ColorMessage "`n📋 MENU PRINCIPAL`n" $COLOR_SUCCESS
    Write-Host "  1. 🚀 Démarrer les services"
    Write-Host "  2. ⏹️  Arrêter les services"
    Write-Host "  3. 🔄 Redémarrer les services"
    Write-Host "  4. 🔨 Build (sans cache)"
    Write-Host "  5. 📋 Voir les logs"
    Write-Host "  6. 📊 État des conteneurs"
    Write-Host "  7. 💾 Backup base de données"
    Write-Host "  8. 🧹 Nettoyer (volumes inclus)"
    Write-Host "  9. 📦 Rebuild complet"
    Write-Host "  0. ❌ Quitter`n"
    Write-ColorMessage "════════════════════════════════════════════════════════════`n" $COLOR_INFO
}

# ===============================
# Actions Docker
# ===============================

function Start-Services {
    Write-ColorMessage "`n🚀 Démarrage des services production...`n" $COLOR_SUCCESS
    docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorMessage "`n✅ Services démarrés avec succès !`n" $COLOR_SUCCESS
        Show-Services
    }
}

function Stop-Services {
    Write-ColorMessage "`n⏹️  Arrêt des services...`n" $COLOR_WARNING
    Write-Host "⚠️  Confirmer l'arrêt des services production ? (y/N) : " -NoNewline -ForegroundColor $COLOR_WARNING
    $confirmation = Read-Host
    
    if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
        docker-compose -f $COMPOSE_FILE down
        Write-ColorMessage "`n✅ Services arrêtés !`n" $COLOR_SUCCESS
    } else {
        Write-ColorMessage "`n❌ Arrêt annulé.`n" $COLOR_INFO
    }
}

function Restart-Services {
    Write-ColorMessage "`n🔄 Redémarrage des services...`n" $COLOR_WARNING
    docker-compose -f $COMPOSE_FILE restart
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorMessage "`n✅ Services redémarrés !`n" $COLOR_SUCCESS
    }
}

function Build-Services {
    Write-ColorMessage "`n🔨 Build des services...`n" $COLOR_INFO
    docker-compose -f $COMPOSE_FILE build --no-cache
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorMessage "`n✅ Build terminé !`n" $COLOR_SUCCESS
    }
}

function Show-Logs {
    Write-ColorMessage "`n📋 Affichage des logs (Ctrl+C pour quitter)...`n" $COLOR_INFO
    Write-Host "Service spécifique (ou Entrée pour tous) : " -NoNewline
    $service = Read-Host
    
    if ([string]::IsNullOrWhiteSpace($service)) {
        docker-compose -f $COMPOSE_FILE logs -f --tail=100
    } else {
        docker-compose -f $COMPOSE_FILE logs -f --tail=100 $service
    }
}

function Show-Services {
    Write-ColorMessage "`n📊 État des conteneurs :`n" $COLOR_INFO
    docker-compose -f $COMPOSE_FILE ps
    
    Write-ColorMessage "`n📋 Services actifs :" $COLOR_SUCCESS
    Write-Host "  🌐 Frontend:        https://votre-domaine.com" -ForegroundColor White
    Write-Host "  🔌 API Backend:     https://api.votre-domaine.com" -ForegroundColor White
    Write-Host "  🔐 Keycloak:        https://auth.votre-domaine.com" -ForegroundColor White
}

function Backup-Database {
    Write-ColorMessage "`n💾 Backup de la base de données...`n" $COLOR_INFO
    
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupFile = "backup_taskforce_$timestamp.sql"
    
    Write-ColorMessage "Création du backup : $backupFile" $COLOR_INFO
    docker-compose -f $COMPOSE_FILE exec -T postgres pg_dump -U postgres taskforce_prod > $backupFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorMessage "`n✅ Backup créé : $backupFile`n" $COLOR_SUCCESS
    } else {
        Write-ColorMessage "`n❌ Erreur lors du backup !`n" $COLOR_ERROR
    }
}

function Clean-All {
    Write-ColorMessage "`n🧹 Nettoyage complet...`n" $COLOR_ERROR
    Write-ColorMessage "⚠️  ATTENTION : Cela supprimera TOUTES les données !`n" $COLOR_ERROR
    Write-Host "Tapez 'CONFIRMER' pour continuer : " -NoNewline -ForegroundColor $COLOR_ERROR
    $confirmation = Read-Host
    
    if ($confirmation -eq 'CONFIRMER') {
        docker-compose -f $COMPOSE_FILE down -v
        Write-ColorMessage "`n✅ Nettoyage terminé !`n" $COLOR_SUCCESS
    } else {
        Write-ColorMessage "`n❌ Nettoyage annulé.`n" $COLOR_INFO
    }
}

function Rebuild-Complete {
    Write-ColorMessage "`n📦 Rebuild complet...`n" $COLOR_WARNING
    Write-Host "⚠️  Confirmer le rebuild complet ? (y/N) : " -NoNewline -ForegroundColor $COLOR_WARNING
    $confirmation = Read-Host
    
    if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
        Write-ColorMessage "Étape 1/3 : Arrêt des services..." $COLOR_WARNING
        docker-compose -f $COMPOSE_FILE down
        
        Write-ColorMessage "Étape 2/3 : Build sans cache..." $COLOR_INFO
        docker-compose -f $COMPOSE_FILE build --no-cache
        
        Write-ColorMessage "Étape 3/3 : Démarrage..." $COLOR_SUCCESS
        docker-compose -f $COMPOSE_FILE up -d
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColorMessage "`n✅ Rebuild terminé !`n" $COLOR_SUCCESS
            Show-Services
        }
    } else {
        Write-ColorMessage "`n❌ Rebuild annulé.`n" $COLOR_INFO
    }
}

# ===============================
# Menu principal
# ===============================

function Main {
    Show-Header
    Check-Docker
    Check-EnvFile
    
    Write-ColorMessage "✅ Environnement prêt !`n" $COLOR_SUCCESS
    
    while ($true) {
        Show-Menu
        $choice = Read-Host "Choisissez une option"
        
        switch ($choice) {
            "1" { Start-Services; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "2" { Stop-Services; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "3" { Restart-Services; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "4" { Build-Services; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "5" { Show-Logs }
            "6" { Show-Services; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "7" { Backup-Database; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "8" { Clean-All; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "9" { Rebuild-Complete; Read-Host "`nAppuyez sur Entrée pour continuer" }
            "0" { 
                Write-ColorMessage "`n👋 Au revoir !`n" $COLOR_SUCCESS
                exit 0
            }
            default { 
                Write-ColorMessage "`n❌ Option invalide.`n" $COLOR_ERROR
                Start-Sleep -Seconds 1
            }
        }
        
        Show-Header
    }
}

# Lancer le script
Main
