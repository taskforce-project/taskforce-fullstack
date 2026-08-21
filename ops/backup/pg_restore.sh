#!/usr/bin/env bash
# Restauration d'une sauvegarde COMPLÈTE (pg_dumpall). ECRASE tout le cluster (toutes les bases + rôles).
#
# Les services connectés à Postgres sont arrêtés le temps de la restauration (sinon les DROP DATABASE
# échouent : connexions actives), puis redémarrés. C'est le filet pour « reseed la prod sans risque ».
#
# Usage : ./pg_restore.sh <chemin/vers/taskforce-cluster-AAAAMMJJ-HHMMSS.sql.gz>
set -euo pipefail

CONTAINER="${PG_CONTAINER:-taskforce-postgres-prod}"
SERVICES="${PG_CLIENTS:-taskforce-backend-prod taskforce-keycloak-prod taskforce-ai-service-prod}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
FILE="${1:-}"

if [ -z "$FILE" ]; then
  echo "usage: $0 <fichier.sql.gz>"
  echo "sauvegardes disponibles :"
  ls -1t "$BACKUP_DIR"/taskforce-cluster-*.sql.gz 2>/dev/null | head || true
  exit 1
fi
[ -f "$FILE" ] || { echo "introuvable: $FILE" >&2; exit 1; }

echo "⚠️  ECRASE TOUT le cluster (taskforce + keycloak_prod + umami) avec : $FILE"
echo "    Ctrl-C pour annuler — restauration dans 5 s…"
sleep 5

echo "[restore] arrêt des services connectés : $SERVICES"
# shellcheck disable=SC2086
docker stop $SERVICES >/dev/null 2>&1 || true

echo "[restore] import du dump (via la base de maintenance 'postgres')…"
gunzip -c "$FILE" | docker exec -i "$CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d postgres -q'

echo "[restore] redémarrage des services…"
# shellcheck disable=SC2086
docker start $SERVICES >/dev/null 2>&1 || true
echo "[restore] terminé depuis $FILE (laisse ~30 s aux services pour redevenir healthy)"
