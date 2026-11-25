# Self-hosting TaskForce

TaskForce runs on one machine with Docker: the app, its API, sign-in (Keycloak), the database (PostgreSQL) and file
storage (MinIO). Your data stays on that machine. AI comes from Ollama on the same machine by default, or from any
OpenAI-compatible API or Anthropic's API you choose: the API talks to the provider itself.

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

`selfhost-init` writes `.env` from [`.env.selfhost.example`](./.env.selfhost.example) with new secrets. It never
overwrites an existing `.env`: the secrets in it protect your database and your encrypted data, so back it up with
them.

The first start builds the images from this repository and takes 10 to 20 minutes, depending on the machine and
the connection. Then open <http://localhost:3000> and create your account: the first person to sign up gets a
workspace and can invite the others.

`docker compose ps` shows each service; `docker compose logs -f backend` follows the API if something looks wrong.

## AI

Without AI, everything else works: Cortex and issue drafting say that AI is not configured, and search falls back
to plain text.

- **Ollama on this machine** (default): install Ollama, then `ollama pull qwen3:8b` and `ollama pull bge-m3`. On Linux,
  make Ollama listen beyond localhost so the containers can reach it (`OLLAMA_HOST=0.0.0.0` in its service
  settings).
- **Ollama in a container**: `docker compose --profile ollama up -d`, set `OLLAMA_BASE_URL=http://ollama:11434` in
  `.env`, then `docker compose exec ollama ollama pull qwen3:8b` and the same for `bge-m3`.
- **An OpenAI-compatible API** (OpenAI, Groq, Mistral, a vLLM server...): set `AI_PROVIDER=openai`, `AI_BASE_URL`,
  `AI_API_KEY`, `AI_MODEL` and `AI_MODEL_FAST` in `.env`. Search uses the same API: set `AI_EMBED_MODEL` to one of
  its models that returns vectors of 1024 dimensions, or point `AI_EMBED_BASE_URL` at Ollama.
- **Anthropic's API**: set `AI_PROVIDER=anthropic` and `AI_API_KEY`. Without `AI_MODEL`, TaskForce picks Claude Opus
  for answers and Claude Haiku for quick ones. Anthropic has no search model: search keeps using Ollama (set
  `AI_EMBED_MODEL=bge-m3` to keep the vectors already computed), or the OpenAI-compatible API set in
  `AI_EMBED_BASE_URL`, `AI_EMBED_API_KEY` and `AI_EMBED_MODEL`.

With `AI_PROVIDER` set, a model left empty is picked among those the provider lists; without it, TaskForce uses
`qwen3:8b` and `bge-m3`, as before. `AI_PROVIDER=none` turns AI off.

With Ollama, TaskForce sizes the context window of each request to what it carries (Cortex's instructions and tools,
the screen, the notes, the conversation): from 8,192 tokens up to `AI_OLLAMA_MAX_CONTEXT`, 16,384 by default, or the
model's own maximum if it is smaller. A larger window takes more GPU memory: on an 8 GB GPU, `qwen3:8b` stays
entirely on the GPU up to 16,384 tokens with Ollama's `OLLAMA_KV_CACHE_TYPE=q8_0`. With more memory, set
`AI_OLLAMA_MAX_CONTEXT=32768` in `.env`; with less, `8192`.

With a hosted provider, TaskForce reads each model's context window from the provider's list of models when the
provider gives it (Anthropic, Groq, Mistral, OpenRouter) and sizes the conversation to it; `AI_HOSTED_MAX_CONTEXT`
caps what it counts on, for a plan that refuses requests below the advertised window (12,000 tokens by default on Groq,
whose on-demand tier stops at 8,000 tokens per minute). When the provider says nothing (OpenAI), it assumes
`AI_DEFAULT_CONTEXT`, 16,384 tokens by default, and shows it as an estimate. Set it to the model's real window to keep
more of a conversation before it is summarized.

After a change in `.env`: `docker compose up -d`.

## Email

TaskForce sends sign-up codes, invitations and password resets by email. Without an SMTP server (the default):

- sign-up does not verify addresses, so anyone who reaches the app can create an account with any address,
  including one you invited. Keep the instance on a private network, or configure email;
- invitations are not emailed: the invited person signs up with the invited address and finds the invitation in the
  app;
- a forgotten password is reset by an admin in the Keycloak console (<http://localhost:8180>, user `admin`,
  password `KEYCLOAK_ADMIN_PASSWORD` in `.env`): realm `taskforce`, Users, the person, Credentials, Reset password.

With an SMTP server, fill the `MAIL_*` values in `.env`, set `SIGNUP_EMAIL_VERIFICATION=true` and run
`docker compose up -d`.

## Passkeys

People can add a passkey (Windows Hello, Touch ID, a phone or a security key) in Settings > Security, then sign in
with it instead of their password. Keycloak opens their session for the API once you allow it, one time:

```bash
docker compose exec -T keycloak sh -s taskforce < keycloak/scripts/passkey-sessions.sh
```

Browsers only offer passkeys on `https://` addresses and on `localhost`. A passkey belongs to the app's address
(`TF_APP_URL`): after changing it, people add their passkeys again.

## Using it from other machines

