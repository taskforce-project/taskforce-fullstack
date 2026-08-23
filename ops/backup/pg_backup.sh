#!/usr/bin/env bash
# Sauvegarde COMPLÈTE du cluster PostgreSQL prod TaskForce (pg_dumpall) avec ROTATION.
#
# Couvre TOUTES les bases + les rôles :
#   - taskforce      (données applicatives)
#   - keycloak_prod  (auth : utilisateurs + IdP GitHub + secret + flows)  ← indispensable, sinon faux filet
#   - umami          (analytics)
# Un dump d'une seule base laisserait l'auth hors sauvegarde → une restauration désynchroniserait
# les comptes applicatifs et les comptes Keycloak.
#
# Léger : cluster ~90 Mio → dump gzippé de quelques centaines de Kio. Rotation = borne l'espace disque.
#
#   BACKUP_DIR   répertoire de sortie      (défaut: ~/backups)
#   KEEP         nombre de dumps conservés (défaut: 14)
#   PG_CONTAINER conteneur postgres        (défaut: taskforce-postgres-prod)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP="${KEEP:-14}"
CONTAINER="${PG_CONTAINER:-taskforce-postgres-prod}"

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/taskforce-cluster-$TS.sql.gz"
TMP="$OUT.partial"

# pg_dumpall s'exécute DANS le conteneur avec le superutilisateur $POSTGRES_USER — aucun secret ici.
# --clean --if-exists : la restauration recrée proprement bases + rôles.
if docker exec "$CONTAINER" sh -c 'pg_dumpall -U "$POSTGRES_USER" --clean --if-exists' | gzip -9 > "$TMP"; then
  mv "$TMP" "$OUT"
else
  rm -f "$TMP"
  echo "[backup] ECHEC du pg_dumpall" >&2
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"

# Rotation : supprime les dumps au-delà des $KEEP plus récents.
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/taskforce-cluster-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))")
if [ "${#OLD[@]}" -gt 0 ]; then rm -f "${OLD[@]}"; fi

COUNT="$(ls -1 "$BACKUP_DIR"/taskforce-cluster-*.sql.gz 2>/dev/null | wc -l)"
echo "[backup] OK  $OUT ($SIZE) — conservés: $COUNT/$KEEP, purgés: ${#OLD[@]}"
