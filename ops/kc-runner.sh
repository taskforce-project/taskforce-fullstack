#!/usr/bin/env bash
# =============================================================================
# Provisionne le compte de service d'un runner local de délégation (ADR-013) dans
# le realm Keycloak de PROD. Équivalent Linux/prod de scripts/keycloak-runner.ps1 (dev/Windows).
#
# Crée, de façon IDEMPOTENTE :
#   1. le rôle de realm `delivery-runner` ;
#   2. un client confidentiel `tf-runner-<name>` réduit au grant client_credentials
#      (aucun flux navigateur, aucun password grant) ;
#   3. le rôle, porté par le compte de service de ce client ;
#   4. un mapper « hardcoded claim » qui signe le PROPRIÉTAIRE du runner dans le jeton
#      (`tf_runner_owner` = e-mail), seul un admin du realm peut le changer.
# La durée de vie du jeton = celle du realm prod (30 min) : courte = révocation rapide.
#
# Le secret du client est AFFICHÉ une fois (à copier dans le .env du runner, sur le poste).
# Le mot de passe admin Keycloak est lu dans .env.prod, jamais passé en argument.
#
# USAGE (sur la VM1) :   bash ops/kc-runner.sh --owner <email-TaskForce> --name pierre
#   --realm <realm>        (défaut : $KC_REALM ou taskforce-prod)
#   --container <nom>      (défaut : taskforce-keycloak-prod)
#   --env-file <chemin>    (défaut : $HOME/taskforce/.env.prod)
#   --rotate-secret        (régénère le secret)
# =============================================================================
set -euo pipefail

OWNER=""; NAME=""; ROTATE=0
REALM="${KC_REALM:-taskforce-prod}"
KC="${KC_CONTAINER:-taskforce-keycloak-prod}"
ENV_FILE="${ENV_FILE:-$HOME/taskforce/.env.prod}"
ROLE="delivery-runner"; CLAIM="tf_runner_owner"; MAPPER="tf-runner-owner"

while [ $# -gt 0 ]; do case "$1" in
  --owner) OWNER="$2"; shift 2;; --name) NAME="$2"; shift 2;;
  --realm) REALM="$2"; shift 2;; --container) KC="$2"; shift 2;;
  --env-file) ENV_FILE="$2"; shift 2;; --rotate-secret) ROTATE=1; shift;;
  *) echo "argument inconnu : $1" >&2; exit 2;; esac; done

[ -n "$OWNER" ] && [ -n "$NAME" ] || { echo "usage: bash ops/kc-runner.sh --owner <email> --name <nom>"; exit 2; }
echo "$OWNER" | grep -qE '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' || { echo "owner doit être un e-mail : $OWNER"; exit 2; }
echo "$NAME"  | grep -qE '^[a-z0-9][a-z0-9-]{1,40}$' || { echo "name : minuscules/chiffres/tirets"; exit 2; }
OWNER="$(printf '%s' "$OWNER" | tr '[:upper:]' '[:lower:]')"
CLIENT="tf-runner-$NAME"

K(){ docker exec -i "$KC" /opt/keycloak/bin/kcadm.sh "$@"; }

ADMIN_PW="$(grep -E '^KEYCLOAK_ADMIN_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
ADMIN_USER="$(grep -E '^KEYCLOAK_ADMIN_USERNAME=' "$ENV_FILE" | cut -d= -f2-)"
[ -n "$ADMIN_PW" ] || { echo "KEYCLOAK_ADMIN_PASSWORD introuvable dans $ENV_FILE"; exit 1; }
K config credentials --server http://localhost:8080 --realm master --user "${ADMIN_USER:-admin}" --password "$ADMIN_PW" >/dev/null
echo "[kc-runner] connecté au realm master (realm cible : $REALM)"

