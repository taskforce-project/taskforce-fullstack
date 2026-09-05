#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Auto-déploiement prod TaskForce.
# Lancé par un timer systemd (utilisateur pmichel). Poll origin/main ; si le HEAD
# a bougé ET qu'on est bien checkout sur main ET que c'est un fast-forward, on
# pull et on rebuild UNIQUEMENT le(s) service(s) que cette VM sert (rôle).
# Idempotent : ne fait rien si rien n'a changé. Sûr : ne touche jamais à une
# autre branche (garde-fou HEAD==main), ne force jamais un merge non-ff.
# ─────────────────────────────────────────────────────────────────────────────
# COPIE DE RÉFÉRENCE (versionnée le 2026-09-05).
# Le script RÉEL vit sur chaque VM à ~/taskforce/scripts/auto-deploy.sh, bootstrapé à la main et
# NON synchronisé depuis ce repo : si on modifie une VM, mettre ce fichier à jour manuellement.
# Unique écart entre VM : la VM frontend exporte APP_VERSION avant le build (branche frontend plus
# bas) ; la VM backend n'en a pas besoin. Cette copie est le surensemble, compatible avec les deux.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO="/home/pmichel/taskforce"
BRANCH="main"
ROLE="$(cat "$REPO/.deploy-role" 2>/dev/null || echo unknown)"   # backend | frontend
LOG="$REPO/auto-deploy.log"

cd "$REPO" 2>/dev/null || exit 1
# Journalise tout (append), en gardant le fichier borné.
exec >>"$LOG" 2>&1
# Rotation naïve : garde ~2000 dernières lignes.
if [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt 4000 ]; then tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi

echo "=== $(date -Is) poll origin/$BRANCH (role=$ROLE) ==="

# Auto-nettoyage disque (ajout 2026-09-05) : le cache de build Docker gonfle a chaque build et a
# deja sature la VM (100% -> git fetch KO silencieux -> deploiement fige). Si le disque depasse
# 85%, on purge le cache de build + les images dangling. JAMAIS --volumes : la DB (postgres),
# MinIO, Keycloak et Redis vivent dans des volumes, ils NE sont PAS touches ; les images des
# conteneurs en service non plus.
USE=$(df / | awk 'NR==2{gsub(/%/,"",$5); print $5}')
if [ "${USE:-0}" -ge 85 ]; then
  echo "  disque a ${USE}% -> docker builder prune -af + docker image prune -f (jamais --volumes)"
  docker builder prune -af >/dev/null 2>&1 || true
  docker image prune -f  >/dev/null 2>&1 || true
  USE2=$(df / | awk 'NR==2{gsub(/%/,"",$5); print $5}')
  echo "  disque apres prune : ${USE2}%"
fi

git fetch --quiet origin "$BRANCH" || { echo "  fetch KO — skip"; exit 0; }
LOCAL="$(git rev-parse HEAD 2>/dev/null)" || exit 0
REMOTE="$(git rev-parse "origin/$BRANCH" 2>/dev/null)" || { echo "  pas d'origin/$BRANCH — skip"; exit 0; }

if [ "$LOCAL" = "$REMOTE" ]; then echo "  à jour ($LOCAL)"; exit 0; fi

# Garde-fou #1 : on ne déploie QUE si la VM est réellement sur la branche cible.
CUR="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
if [ "$CUR" != "$BRANCH" ]; then echo "  SKIP: HEAD sur '$CUR' != '$BRANCH' (activation pas encore faite)"; exit 0; fi

CHANGED="$(git diff --name-only "$LOCAL" "$REMOTE")"

# Garde-fou #2 : fast-forward uniquement (jamais de merge/rebase auto).
if ! git merge --ff-only "origin/$BRANCH" >/dev/null 2>&1; then
  echo "  SKIP: origin/$BRANCH n'est pas un fast-forward de HEAD — intervention manuelle requise"
  exit 0
fi
echo "  pull $LOCAL -> $(git rev-parse HEAD)"
echo "$CHANGED" | sed 's/^/    changed: /'

dc_backend()  { docker compose -p taskforce-prod -f docker-compose.prod.yml -f docker-compose.vm1.yml --env-file .env.prod "$@"; }
dc_frontend() { docker compose -p taskforce-vm2  -f docker-compose.vm2.yml "$@"; }

rebuilt=0
if [ "$ROLE" = "backend" ]; then
  if echo "$CHANGED" | grep -qE '^(backend/|docker-compose\.prod\.yml)'; then
    echo "  → rebuild backend"
    dc_backend build backend && dc_backend up -d backend && rebuilt=1
  fi
  if echo "$CHANGED" | grep -qE '^ai-service/'; then
    echo "  → rebuild ai-service"
    dc_backend build ai-service && dc_backend up -d ai-service && rebuilt=1
  fi
elif [ "$ROLE" = "frontend" ]; then
  if echo "$CHANGED" | grep -qE '^frontend/'; then
    echo "  → rebuild frontend"
    export APP_VERSION="$(git rev-parse --short HEAD)"
    dc_frontend build frontend && dc_frontend up -d frontend && rebuilt=1
  fi
else
  echo "  rôle inconnu ('$ROLE') — pas de rebuild"
fi

[ "$rebuilt" = 0 ] && echo "  (pull appliqué, aucun service de ce rôle impacté)"
echo "=== $(date -Is) fin ==="
