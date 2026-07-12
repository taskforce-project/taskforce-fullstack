# taskforce-mcp

Serveur **MCP** (Model Context Protocol) qui expose **TaskForce** à Claude et à tout client MCP.

Idée : faire de TaskForce **une étape de réflexion / de process** pour l'agent — une source d'info
(Brain OS) et de process (workflows, règles) à consulter **avant d'agir**, dans TaskForce ou ailleurs.

## Tools exposés (v0.1)

| Tool | Effet |
|---|---|
| `taskforce_ask_cortex` | Interroge l'agent **Cortex** fondé sur le **Brain OS** (réponse + sources + usage tokens). |
| `taskforce_workspace_kpis` | KPIs réels du workspace (santé, vélocité, à risque). |
| `taskforce_list_projects` | Liste des projets. |
| `taskforce_list_my_issues` | Issues assignées à l'utilisateur du token. |

> Roadmap : écriture (créer/assigner une issue, consigner une décision), `brain_search`, transport
> **Streamable HTTP** (remote), puis volet **client MCP** (piloter Linear & co *via* TaskForce).

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

## Auth

- **Prod** : fournir `TASKFORCE_TOKEN` (compte de service / clé API).
- **Dev** : password grant Keycloak (cf. `.env.example`) — l'en-tête `Host: keycloak:8080` est forcé
  pour que l'`iss` du JWT corresponde à ce que le backend valide.