By default every port listens on this machine only (`BIND_ADDRESS=127.0.0.1`). To open it to your network:

1. In `.env`, set `BIND_ADDRESS=0.0.0.0` and replace `localhost` with this machine's address in `TF_APP_URL`,
   `TF_API_URL`, `TF_KEYCLOAK_URL` and `TF_STORAGE_URL`.
   If you stay on plain http, also set `AUTH_REFRESH_COOKIE_SECURE=false`: browsers drop secure cookies over http
   (localhost aside), and sessions would end after 30 minutes.
2. Rebuild the app, which keeps the addresses it was built with: `docker compose up -d --build`.

Sign-in sends passwords to the API: beyond a trusted network, serve the four addresses over HTTPS with a reverse
proxy (Caddy, nginx, Traefik) and use the `https://` addresses in `.env`.

Note that Keycloak keeps the addresses it was first started with for its realm: after changing `TF_APP_URL` or
`TF_API_URL`, update the client `taskforce-api` (Valid redirect URIs, Web origins) in the Keycloak console.

## Coding agents

Each person can delegate issues to Claude Code running on their own computer: Settings > Agents > "Set up local
runner", then follow the steps shown (see [`taskforce-runner`](./taskforce-runner/README.md)). The runner only
talks to the API, at `TF_API_URL`.

Each mission keeps an evidence file, signed when the mission ends. On its first start, the server creates its signing
key in the `backend_data` volume (`/var/lib/taskforce/evidence/signing-key.pem`) and keeps it from then on: back that
volume up with your database, since a seal can only be compared with the key that made it. To use a key of your own
instead, generate one and put the line it prints (the key, in base64) in `DELIVERY_EVIDENCE_SIGNING_KEY` in `.env`:

```bash
openssl genpkey -algorithm ed25519 | sed -n 2p
```

Records of missions that ended before TaskForce sealed records are sealed once, when the server starts: the seal says
it was made late, with its date, and proves the chain as it was then, nothing before.

If the server can neither read nor create its key file, it draws a key at each start, says so in its log, and a seal
can no longer be compared with a key you publish. If no coding agent runs on the machine of the server, set
`DELIVERY_EVIDENCE_KEY_CUSTODY=separate-machine`: each seal, and each verification page, says where the key lives.
TaskForce cannot check this; leave the default (`same-machine`) when in doubt. The custody covers the key only: what a
runner reports (its tests, the agent and its model, the numbers of its events) comes from the computer where the agent
works, and each record says so.

Anyone can check an exported file without TaskForce, with `npm run verify -- evidence-run-42.json --key <key id>` in
`taskforce-runner`. Publish your key id where the people who check your records can find it: a member of a workspace
also reads it at `GET /api/workspaces/{slug}/delivery/evidence/key`, with the keys that sealed the workspace's records
before and when each was used. The file carries its own public key, so a check without `--key` only says that the seal
matches the key in the file, which anyone can make. That list comes from your own database: what anchors a key is a
place you do not hold alone. When a mission ends, its head is written in its pull request on GitHub, with the id of the
key that sealed it; GitHub dates the comment. Compare the key id you are given with the one in the comment.

On a private repository, the comment also links the record's verification page: `<TF_APP_URL>/verify/<id>`, with an
opaque id of the record, never the workspace or the mission number, and the page asks for a sign-in. If a private
repository may become public, set `DELIVERY_EVIDENCE_WITNESS_LINK=false` in `.env`: the comment then carries the head
and the key only.

When an account is purged, TaskForce erases the person's email and name from every record, and the GitHub login that
merged a pull request when it knows that login: the one of a GitHub connection the account made. Two things stay. The
free texts of a mission (its title, description and summary, the lines of its checklist) may name someone, and are
kept as written. The saved versions of the live rules keep who wrote each one.

Records written before TaskForce 1.18 name people by their email in their chain: who delegated, who was asked, who
answered. These events cannot change without breaking the chain, so purging an account cannot remove the email from
them. TaskForce adds a note to each such record, saying the date and which events keep the email, seals it again, and
hides these emails wherever it shows the record; only owners and admins of the workspace can export it as JSON.
Whether to keep these records, and for how long, is your decision as the operator: TaskForce keeps them until their
workspace is deleted.

## Integrations

GitHub and Slack need an OAuth app of your own; `.env.selfhost.example` lists the callback URLs and the Slack scopes.
Other tools connect through their MCP server (Settings > Integrations). MCP servers and webhook receivers on your own
network are refused unless you set `MCP_ALLOW_PRIVATE_NETWORK=true` or `WEBHOOKS_ALLOW_PRIVATE_NETWORK=true`.

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

The dump contains both the TaskForce and the Keycloak databases. To restore on a fresh install, start only
PostgreSQL (`docker compose up -d postgres`), load the dump (`docker compose exec -T postgres psql -U taskforce -d
postgres < taskforce-backup.sql`), restore the files into the `taskforce_minio_data` volume, then
`docker compose up -d`. Use the same `.env` as the backup. Errors about roles or databases that already exist are
expected: the first start created them.

## Stop or remove

- `docker compose stop` stops everything and keeps your data.
- `docker compose down -v` deletes everything, data included.
