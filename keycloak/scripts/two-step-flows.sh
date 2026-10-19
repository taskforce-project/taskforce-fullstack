#!/bin/sh
# Two-step verification on the hosted account, for every way of signing in (desktop app, account page, GitHub,
# Google). Run inside the Keycloak container: sh two-step-flows.sh <realm>. Uses KEYCLOAK_ADMIN and
# KEYCLOAK_ADMIN_PASSWORD from the container's environment and prints no secret.
#
# - Role `tf-two-step-verification`: the account turned two-step verification on in the web app (the backend keeps
#   the role in sync). Keycloak then always asks for a one-time code, and has the person set up an authenticator
#   app first if they have none in Keycloak yet.
# - Any other account that set up an authenticator app in Keycloak is asked for its code too.
# - Flow `tf-browser` (password sign-in) replaces the realm's browser flow; flow `tf-post-broker` runs after a GitHub
#   or Google sign-in, which skipped the code until now.
#
# Idempotent: an existing role or flow is left as it is. To undo, bind the realm's browser flow back to `browser`
# and clear the identity providers' post-login flow.
set -e
R="${1:?usage: two-step-flows.sh <realm>}"
ROLE=tf-two-step-verification
K=/opt/keycloak/bin/kcadm.sh
C="--config /tmp/kcadm-two-step.config"
trap 'rm -f /tmp/kcadm-two-step.config' EXIT

$K config credentials --server http://localhost:8080 --realm master --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD" $C >/dev/null

# Execution id of the entry named $2 (display name) in flow $1.
exec_id() {
  $K get "authentication/flows/$1/executions" -r "$R" $C | tr -d '\n' | sed 's/}, *{/}\n{/g' \
    | grep "\"displayName\" : \"$2\"" | grep -o '"id" : "[^"]*"' | head -1 | cut -d'"' -f4
}

# Adds provider $2 to flow $1 with requirement $3; prints the execution id.
add_exec() {
  id=$($K create "authentication/flows/$1/executions/execution" -r "$R" -s "provider=$2" -i $C)
  $K update "authentication/flows/$1/executions" -r "$R" -b "{\"id\":\"$id\",\"requirement\":\"$3\"}" $C
  echo "$id"
}

# Adds subflow $2 to flow $1 with requirement $3.
add_subflow() {
  $K create "authentication/flows/$1/executions/flow" -r "$R" \
    -b "{\"alias\":\"$2\",\"type\":\"basic-flow\",\"provider\":\"registration-page-form\",\"description\":\"$4\"}" $C >/dev/null
  $K update "authentication/flows/$1/executions" -r "$R" -b "{\"id\":\"$(exec_id "$1" "$2")\",\"requirement\":\"$3\"}" $C
}

# Role condition on execution $1 (negated when $2 is true).
role_condition() {
  $K create "authentication/executions/$1/config" -r "$R" \
    -b "{\"alias\":\"$3\",\"config\":{\"condUserRole\":\"$ROLE\",\"negate\":\"$2\"}}" $C >/dev/null
}

# The two conditional steps, appended to flow $1 (prefix $2 for the subflow names).
two_step_subflows() {
  add_subflow "$1" "$2-two-step-users" CONDITIONAL "Accounts with two-step verification on in the web app"
  role_condition "$(add_exec "$2-two-step-users" conditional-user-role REQUIRED)" false "$2-has-two-step-role"
  add_exec "$2-two-step-users" auth-otp-form REQUIRED >/dev/null

  add_subflow "$1" "$2-otp" CONDITIONAL "Other accounts with an authenticator app"
  role_condition "$(add_exec "$2-otp" conditional-user-role REQUIRED)" true "$2-has-no-two-step-role"
  add_exec "$2-otp" conditional-user-configured REQUIRED >/dev/null
  add_exec "$2-otp" auth-otp-form REQUIRED >/dev/null
}

flow_exists() {
  $K get authentication/flows -r "$R" --fields alias $C | grep -q "\"alias\" : \"$1\""
}

# The one-time code form can only have the person set up an authenticator app if that required action is on.
if ! $K get authentication/required-actions/CONFIGURE_TOTP -r "$R" $C >/dev/null 2>&1; then
  $K create authentication/register-required-action -r "$R" -s providerId=CONFIGURE_TOTP -s "name=Configure OTP" $C
fi
$K update authentication/required-actions/CONFIGURE_TOTP -r "$R" -s enabled=true $C
echo "required action CONFIGURE_TOTP: on"

if $K get "roles/$ROLE" -r "$R" $C >/dev/null 2>&1; then
  echo "role $ROLE: already there"
else
  $K create roles -r "$R" -s "name=$ROLE" \
    -s "description=Two-step verification turned on in the web app: a one-time code is always required" $C
  echo "role $ROLE: created"
fi

if flow_exists tf-browser; then
  echo "flow tf-browser: already there"
else
  $K create authentication/flows -r "$R" -s alias=tf-browser -s providerId=basic-flow -s topLevel=true -s builtIn=false \
    -s "description=Browser sign-in with two-step verification" $C >/dev/null
  add_exec tf-browser auth-cookie ALTERNATIVE >/dev/null
  add_exec tf-browser identity-provider-redirector ALTERNATIVE >/dev/null
  add_subflow tf-browser tf-browser-forms ALTERNATIVE "Password, then the one-time code when it applies"
  add_exec tf-browser-forms auth-username-password-form REQUIRED >/dev/null
  two_step_subflows tf-browser-forms tf-browser
  echo "flow tf-browser: created"
fi

if flow_exists tf-post-broker; then
  echo "flow tf-post-broker: already there"
else
  $K create authentication/flows -r "$R" -s alias=tf-post-broker -s providerId=basic-flow -s topLevel=true -s builtIn=false \
    -s "description=After a GitHub or Google sign-in: two-step verification" $C >/dev/null
  two_step_subflows tf-post-broker tf-post-broker
  echo "flow tf-post-broker: created"
fi

$K update "realms/$R" -s browserFlow=tf-browser $C
echo "realm browser flow: tf-browser"
for idp in $($K get identity-provider/instances -r "$R" --fields alias $C | grep -o '"alias" : "[^"]*"' | cut -d'"' -f4); do
  $K update "identity-provider/instances/$idp" -r "$R" -s postBrokerLoginFlowAlias=tf-post-broker $C
  echo "identity provider $idp: after sign-in, tf-post-broker"
done
