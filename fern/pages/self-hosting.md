---
title: Self-hosting
subtitle: Run TaskForce on one machine with Docker.
---

TaskForce runs on one machine with Docker: the app, its API, sign-in (Keycloak), the database (PostgreSQL), file
storage (MinIO) and a small AI gateway. Your data stays on that machine. AI comes from Ollama on the same machine by
default, or from any OpenAI-compatible API you choose.

## Requirements

- Docker with Compose v2: Docker Desktop on Windows and macOS, Docker Engine and its compose plugin on Linux.
- About 6 GB of free memory for TaskForce and 10 GB of disk, more for your data.
- Optional, for AI: [Ollama](https://ollama.com) with `qwen3:8b` (chat) and `bge-m3` (search), about 6 GB of models.
  A GPU makes answers much faster.

## Install

```bash
git clone https://github.com/taskforce-project/taskforce-fullstack.git
cd taskforce-fullstack
./scripts/selfhost-init.sh          # Windows PowerShell: .\scripts\selfhost-init.ps1
docker compose up -d --build
```

`selfhost-init` writes `.env` from `.env.selfhost.example` with new secrets. It never overwrites an existing `.env`:
the secrets in it protect your database and your encrypted data, so back it up with them.

The first start builds the images from the repository and takes 10 to 20 minutes, depending on the machine and the
connection. Then open `http://localhost:3000` and create your account: the first person to sign up gets a workspace
and can invite the others.

`docker compose ps` shows each service; `docker compose logs -f backend` follows the API if something looks wrong.

## AI

Without AI, everything else works: Cortex and issue drafting say that AI is not configured, and search falls back to
plain text.

- **Ollama on this machine** (default): install Ollama, then `ollama pull qwen3:8b` and `ollama pull bge-m3`. On Linux,
  make Ollama listen beyond localhost so the containers can reach it (`OLLAMA_HOST=0.0.0.0` in its service settings).
- **Ollama in a container**: `docker compose --profile ollama up -d`, set `OLLAMA_BASE_URL=http://ollama:11434` in
  `.env`, then `docker compose exec ollama ollama pull qwen3:8b` and the same for `bge-m3`.
- **An OpenAI-compatible API** (OpenAI, Groq, Mistral, a vLLM server...): set `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`
  and `AI_MODEL_FAST` in `.env`.

AI use counts against the owner of each workspace. To cap it, set `AI_MONTHLY_TOKENS_PER_ACCOUNT`: tokens per month
for all the workspaces of one owner, `0` for no cap. After a change in `.env`: `docker compose up -d`.

## Email

TaskForce sends sign-up codes, invitations and password resets by email. Without an SMTP server (the default):

- sign-up does not verify addresses, so anyone who reaches the app can create an account with any address, including
  one you invited. Keep the instance on a private network, or configure email;
- invitations are not emailed: the invited person signs up with the invited address and finds the invitation in the
  app;
- a forgotten password is reset by an admin in the Keycloak console (`http://localhost:8180`, user `admin`, password
  `KEYCLOAK_ADMIN_PASSWORD` in `.env`): realm `taskforce`, Users, the person, Credentials, Reset password.

With an SMTP server, fill the `MAIL_*` values in `.env`, set `SIGNUP_EMAIL_VERIFICATION=true` and run
`docker compose up -d`.

## Using it from other machines

By default every port listens on this machine only (`BIND_ADDRESS=127.0.0.1`). To open it to your network:

1. In `.env`, set `BIND_ADDRESS=0.0.0.0` and replace `localhost` with this machine's address in `TF_APP_URL`,
   `TF_API_URL`, `TF_KEYCLOAK_URL` and `TF_STORAGE_URL`.
   If you stay on plain http, also set `AUTH_REFRESH_COOKIE_SECURE=false`: browsers drop secure cookies over http
   (localhost aside), and sessions would end after 30 minutes.
2. Rebuild the app, which keeps the addresses it was built with: `docker compose up -d --build`.

<Warning>
  Sign-in sends passwords to the API. Beyond a trusted network, serve the four addresses over HTTPS with a reverse
  proxy (Caddy, nginx, Traefik) and use the `https://` addresses in `.env`.
</Warning>

Keycloak keeps the addresses it was first started with for its realm: after changing `TF_APP_URL` or `TF_API_URL`,
update the client `taskforce-api` (Valid redirect URIs, Web origins) in the Keycloak console.

## Coding agents and integrations

- Each person can delegate issues to Claude Code running on their own computer: see
  [Coding agents](/guides/coding-agents). The runner only talks to the API, at `TF_API_URL`.
- GitHub and Slack need an OAuth app of your own, with `<TF_API_URL>/api/integrations/github/callback` and
  `<TF_API_URL>/api/integrations/slack/callback` as callback URLs: see [Integrations](/guides/integrations).
- MCP servers and webhook receivers on your own network are refused unless you set `MCP_ALLOW_PRIVATE_NETWORK=true` or
  `WEBHOOKS_ALLOW_PRIVATE_NETWORK=true`.

## Update

```bash
git pull
docker compose up -d --build
```

Database changes apply by themselves when the API starts. Back up before updating.

## Backup and restore

What to keep: `.env`, the database and the files.

```bash
docker compose exec -T postgres pg_dumpall -U taskforce > taskforce-backup.sql
docker run --rm -v taskforce_minio_data:/data -v "$PWD":/backup alpine tar czf /backup/taskforce-files.tgz -C /data .
```

The dump contains both the TaskForce and the Keycloak databases. To restore on a fresh install, start only PostgreSQL
(`docker compose up -d postgres`), load the dump
(`docker compose exec -T postgres psql -U taskforce -d postgres < taskforce-backup.sql`), restore the files into the
`taskforce_minio_data` volume, then `docker compose up -d`. Use the same `.env` as the backup. Errors about roles or
databases that already exist are expected: the first start created them.

## Stop or remove

- `docker compose stop` stops everything and keeps your data.
- `docker compose down -v` deletes everything, data included.
