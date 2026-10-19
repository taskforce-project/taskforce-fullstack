#!/bin/sh
# Writes .env for docker-compose.yml from .env.selfhost.example, with fresh secrets.
# Never touches an existing .env: its secrets protect the data already stored.
set -eu
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env already exists, nothing changed. Its secrets protect your data: keep it, or move it away to start over."
  exit 0
fi

secret() {
  od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
}

tr -d '\r' < .env.selfhost.example > .env.tmp
for key in DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_CLIENT_SECRET MINIO_ROOT_PASSWORD TF_ENCRYPTION_KEY \
           AI_SERVICE_TOKEN TF_HUMAN_CHALLENGE_SECRET; do
  value=$(secret)
  sed "s|^$key=.*|$key=$value|" .env.tmp > .env.next
  mv .env.next .env.tmp
done
mv .env.tmp .env
chmod 600 .env

echo ".env written with new secrets."
echo "Next: docker compose up -d --build, then open $(sed -n 's/^TF_APP_URL=//p' .env) and create your account."
echo "Keycloak console (password resets): $(sed -n 's/^TF_KEYCLOAK_URL=//p' .env), user admin, password KEYCLOAK_ADMIN_PASSWORD in .env."
