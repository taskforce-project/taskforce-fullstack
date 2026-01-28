#!/bin/bash

# ===============================
# Script d'arrêt rapide DEV
# ===============================

COMPOSE_FILE="docker-compose.dev.yml"

echo "Arret de l'environnement Taskforce (DEV)"
echo ""

# Se placer à la racine
cd "$(dirname "$0")/.." || exit 1

# Demander si on supprime les volumes
read -p "Supprimer egalement les volumes (donnees) ? (y/N): " removeVolumes

if [ "$removeVolumes" = "y" ] || [ "$removeVolumes" = "Y" ]; then
    echo "Arret et suppression des volumes..."
    docker-compose -f $COMPOSE_FILE down -v
else
    echo "Arret des services (volumes conserves)..."
    docker-compose -f $COMPOSE_FILE down
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "Services arretes avec succes !"
else
    echo ""
    echo "ERREUR lors de l'arret des services"
    exit 1
fi
