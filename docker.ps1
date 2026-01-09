# ===============================
# TASKFORCE - Scripts Docker PowerShell
# ===============================

param(
    [Parameter(Mandatory=$true, Position=0)]
    [ValidateSet('dev-up', 'dev-down', 'dev-logs', 'dev-build', 'dev-clean', 'prod-up', 'prod-down', 'prod-logs', 'prod-build', 'prod-clean', 'clean', 'ps', 'help')]
    [string]$Command
)

$GREEN = "Green"
$YELLOW = "Yellow"
$RED = "Red"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

# ================================
# DÉVELOPPEMENT
# ================================

function Dev-Up {
    Write-ColorOutput "🚀 Démarrage des services DEV..." $GREEN
    docker-compose -f docker-compose.dev.yml --env-file backend/tf-api/.env.dev up
}

function Dev-Up-Background {
    Write-ColorOutput "🚀 Démarrage des services DEV (background)..." $GREEN
    docker-compose -f docker-compose.dev.yml --env-file backend/tf-api/.env.dev up -d
}

function Dev-Down {
    Write-ColorOutput "⏹️  Arrêt des services DEV..." $YELLOW
    docker-compose -f docker-compose.dev.yml down
}

function Dev-Logs {
    Write-ColorOutput "📋 Logs DEV..." $GREEN
    docker-compose -f docker-compose.dev.yml logs -f
}

function Dev-Build {
    Write-ColorOutput "🔨 Build des services DEV..." $GREEN
    docker-compose -f docker-compose.dev.yml build --no-cache
}

function Dev-Clean {
    Write-ColorOutput "🧹 Suppression des volumes DEV..." $YELLOW
    docker-compose -f docker-compose.dev.yml down -v
}

# ================================
# PRODUCTION
# ================================

function Prod-Up {
    Write-ColorOutput "🚀 Démarrage des services PROD..." $GREEN
    docker-compose -f docker-compose.prod.yml --env-file backend/tf-api/.env.prod up -d
}

function Prod-Down {
    Write-ColorOutput "⏹️  Arrêt des services PROD..." $YELLOW
    docker-compose -f docker-compose.prod.yml down
}

function Prod-Logs {
    Write-ColorOutput "📋 Logs PROD..." $GREEN
    docker-compose -f docker-compose.prod.yml logs -f
}

function Prod-Build {
    Write-ColorOutput "🔨 Build des services PROD..." $GREEN
    docker-compose -f docker-compose.prod.yml build --no-cache
}

function Prod-Clean {
    Write-ColorOutput "🧹 Suppression des volumes PROD..." $YELLOW
    docker-compose -f docker-compose.prod.yml down -v
}

# ================================
# UTILITAIRES
# ================================

function Clean-All {
    Write-ColorOutput "🧹 Nettoyage complet..." $YELLOW
    docker-compose -f docker-compose.dev.yml down -v
    docker-compose -f docker-compose.prod.yml down -v
    docker system prune -f
    Write-ColorOutput "✅ Nettoyage terminé" $GREEN
}

function Show-Containers {
    Write-ColorOutput "📦 Conteneurs actifs:" $GREEN
    docker ps -a --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"
}

function Show-Help {
    Write-ColorOutput "`n🐳 Taskforce - Commandes Docker`n" $GREEN
    Write-ColorOutput "Développement:" $YELLOW
    Write-Host "  .\docker.ps1 dev-up          Démarrer les services en DEV"
    Write-Host "  .\docker.ps1 dev-down        Arrêter les services DEV"
    Write-Host "  .\docker.ps1 dev-logs        Afficher les logs DEV"
    Write-Host "  .\docker.ps1 dev-build       Rebuild les services DEV"
    Write-Host "  .\docker.ps1 dev-clean       Supprimer volumes DEV"
    Write-Host ""
    Write-ColorOutput "Production:" $YELLOW
    Write-Host "  .\docker.ps1 prod-up         Démarrer les services en PROD"
    Write-Host "  .\docker.ps1 prod-down       Arrêter les services PROD"
    Write-Host "  .\docker.ps1 prod-logs       Afficher les logs PROD"
    Write-Host "  .\docker.ps1 prod-build      Rebuild les services PROD"
    Write-Host "  .\docker.ps1 prod-clean      Supprimer volumes PROD"
    Write-Host ""
    Write-ColorOutput "Utilitaires:" $YELLOW
    Write-Host "  .\docker.ps1 clean           Nettoyer tous les conteneurs et volumes"
    Write-Host "  .\docker.ps1 ps              Lister les conteneurs actifs"
    Write-Host "  .\docker.ps1 help            Afficher cette aide"
    Write-Host ""
}

# ================================
# ROUTER
# ================================

switch ($Command) {
    'dev-up'     { Dev-Up }
    'dev-down'   { Dev-Down }
    'dev-logs'   { Dev-Logs }
    'dev-build'  { Dev-Build }
    'dev-clean'  { Dev-Clean }
    'prod-up'    { Prod-Up }
    'prod-down'  { Prod-Down }
    'prod-logs'  { Prod-Logs }
    'prod-build' { Prod-Build }
    'prod-clean' { Prod-Clean }
    'clean'      { Clean-All }
    'ps'         { Show-Containers }
    'help'       { Show-Help }
    default      { Show-Help }
}

