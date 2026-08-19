# taskforce-mcp

Serveur **MCP** (Model Context Protocol) qui expose **TaskForce** à Claude et à tout client MCP.

Idée : faire de TaskForce **une étape de réflexion / de process** pour l'agent — une source d'info
(Brain OS) et de process (workflows, règles) à consulter **avant d'agir**, dans TaskForce ou ailleurs.

## Tools exposés (v0.2 — 10 tools : lecture + écriture)

**Contexte / lecture** — le « cerveau » à consulter avant d'agir :

| Tool | Effet |
|---|---|
| `taskforce_ask_cortex` | Interroge l'agent **Cortex** fondé sur le **Brain OS** (réponse + sources + usage tokens). |
| `taskforce_brain_search` | Recherche sémantique dans le **Brain OS** (décisions / archi / problèmes connus…). |
| `taskforce_workspace_kpis` | KPIs réels du workspace (santé, vélocité, à risque). |
| `taskforce_list_projects` | Liste des projets. |
| `taskforce_list_issues` | Issues d'un projet. |
| `taskforce_list_issue_statuses` | Statuts d'un projet (pour résoudre `statusId`). |
| `taskforce_list_my_issues` | Issues assignées à l'utilisateur du token. |

**Action / écriture** — Claude agit dans TaskForce :

| Tool | Effet |
|---|---|
| `taskforce_create_issue` | Crée une issue (titre, priorité, assigné, échéance). |
| `taskforce_update_issue` | Met à jour une issue (statut, assigné, priorité, titre…). |
| `taskforce_smart_assign` | Recommande le meilleur assigné (IA) — à appliquer via `update_issue`. |

Deux transports, mêmes tools : **stdio** (local, `npm start`) et **Streamable HTTP** (remote/SaaS,
`npm run start:http`).

> Roadmap : volet **client MCP** (`TF-MCP-CLIENT` — piloter Linear & co *via* TaskForce).

## Installation

```bash
cd taskforce-mcp
npm install
npm run build
cp .env.example .env   # renseigner KEYCLOAK_CLIENT_SECRET (depuis ../.env.dev)
```

## Vérifier (backend dev up requis)

```bash
# charge .env puis lance le client de vérif (liste les tools + appelle KPIs/projets)
npm run verify
```

## Brancher sur Claude Desktop / Claude Code

`claude_desktop_config.json` (ou config MCP de Claude Code) :

```json
{
  "mcpServers": {
    "taskforce": {
      "command": "node",
      "args": ["C:/Taskforce/taskforce-fullstack/taskforce-mcp/dist/index.js"],
      "env": {
        "TASKFORCE_WORKSPACE": "taskforce-demo",
        "KEYCLOAK_CLIENT_SECRET": "…",
        "TASKFORCE_PASSWORD": "Admin@2024"
      }
    }
  }
}
```

Le serveur parle **stdio** (aucun port). Les logs vont sur `stderr` (stdout est réservé au protocole).

## Transport HTTP (remote / SaaS)

Pour un serveur **distant** (client MCP remote), lancer le transport **Streamable HTTP** :

```bash
npm run build
npm run start:http   # écoute sur http://127.0.0.1:3000/mcp (cf. MCP_HTTP_HOST / MCP_HTTP_PORT)
```

- Endpoint MCP unique : `POST/GET/DELETE /mcp` (sessions via l'en-tête `mcp-session-id`). Probe : `GET /health`.
- **Un `McpServer` + un client TaskForce par session** → le token est isolé par session.
- **Auth** (décidée à l'ouverture de session) :
  - **Pass-through** (prod) : le client présente `Authorization: Bearer <token TaskForce>` ; ce token
    est relayé tel quel à l'API → la session agit avec l'identité du caller (compte de service).
  - **Compte de service local** : sans en-tête, on retombe sur l'auth d'env (`TASKFORCE_TOKEN` ou
    password grant Keycloak). Non protégé au niveau MCP → **binder sur localhost** / derrière un proxy.
  - Si aucune auth d'env n'est configurée, le pass-through devient **obligatoire** (sinon `401`).
- **Anti DNS-rebinding** : `MCP_HTTP_ALLOWED_ORIGINS` filtre l'en-tête `Origin` des clients navigateur
  (les clients non-navigateur n'envoient pas d'`Origin` → toujours acceptés).

Vérif end-to-end (serveur HTTP + backend up) :

```bash
MCP_HTTP_URL=http://127.0.0.1:3000/mcp npx tsx src/verify-http.ts
# pass-through : ajouter MCP_VERIFY_BEARER=<token>
```

## Auth

- **Prod** : fournir `TASKFORCE_TOKEN` (compte de service / clé API).
- **Dev** : password grant Keycloak (cf. `.env.example`) — l'en-tête `Host: keycloak:8080` est forcé
  pour que l'`iss` du JWT corresponde à ce que le backend valide.