# 1. Rôle
if K get "roles/$ROLE" -r "$REALM" >/dev/null 2>&1; then echo "[kc-runner] rôle '$ROLE' déjà présent"
else K create roles -r "$REALM" -s "name=$ROLE" -s "description=Runner local de délégation (ADR-013)" >/dev/null; echo "[kc-runner] rôle '$ROLE' créé"; fi

# 2. Client confidentiel, client_credentials uniquement
UUID="$(K get clients -r "$REALM" -q clientId="$CLIENT" --fields id --format csv --noquotes 2>/dev/null | head -1)"
ARGS=(-s enabled=true -s publicClient=false -s serviceAccountsEnabled=true \
      -s standardFlowEnabled=false -s implicitFlowEnabled=false -s directAccessGrantsEnabled=false \
      -s "description=Runner local (ADR-013) - propriétaire : $OWNER")
if [ -n "$UUID" ]; then echo "[kc-runner] client '$CLIENT' déjà présent : mise à jour"; K update "clients/$UUID" -r "$REALM" "${ARGS[@]}" >/dev/null
else echo "[kc-runner] client '$CLIENT' : création"; K create clients -r "$REALM" -s "clientId=$CLIENT" "${ARGS[@]}" >/dev/null
     UUID="$(K get clients -r "$REALM" -q clientId="$CLIENT" --fields id --format csv --noquotes 2>/dev/null | head -1)"; fi
[ -n "$UUID" ] || { echo "client '$CLIENT' introuvable après création"; exit 1; }

# 3. Rôle porté par le compte de service
SAID="$(K get "clients/$UUID/service-account-user" -r "$REALM" --fields id --format csv --noquotes 2>/dev/null | head -1)"
[ -n "$SAID" ] || { echo "compte de service introuvable"; exit 1; }
K add-roles -r "$REALM" --uid "$SAID" --rolename "$ROLE" >/dev/null && echo "[kc-runner] rôle porté par service-account-$CLIENT"

# 4. Propriétaire signé dans le jeton (supprime puis recrée -> suit --owner)
for mid in $(K get "clients/$UUID/protocol-mappers/models" -r "$REALM" 2>/dev/null | awk -F'"' -v n="$MAPPER" '$2=="name"&&$4==n{print prev} $2=="id"{prev=$4}'); do
  K delete "clients/$UUID/protocol-mappers/models/$mid" -r "$REALM" >/dev/null 2>&1 || true
done
K create "clients/$UUID/protocol-mappers/models" -r "$REALM" -b "{\"name\":\"$MAPPER\",\"protocol\":\"openid-connect\",\"protocolMapper\":\"oidc-hardcoded-claim-mapper\",\"config\":{\"claim.name\":\"$CLAIM\",\"claim.value\":\"$OWNER\",\"jsonType.label\":\"String\",\"access.token.claim\":\"true\",\"id.token.claim\":\"false\",\"userinfo.token.claim\":\"false\"}}" >/dev/null
echo "[kc-runner] propriétaire signé : $CLAIM = $OWNER"

# 5. Secret (affiché une fois, à copier dans le .env du runner sur le poste)
[ "$ROTATE" = "1" ] && { K create "clients/$UUID/client-secret" -r "$REALM" >/dev/null; echo "[kc-runner] secret régénéré"; }
SECRET="$(K get "clients/$UUID/client-secret" -r "$REALM" --fields value --format csv --noquotes 2>/dev/null | head -1)"
[ -n "$SECRET" ] || { echo "secret illisible"; exit 1; }

echo
echo "==================== RUNNER PRÊT (realm $REALM) ===================="
echo "À mettre dans taskforce-runner/.env, SUR TON POSTE :"
echo "  TASKFORCE_RUNNER_CLIENT_ID=$CLIENT"
echo "  TASKFORCE_RUNNER_CLIENT_SECRET=$SECRET"
echo "===================================================================="
echo "Révoquer plus tard : désactiver/supprimer le client '$CLIENT' dans Keycloak."
