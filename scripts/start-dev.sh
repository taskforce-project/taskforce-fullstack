#!/bin/bash

# ===============================
# Script de demarrage rapide DEV
# ===============================

COMPOSE_FILE="docker-compose.dev.yml"

echo "Demarrage de l'environnement Taskforce (DEV)"
echo ""

# Vérifier Docker
if ! docker info > /dev/null 2>&1; then
    echo "ERREUR: Docker n'est pas lance !"
    exit 1
fi

echo "Docker est demarre"
echo ""

# Se placer à la racine
cd "$(dirname "$0")/.." || exit 1

# Vérifier le fichier
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "ERREUR: $COMPOSE_FILE introuvable"
    exit 1
fi

# Demander si on nettoie les volumes
read -p "Nettoyer les volumes existants ? (y/N): " clean

if [ "$clean" = "y" ] || [ "$clean" = "Y" ]; then
    echo "Nettoyage des volumes..."
    docker-compose -f $COMPOSE_FILE down -v
fi

echo ""
echo "Demarrage des services..."
docker-compose -f $COMPOSE_FILE up -d --build

if [ $? -eq 0 ]; then
    echo ""
    echo "Services demarres avec succes !"
    echo ""
    echo "Services disponibles :"
    echo "  - API Backend:      http://localhost:8080/api"
    echo "  - Swagger UI:       http://localhost:8080/api/swagger-ui.html"
    echo "  - Keycloak Admin:   http://localhost:8180 (admin/admin)"
    echo "  - Frontend:         http://localhost:3000"
    echo "  - Landing Page:     http://localhost:4321"
    echo "  - pgAdmin:          http://localhost:5050 (admin@taskforce.dev/admin)"
    echo "  - PostgreSQL:       localhost:5432 (postgres/PostgreSQLP54!)"
    echo ""
    echo "Pour voir les logs: docker-compose -f $COMPOSE_FILE logs -f"
    echo "Pour arreter:       docker-compose -f $COMPOSE_FILE down"
else
    echo ""
    echo "ERREUR lors du demarrage"
    exit 1
fi
