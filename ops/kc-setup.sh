#!/usr/bin/env bash
# =============================================================================
# Configuration IDEMPOTENTE de la connexion sociale Keycloak (realm taskforce-prod)
# =============================================================================
# Rejoue toute la config OAuth : IdPs GitHub + Google + flow « first broker login autolink »
# (seamless — aucune page Keycloak : nouvel email → compte créé, email existant → auto-link).
#
# ⚠️ POURQUOI CE SCRIPT : ces réglages ne vivent PAS dans keycloak/realms/prod/*.json — le realm
#    n'est importé qu'au 1er boot de Keycloak. Ils sont stockés dans la base `keycloak_prod` (incluse
#    dans les sauvegardes `ops/backup/`). Ce script est la SOURCE DE VÉRITÉ reproductible : à rejouer
#    si le realm est recréé / réimporté. Sûr à relancer autant de fois que voulu.
#
# SECRETS PAR VARIABLE D'ENV (jamais en dur — règle d'or #8). Exporter avant de lancer :
#   export GITHUB_IDP_CLIENT_ID=...  GITHUB_IDP_CLIENT_SECRET=...
#   export GOOGLE_IDP_CLIENT_ID=...  GOOGLE_IDP_CLIENT_SECRET=...
#   (omettre une paire → l'IdP correspondant est laissé tel quel / ignoré.)
# Le mot de passe admin Keycloak est lu dans .env.prod (jamais passé en argument visible).
#
# USAGE (sur la VM1) :  bash ops/kc-setup.sh
# =============================================================================
set -euo pipefail

REALM="${KC_REALM:-taskforce-prod}"
KC="${KC_CONTAINER:-taskforce-keycloak-prod}"
ENV_FILE="${ENV_FILE:-$HOME/taskforce/.env.prod}"
FLOW_NAME="first broker login autolink"
FLOW_ENC="first%20broker%20login%20autolink"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT

K(){ docker exec "$KC" /opt/keycloak/bin/kcadm.sh "$@"; }

# ---- Authentification admin (mot de passe lu dans .env.prod) ----
ADMIN_PW="$(grep -E '^KEYCLOAK_ADMIN_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
ADMIN_USER="$(grep -E '^KEYCLOAK_ADMIN_USERNAME=' "$ENV_FILE" | cut -d= -f2-)"
K config credentials --server http://localhost:8080 --realm master --user "${ADMIN_USER:-admin}" --password "$ADMIN_PW" >/dev/null
echo "[kc-setup] connecté au realm master"

# ---- Realm : anglais par défaut (les rares pages KC restent en EN) ----
K update "realms/$REALM" -s defaultLocale=en >/dev/null && echo "[kc-setup] realm defaultLocale=en"

# ---- Flow seamless : copie ÉDITABLE du built-in + authenticator idp-auto-link ----
# (on NE PEUT PAS éditer le flow built-in « first broker login » → on le copie.)
configure_flow(){
  if ! K get "authentication/flows/$FLOW_ENC/executions" -r "$REALM" >/dev/null 2>&1; then
    echo "[kc-setup] flow '$FLOW_NAME' : création (copie de 'first broker login')"
    K create 'authentication/flows/first%20broker%20login/copy' -r "$REALM" -b "{\"newName\":\"$FLOW_NAME\"}" >/dev/null
  else
    echo "[kc-setup] flow '$FLOW_NAME' : déjà présent (reconfiguration)"
  fi

  local CFLOW="authentication/flows/$FLOW_ENC/executions"
  K get "$CFLOW" -r "$REALM" > "$TMP"
  # id d'une exécution par son displayName. NB : dans une copie, les SOUS-FLOWS sont préfixés par le
  # nom du flow (« first broker login autolink Handle Existing Account »), pas les feuilles.
  id_of(){ awk -F'"' -v n="$1" '$2=="id"{id=$4} $2=="displayName" && $4==n{print id; exit}' "$TMP"; }
  set_req(){ K update "$CFLOW" -r "$REALM" -b "{\"id\":\"$1\",\"requirement\":\"$2\"}" >/dev/null; }

  local id
  for name in "Review Profile" "Confirm link existing account" "$FLOW_NAME Account verification options"; do
    id="$(id_of "$name")"; if [ -n "$id" ]; then set_req "$id" DISABLED; echo "  - DISABLED : $name"; fi
  done

  # Ajouter « Automatically set existing user » (idp-auto-link) dans le sous-flow Handle Existing Account.
  if [ -z "$(id_of 'Automatically set existing user')" ]; then
    local flowid alias ealias
    flowid="$(grep -A12 "\"displayName\" : \"$FLOW_NAME Handle Existing Account\"" "$TMP" | awk -F'"' '/flowId/{print $4; exit}')"
    alias="$(K get "authentication/flows/$flowid" -r "$REALM" | awk -F'"' '$2=="alias"{print $4; exit}')"
    ealias="$(printf '%s' "$alias" | sed 's/ /%20/g')"
    K create "authentication/flows/$ealias/executions/execution" -r "$REALM" -b '{"provider":"idp-auto-link"}' >/dev/null
    echo "  + idp-auto-link ajouté"
    K get "$CFLOW" -r "$REALM" > "$TMP"
  fi
  id="$(id_of 'Automatically set existing user')"; if [ -n "$id" ]; then set_req "$id" REQUIRED; echo "  - REQUIRED : Automatically set existing user"; fi
}
configure_flow

# ---- IdP (create-or-update, idempotent) ----
ensure_idp(){
  local alias="$1" provider="$2" scope="$3" cid="$4" secret="$5"
  if [ -z "$cid" ] || [ -z "$secret" ]; then echo "[kc-setup] IdP '$alias' : ignoré (creds absents)"; return; fi
  local action=create path=identity-provider/instances base
  base=(-s "providerId=$provider" -s enabled=true -s trustEmail=true -s storeToken=false \
        -s "firstBrokerLoginFlowAlias=$FLOW_NAME" \
        -s "config.clientId=$cid" -s "config.clientSecret=$secret" -s "config.defaultScope=$scope")
  if K get "identity-provider/instances/$alias" -r "$REALM" >/dev/null 2>&1; then
    K update "identity-provider/instances/$alias" -r "$REALM" "${base[@]}" >/dev/null; action=update
  else
    K create identity-provider/instances -r "$REALM" -s "alias=$alias" "${base[@]}" >/dev/null
  fi
  echo "[kc-setup] IdP '$alias' ($provider) : $action + enabled + flow autolink"
}
ensure_idp github github "user:email read:user" "${GITHUB_IDP_CLIENT_ID:-}" "${GITHUB_IDP_CLIENT_SECRET:-}"
ensure_idp google google "openid profile email" "${GOOGLE_IDP_CLIENT_ID:-}" "${GOOGLE_IDP_CLIENT_SECRET:-}"

echo "[kc-setup] terminé. Callbacks à déclarer côté fournisseur :"
echo "  GitHub : https://auth.taskforce-project.fr/realms/$REALM/broker/github/endpoint"
echo "  Google : https://auth.taskforce-project.fr/realms/$REALM/broker/google/endpoint"
