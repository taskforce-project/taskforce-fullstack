# ===============================================================
#  Makefile - TaskForce  (ENTREE UNIQUE)
#  Delegue aux scripts PowerShell de scripts/  (une seule implementation).
#  Prerequis Windows : installer make  ->  choco install make
#  (Docker Desktop fournit "docker compose" v2.)
# ===============================================================

# Recipe prefix = ">" au lieu de TAB (robuste, evite les pieges de tabulation)
.RECIPEPREFIX := >

PS       := powershell -NoProfile -ExecutionPolicy Bypass -File
DOCKER   := $(PS) scripts/docker.ps1
QUALITY  := $(PS) scripts/quality.ps1
SECURITY := $(PS) scripts/security-scan.ps1
DB       := $(PS) scripts/db.ps1

.DEFAULT_GOAL := help
.PHONY: help menu setup init-dev init-prod \
        dev-up dev-up-d dev-down dev-restart dev-build dev-rebuild dev-logs dev-logs-backend dev-clean \
        prod-up prod-down prod-rebuild prod-clean \
        obs obs-down ps urls clean \
        test-fe test-be cov-fe cov-be lint build-fe build-be \
        scan trivy semgrep \
        exec-db exec-backend exec-keycloak

help:
> @echo TaskForce - cibles make :
> @echo   DEV      : dev-up  dev-up-d  dev-down  dev-restart  dev-build  dev-rebuild  dev-clean
> @echo   LOGS     : dev-logs  dev-logs-backend
> @echo   PROD     : prod-up  prod-down  prod-rebuild  prod-clean
> @echo   OUTILS   : obs  obs-down  trivy  semgrep  scan
> @echo   QUALITE  : test-fe  test-be  cov-fe  cov-be  lint  build-fe  build-be
> @echo   DB/SHELL : exec-db  exec-backend  exec-keycloak
> @echo   SYSTEME  : setup  init-prod  ps  urls  clean  menu
> @echo   Menu interactif : make menu

# --- Initialisation / launcher interactif ---
menu:
> @$(PS) tf.ps1
setup:
> @$(DOCKER) setup
init-dev:
> @$(DOCKER) setup
init-prod:
> @$(DOCKER) setup-prod

# --- Developpement ---
dev-up:
> @$(DOCKER) up
dev-up-d:
> @$(DOCKER) upd
dev-down:
> @$(DOCKER) down
dev-restart:
> @$(DOCKER) restart
dev-build:
> @$(DOCKER) build
dev-rebuild:
> @$(DOCKER) rebuild
dev-logs:
> @$(DOCKER) logs
dev-logs-backend:
> @$(DOCKER) logs backend
dev-clean:
> @$(DOCKER) clean-dev

# --- Production ---
prod-up:
> @$(DOCKER) prod-up
prod-down:
> @$(DOCKER) prod-down
prod-rebuild:
> @$(DOCKER) prod-rebuild
prod-clean:
> @$(DOCKER) prod-clean

# --- Outils ---
obs:
> @$(DOCKER) obs
obs-down:
> @$(DOCKER) obs-down
ps:
> @$(DOCKER) ps
urls:
> @$(DOCKER) urls
clean:
> @$(DOCKER) clean

# --- Qualite ---
test-fe:
> @$(QUALITY) test-fe
test-be:
> @$(QUALITY) test-be
cov-fe:
> @$(QUALITY) cov-fe
cov-be:
> @$(QUALITY) cov-be
lint:
> @$(QUALITY) lint
build-fe:
> @$(QUALITY) build-fe
build-be:
> @$(QUALITY) build-be

# --- Securite ---
scan:
> @$(SECURITY)
trivy:
> @$(SECURITY) -Source
semgrep:
> @$(SECURITY) -Static

# --- Base de donnees / shells ---
exec-db:
> @$(DB) psql
exec-backend:
> @$(DB) sh-be
exec-keycloak:
> @$(DB) sh-kc
