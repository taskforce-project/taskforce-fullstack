#!/bin/bash

# ===============================
# Script d'initialisation DEV
# ===============================

echo "Initialisation de l'environnement de developpement Taskforce"
echo ""

# Vérifier Docker
echo "Verification de Docker..."
if ! command -v docker &> /dev/null; then
    echo "ERREUR: Docker n'est pas installe ou pas dans le PATH"
    echo "Telechargez Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
fi

dockerVersion=$(docker --version)
echo "Docker installe: $dockerVersion"

# Vérifier Docker Compose
echo "Verification de Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    echo "ERREUR: Docker Compose n'est pas installe"
    exit 1
fi

composeVersion=$(docker-compose --version)
echo "Docker Compose installe: $composeVersion"

echo ""
echo "Configuration des fichiers d'environnement..."

# Se placer à la racine
cd "$(dirname "$0")/.." || exit 1

# Vérifier .env.dev
if [ ! -f ".env.dev" ]; then
    if [ -f ".env.example" ]; then
        echo "Creation de .env.dev depuis .env.example..."
        cp .env.example .env.dev
        echo ".env.dev cree"
    else
        echo "ATTENTION: .env.example introuvable"
    fi
else
    echo ".env.dev existe deja"
fi

echo ""
echo "Initialisation terminee !"
echo ""
echo "Prochaines etapes:"
echo ""
echo "1. Demarrer les services en developpement:"
echo "   bash scripts/start-dev.sh"
echo "   ou"
echo "   bash scripts/dev-docker.sh"
echo ""
echo "2. Acceder aux services:"
echo "   - API:      http://localhost:8080/api"
echo "   - Keycloak: http://localhost:8180"
echo "   - Frontend: http://localhost:3000"
echo ""
