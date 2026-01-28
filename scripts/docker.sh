#!/bin/bash

# ===============================
# Script Docker - Menu Principal
# ===============================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

show_menu() {
    clear
    echo -e "${CYAN}=================================${NC}"
    echo -e "${CYAN}    TASKFORCE - DOCKER MENU${NC}"
    echo -e "${CYAN}=================================${NC}"
    echo ""
    echo "  1) Dev - Menu interactif"
    echo "  2) Dev - Demarrage rapide"
    echo "  3) Dev - Arret"
    echo "  4) Prod - Menu interactif"
    echo "  5) Initialisation"
    echo "  0) Quitter"
    echo ""
    read -p "Choix: " choice
    echo ""
}

while true; do
    show_menu
    
    case $choice in
        1)
            bash "$SCRIPT_DIR/dev-docker.sh"
            ;;
        2)
            bash "$SCRIPT_DIR/start-dev.sh"
            read -p "Appuyez sur Entree pour continuer..."
            ;;
        3)
            bash "$SCRIPT_DIR/stop-dev.sh"
            read -p "Appuyez sur Entree pour continuer..."
            ;;
        4)
            bash "$SCRIPT_DIR/prod-docker.sh"
            ;;
        5)
            bash "$SCRIPT_DIR/init-dev.sh"
            read -p "Appuyez sur Entree pour continuer..."
            ;;
        0)
            echo -e "${GREEN}Au revoir !${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Option invalide${NC}"
            sleep 1
            ;;
    esac
done
