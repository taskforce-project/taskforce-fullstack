#!/bin/sh
# Lets the API open the session of a person who signs in with a passkey. Run it once per realm, from the repository:
#   docker exec -i <keycloak container> sh -s <realm> [client] < keycloak/scripts/passkey-sessions.sh
# Uses the admin account from the container's environment (KEYCLOAK_ADMIN or KC_BOOTSTRAP_ADMIN_USERNAME, and its
# password) and prints no secret.
#
# The API checks the passkey itself (WebAuthn), then asks Keycloak for the person's tokens through token exchange with
# a requested subject ("direct naked impersonation"). Keycloak only allows that to a confidential client holding the
# impersonate permission on users: this script grants it to the API's client, taskforce-api unless another is named.
#
# Keycloak must run with the features token-exchange and admin-fine-grained-authz (Keycloak 23), or token-exchange
# and admin-fine-grained-authz:v1 (Keycloak 26): KC_FEATURES in the compose files.
#
# Idempotent. To undo, delete the policy tf-passkey-sessions (client realm-management, Authorization, Policies).
set -e
R="${1:?usage: passkey-sessions.sh <realm> [client]}"
CLIENT="${2:-taskforce-api}"
POLICY=tf-passkey-sessions
K=/opt/keycloak/bin/kcadm.sh
C="--config /tmp/kcadm-passkeys.config"
trap 'rm -f /tmp/kcadm-passkeys.config' EXIT

ADMIN="${KEYCLOAK_ADMIN:-$KC_BOOTSTRAP_ADMIN_USERNAME}"
PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-$KC_BOOTSTRAP_ADMIN_PASSWORD}"
$K config credentials --server http://localhost:8080 --realm master --user "$ADMIN" --password "$PASSWORD" $C >/dev/null

# Internal id of the client named $1.
client_uuid() {
  $K get clients -r "$R" -q "clientId=$1" --fields id --format csv --noquotes $C | head -1
}

API=$(client_uuid "$CLIENT")
[ -n "$API" ] || { echo "client $CLIENT not found in realm $R" >&2; exit 1; }
AUTHZ="clients/$(client_uuid realm-management)/authz/resource-server"

# Permissions on users: Keycloak creates the impersonate permission the first time.
$K update users-management-permissions -r "$R" -s enabled=true $C
PERM=$($K get users-management-permissions -r "$R" $C | tr -d ' \n' | grep -o '"impersonate":"[^"]*"' | cut -d'"' -f4)
[ -n "$PERM" ] || { echo "no impersonate permission in realm $R" >&2; exit 1; }

# Policy matching the API's client.
policy_id() {
  $K get "$AUTHZ/policy" -r "$R" -q "name=$POLICY" --fields id,name --format csv --noquotes $C | grep ",$POLICY\$" | cut -d, -f1
}
POL=$(policy_id)
if [ -n "$POL" ]; then
  echo "policy $POLICY: already there"
else
  $K create "$AUTHZ/policy/client" -r "$R" $C \
    -b "{\"name\":\"$POLICY\",\"description\":\"The API opens the session of a person who signed in with a passkey\",\"logic\":\"POSITIVE\",\"clients\":[\"$API\"]}" >/dev/null
  POL=$(policy_id)
  echo "policy $POLICY: created"
fi

# The permission is granted when one of its policies matches: the API's client, or a policy an admin added for people.
ASSOC=$($K get "$AUTHZ/policy/$PERM/associatedPolicies" -r "$R" --fields id --format csv --noquotes $C)
if echo "$ASSOC" | grep -qx "$POL"; then
  echo "permission impersonate: already granted to $CLIENT"
else
  LIST=""
  for id in $ASSOC $POL; do LIST="$LIST${LIST:+,}\"$id\""; done
  $K update "$AUTHZ/permission/scope/$PERM" -r "$R" -s "policies=[$LIST]" -s decisionStrategy=AFFIRMATIVE $C
  echo "permission impersonate: granted to $CLIENT"
fi
