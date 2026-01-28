#!/bin/bash

# ===============================
# Script de Production Docker
# Taskforce - Environnement PROD
# ===============================

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Fonction d'affichage
print_header() {
    clear
    echo -e "${RED}============================================${NC}"
    echo -e "${RED}   TASKFORCE - PRODUCTION DOCKER WARNING!${NC}"
    echo -e "${RED}============================================${NC}"
    echo -e "${YELLOW}ATTENTION: Mode PRODUCTION - Soyez prudent !${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_error() {
    echo -e "${RED}$1${NC}"
}

print_info() {
    echo -e "${BLUE}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}$1${NC}"
}

# Vérifications
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker n'est pas lance !"
        exit 1
    fi
}

check_env() {
    if [ ! -f "$ENV_FILE" ]; then
        print_error "Fichier $ENV_FILE manquant !"
        print_warning "Creez-le a partir de .env.example avec des valeurs securisees !"
        exit 1
    fi
}

# Menu
show_menu() {
    echo -e "${CYAN}MENU PRINCIPAL${NC}"
    echo ""
    echo "  1) Demarrer les services"
    echo "  2) Arreter les services"
    echo "  3) Redemarrer les services"
    echo "  4) Build (sans cache)"
    echo "  5) Voir les logs"
    echo "  6) Status des services"
    echo "  7) Backup base de donnees"
    echo "  8) Nettoyer (avec volumes)"
    echo "  9) Rebuild complet"
    echo "  0) Quitter"
    echo ""
    read -p "Choix: " choice
    echo ""
}

# Actions
start_services() {
    print_warning "ATTENTION: Demarrage en PRODUCTION !"
    read -p "Confirmer ? (y/N): " confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        print_info "Demarrage des services production..."
        docker-compose -f $COMPOSE_FILE up -d
        
        if [ $? -eq 0 ]; then
            print_success "Services demarres !"
        fi
    fi
}

stop_services() {
    print_warning "Arret des services production !"
    read -p "Confirmer ? (y/N): " confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        docker-compose -f $COMPOSE_FILE down
        print_success "Services arretes"
    fi
}

restart_services() {
    print_warning "Redemarrage des services !"
    read -p "Confirmer ? (y/N): " confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        docker-compose -f $COMPOSE_FILE restart
        print_success "Services redemarres"
    fi
}

build_services() {
    print_info "Build des images (sans cache)..."
    docker-compose -f $COMPOSE_FILE build --no-cache
    
    if [ $? -eq 0 ]; then
        print_success "Build termine"
    fi
}

show_logs() {
    print_info "Logs (Ctrl+C pour quitter)..."
    docker-compose -f $COMPOSE_FILE logs -f
}

show_status() {
    print_info "Status des services:"
    echo ""
    docker-compose -f $COMPOSE_FILE ps
    echo ""
}

backup_database() {
    BACKUP_DIR="./backups"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/postgres_backup_$TIMESTAMP.sql"
    
    mkdir -p $BACKUP_DIR
    
    print_info "Backup de la base de donnees..."
    docker exec taskforce-postgres-prod pg_dump -U postgres taskforce_prod > $BACKUP_FILE
    
    if [ $? -eq 0 ]; then
        print_success "Backup cree: $BACKUP_FILE"
    else
        print_error "Erreur lors du backup"
    fi
}

clean_all() {
    print_error "DANGER: Suppression de tous les containers ET volumes !"
    read -p "Etes-vous ABSOLUMENT sur ? (yes/N): " confirm
    
    if [ "$confirm" = "yes" ]; then
        docker-compose -f $COMPOSE_FILE down -v
        print_success "Nettoyage termine"
    else
        print_info "Annule (tapez 'yes' pour confirmer)"
    fi
}

rebuild_all() {
    print_warning "Rebuild complet (down + build + up)"
    read -p "Confirmer ? (y/N): " confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        docker-compose -f $COMPOSE_FILE down
        docker-compose -f $COMPOSE_FILE build --no-cache
        docker-compose -f $COMPOSE_FILE up -d
        print_success "Rebuild termine"
    fi
}

# Main
main() {
    cd "$(dirname "$0")/.." || exit 1
    
    check_docker
    check_env
    
    print_header
    
    while true; do
        show_menu
        
        case $choice in
            1) start_services; read -p "Entree..."; print_header ;;
            2) stop_services; read -p "Entree..."; print_header ;;
            3) restart_services; read -p "Entree..."; print_header ;;
            4) build_services; read -p "Entree..."; print_header ;;
            5) show_logs; print_header ;;
            6) show_status; read -p "Entree..."; print_header ;;
            7) backup_database; read -p "Entree..."; print_header ;;
            8) clean_all; read -p "Entree..."; print_header ;;
            9) rebuild_all; read -p "Entree..."; print_header ;;
            0) print_success "Au revoir !"; exit 0 ;;
            *) print_error "Option invalide"; sleep 1; print_header ;;
        esac
    done
}

main
