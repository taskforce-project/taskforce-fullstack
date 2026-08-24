#!/usr/bin/env bash
# Genere la spec OpenAPI REELLE depuis le backend TaskForce en marche,
# pour alimenter la reference API de la doc Fern (fern/openapi/openapi.json).
#
# Pre-requis : le backend tourne et sert /api-docs (springdoc, actif partout SAUF en prod).
#   docker compose -f docker-compose.dev.yml up -d backend
#
# Usage :
#   ./fern/scripts/generate-openapi.sh
#   TF_API_URL=http://localhost:8080 ./fern/scripts/generate-openapi.sh
set -euo pipefail

BASE="${TF_API_URL:-http://localhost:8080}"
BASE="${BASE%/}"
SRC="${BASE}/api-docs"
OUT="$(cd "$(dirname "$0")/.." && pwd)/openapi/openapi.json"

echo "-> Recuperation de la spec depuis ${SRC}"
if ! curl -fsS --max-time 20 "${SRC}" -o /tmp/tf-openapi.json; then
  echo "Backend injoignable sur ${SRC}. Demarre le stack dev (docker compose -f docker-compose.dev.yml up -d backend) puis reessaie." >&2
  exit 1
fi

# Reformatage indente si jq est dispo (diff Git lisible), sinon on garde le brut.
if command -v jq >/dev/null 2>&1; then
  jq . /tmp/tf-openapi.json > "${OUT}"
else
  cp /tmp/tf-openapi.json "${OUT}"
fi
echo "OK -> ${OUT}"
