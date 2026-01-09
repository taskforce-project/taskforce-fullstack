# ===============================
# MAKEFILE - Taskforce Project
# Commandes simplifiées pour Docker
# ===============================

.PHONY: help dev-up dev-down dev-logs dev-build prod-up prod-down prod-logs prod-build clean

# Couleurs
GREEN  := $(shell tput -Txterm setaf 2)
YELLOW := $(shell tput -Txterm setaf 3)
RESET  := $(shell tput -Txterm sgr0)

help: ## Afficher l'aide
	@echo "${GREEN}Taskforce - Commandes Docker${RESET}"
	@echo ""
	@echo "${YELLOW}Développement:${RESET}"
	@echo "  make dev-up          Démarrer les services en DEV"
	@echo "  make dev-down        Arrêter les services DEV"
	@echo "  make dev-logs        Afficher les logs DEV"
	@echo "  make dev-build       Rebuild les services DEV"
	@echo "  make dev-clean       Supprimer volumes DEV"
	@echo ""
	@echo "${YELLOW}Production:${RESET}"
	@echo "  make prod-up         Démarrer les services en PROD"
	@echo "  make prod-down       Arrêter les services PROD"
	@echo "  make prod-logs       Afficher les logs PROD"
	@echo "  make prod-build      Rebuild les services PROD"
	@echo "  make prod-clean      Supprimer volumes PROD"
	@echo ""
	@echo "${YELLOW}Utilitaires:${RESET}"
	@echo "  make clean           Nettoyer tous les conteneurs et volumes"
	@echo "  make ps              Lister les conteneurs actifs"

# ================================
# DÉVELOPPEMENT
# ================================

dev-up: ## Démarrer en mode développement
	@echo "${GREEN}Démarrage des services DEV...${RESET}"
	docker-compose -f docker-compose.dev.yml --env-file backend/tf-api/.env.dev up

dev-up-d: ## Démarrer en mode développement (arrière-plan)
	@echo "${GREEN}Démarrage des services DEV (background)...${RESET}"
	docker-compose -f docker-compose.dev.yml --env-file backend/tf-api/.env.dev up -d

dev-down: ## Arrêter les services DEV
	@echo "${YELLOW}Arrêt des services DEV...${RESET}"
	docker-compose -f docker-compose.dev.yml down

dev-logs: ## Afficher les logs DEV
	docker-compose -f docker-compose.dev.yml logs -f

dev-logs-backend: ## Logs backend uniquement
	docker-compose -f docker-compose.dev.yml logs -f backend

dev-build: ## Rebuild les services DEV
	@echo "${GREEN}Build des services DEV...${RESET}"
	docker-compose -f docker-compose.dev.yml build --no-cache

dev-restart: ## Redémarrer les services DEV
	@echo "${YELLOW}Redémarrage des services DEV...${RESET}"
	docker-compose -f docker-compose.dev.yml restart

dev-clean: ## Supprimer les volumes DEV
	@echo "${YELLOW}Suppression des volumes DEV...${RESET}"
	docker-compose -f docker-compose.dev.yml down -v

# ================================
# PRODUCTION
# ================================

prod-up: ## Démarrer en mode production
	@echo "${GREEN}Démarrage des services PROD...${RESET}"
	docker-compose -f docker-compose.prod.yml --env-file backend/tf-api/.env.prod up -d

prod-down: ## Arrêter les services PROD
	@echo "${YELLOW}Arrêt des services PROD...${RESET}"
	docker-compose -f docker-compose.prod.yml down

prod-logs: ## Afficher les logs PROD
	docker-compose -f docker-compose.prod.yml logs -f

prod-logs-backend: ## Logs backend PROD uniquement
	docker-compose -f docker-compose.prod.yml logs -f backend

prod-build: ## Rebuild les services PROD
	@echo "${GREEN}Build des services PROD...${RESET}"
	docker-compose -f docker-compose.prod.yml build --no-cache

prod-restart: ## Redémarrer les services PROD
	@echo "${YELLOW}Redémarrage des services PROD...${RESET}"
	docker-compose -f docker-compose.prod.yml restart

prod-clean: ## Supprimer les volumes PROD
	@echo "${YELLOW}Suppression des volumes PROD...${RESET}"
	docker-compose -f docker-compose.prod.yml down -v

# ================================
# UTILITAIRES
# ================================

ps: ## Lister les conteneurs actifs
	docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

clean: ## Nettoyer tout
	@echo "${YELLOW}Nettoyage complet...${RESET}"
	docker-compose -f docker-compose.dev.yml down -v
	docker-compose -f docker-compose.prod.yml down -v
	docker system prune -f

exec-backend: ## Accéder au shell du backend DEV
	docker exec -it taskforce-backend-dev sh

exec-db: ## Accéder à PostgreSQL DEV
	docker exec -it taskforce-postgres-dev psql -U postgres -d taskforce_dev

exec-keycloak: ## Accéder au shell Keycloak DEV
	docker exec -it taskforce-keycloak-dev sh

# ================================
# INITIALISATION
# ================================

init-dev: ## Initialiser l'environnement DEV
	@echo "${GREEN}Initialisation DEV...${RESET}"
	@if [ ! -f backend/tf-api/.env.dev ]; then \
		echo "${YELLOW}Création de .env.dev...${RESET}"; \
		cp backend/tf-api/.env.dev.example backend/tf-api/.env.dev; \
	fi
	@echo "${GREEN}Fichiers prêts. Lancez 'make dev-up'${RESET}"

init-prod: ## Initialiser l'environnement PROD
	@echo "${GREEN}Initialisation PROD...${RESET}"
	@if [ ! -f backend/tf-api/.env.prod ]; then \
		echo "${YELLOW}Création de .env.prod...${RESET}"; \
		cp backend/tf-api/.env.prod.example backend/tf-api/.env.prod; \
		echo "${YELLOW}⚠️  ATTENTION: Modifiez .env.prod avec vos vraies valeurs !${RESET}"; \
	fi

