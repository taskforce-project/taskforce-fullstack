#!/bin/bash

# ===============================
# Script de Développement Docker
# Taskforce - Environnement DEV
# ===============================

COMPOSE_FILE="docker-compose.dev.yml"
ENV_FILE=".env.dev"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Fonction d'affichage
print_header() {
    clear
    echo -e "${CYAN}=================================${NC}"
    echo -e "${CYAN}    TASKFORCE - DEV DOCKER${NC}"
    echo -e "${CYAN}=================================${NC}"
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

# Vérifier que Docker est lancé
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker n'est pas lance. Demarrez Docker Desktop."
        exit 1
    fi
}

# Vérifier que .env.dev existe
check_env() {
    if [ ! -f "$ENV_FILE" ]; then
        print_error "Fichier $ENV_FILE manquant a la racine !"
        exit 1
    fi
}

# Menu principal
show_menu() {
    echo -e "${CYAN}Que voulez-vous faire ?${NC}"
    echo ""
    echo "  1) Demarrer tous les services"
    echo "  2) Demarrer + build (rebuild images)"
    echo "  3) Arreter tous les services"
    echo "  4) Voir les logs"
    echo "  5) Nettoyer (remove containers + volumes)"
    echo "  6) Status des services"
    echo "  0) Quitter"
    echo ""
    read -p "Choix: " choice
    echo ""
}

# Démarrer les services
start_services() {
    print_info "Demarrage des services..."
    docker-compose -f $COMPOSE_FILE up -d
    
    if [ $? -eq 0 ]; then
        print_success "Services demarres avec succes !"
        echo ""
        print_info "Services disponibles:"
        echo "  - PostgreSQL:    http://localhost:5432"
        echo "  - Keycloak:      http://localhost:8180 (admin/admin)"
        echo "  - Backend API:   http://localhost:8080/api"
        echo "  - Frontend:      http://localhost:3000"
        echo "  - Landing Page:  http://localhost:4321"
        echo "  - pgAdmin:       http://localhost:5050"
        echo ""
    else
        print_error "Erreur lors du demarrage"
    fi
}

# Démarrer avec rebuild
start_with_build() {
    print_info "Demarrage avec rebuild des images..."
    docker-compose -f $COMPOSE_FILE up -d --build
    
    if [ $? -eq 0 ]; then
        print_success "Services demarres avec rebuild !"
    else
        print_error "Erreur lors du build"
    fi
}

# Arrêter les services
stop_services() {
    print_info "Arret des services..."
    docker-compose -f $COMPOSE_FILE down
    
    if [ $? -eq 0 ]; then
        print_success "Services arretes"
    fi
}

# Voir les logs
show_logs() {
    print_info "Affichage des logs (Ctrl+C pour quitter)..."
    docker-compose -f $COMPOSE_FILE logs -f
}

# Nettoyer
clean_all() {
    print_warning "ATTENTION: Ceci va supprimer tous les containers et volumes !"
    read -p "Confirmer ? (y/N): " confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        print_info "Nettoyage en cours..."
        docker-compose -f $COMPOSE_FILE down -v
        print_success "Nettoyage termine"
    else
        print_info "Annule"
    fi
}

# Status
show_status() {
    print_info "Status des services:"
    echo ""
    docker-compose -f $COMPOSE_FILE ps
    echo ""
}

# Main
main() {
    # Se placer à la racine du projet
    cd "$(dirname "$0")/.." || exit 1
    
    check_docker
    check_env
    
    print_header
    
    while true; do
        show_menu
        
        case $choice in
            1)
                start_services
                read -p "Appuyez sur Entree pour continuer..."
                print_header
                ;;
            2)
                start_with_build
                read -p "Appuyez sur Entree pour continuer..."
                print_header
                ;;
            3)
                stop_services
                read -p "Appuyez sur Entree pour continuer..."
                print_header
                ;;
            4)
                show_logs
                print_header
                ;;
            5)
                clean_all
                read -p "Appuyez sur Entree pour continuer..."
                print_header
                ;;
            6)
                show_status
                read -p "Appuyez sur Entree pour continuer..."
                print_header
                ;;
            0)
                print_success "Au revoir !"
                exit 0
                ;;
            *)
                print_error "Option invalide"
                sleep 1
                print_header
                ;;
        esac
    done
}

# Lancer le script
main
