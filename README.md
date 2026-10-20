# TaskForce

<div align="center">

<!-- BADGES:START -->
![Version](https://img.shields.io/badge/Version-1.1.5-blue.svg)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)
![Java](https://img.shields.io/badge/Java-21-orange.svg)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-4.0.6-brightgreen.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.3.8-black.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-blue.svg)
![Keycloak](https://img.shields.io/badge/Keycloak-26.5.2-blue.svg)
![Self-hosted](https://img.shields.io/badge/Self--hosted-Docker-blue.svg)
<!-- BADGES:END -->

**Open-source project management where people and coding agents work on the same issues.**

[Website](https://taskforce-project.fr) · [Self-hosting](./SELF_HOSTING.md) · [API reference](https://docs.taskforce-project.fr) · [Contributing](./CONTRIBUTING.md)

</div>

![TaskForce dashboard](.github/assets/dashboard.webp)

## What it is

TaskForce plans a team's work and hands parts of it to coding agents. Projects, cycles and roadmaps live next to the
team's knowledge, the Brain OS, and an AI assistant, Cortex, works with both. You run it yourself, on one machine or
a server: AI comes from Ollama on that machine by default, or from any OpenAI-compatible API you choose, and
everything else keeps working without it.

## Features

### Plan the work

- Projects with board, list, backlog, cycles, roadmap and pages. Issues carry priorities, labels, due dates, story
  points, subtasks, checklists, relations, attachments and time tracking.
- My Queue gathers your issues, cycles and pages across projects; Signals lists what needs you.
- Smart Assign suggests the best person for an issue from skills, workload and history, always as an explicit
  suggestion. It can also propose assignees for a whole board and rebalance the team's workload.
- Members and roles (owner, admin, member, viewer), private projects, invitations, two-factor sign-in.

![Project board](.github/assets/board.webp)

### Delegate to coding agents

- **Claude Code**, run by each person on their own computer through the local runner: delegate an issue the way you
  assign a teammate, follow the run live on the issue, allow or deny each action that needs it, and get the pull
  request.
- **GitHub Copilot coding agent** (preview) works in the project's repository and opens a pull request.
- From your terminal, Claude Code can also use TaskForce as an MCP server, with a personal access token.

![Delegating an issue to Claude Code](.github/assets/issue-agents.webp)

### Keep the team's knowledge

- The Brain OS: a tree of Markdown pages with `[[links]]` and `#tags`, plain-text and semantic search, and notes
  ingested from GitHub, Slack and Plane.
- Cortex answers from the workspace and the Brain OS, drafts issue specs, and can use the tools of connected MCP
  servers: reads run directly, a change waits for the approval of an owner or admin.

![Brain OS](.github/assets/brain-os.webp)

### Connect your tools

- **GitHub**: pull requests and commits linked to issues, with their status kept up to date; one repository per
  project for the agents; issues imported into the Brain OS.
- **Slack**: notifications per channel and event; channel history imported into the Brain OS.
- **Plane**: projects and work items synced into the Brain OS.
- **Any MCP server**, with one-click OAuth or a token. 25 official servers are listed (Linear, Jira, Notion,
  Sentry...).
- **Outgoing webhooks** for n8n, Zapier, Make or your own endpoint, signed with HMAC-SHA256 and retried.

![Integrations catalog](.github/assets/integrations.webp)

## Self-host

```bash
git clone https://github.com/taskforce-project/taskforce-fullstack.git
cd taskforce-fullstack
./scripts/selfhost-init.sh        # Windows PowerShell: .\scripts\selfhost-init.ps1
docker compose up -d --build
```

Then open <http://localhost:3000> and create your account. [SELF_HOSTING.md](./SELF_HOSTING.md) covers AI, email,
access from other machines, coding agents, updates and backups.

## Stack

| Part | Technology |
| --- | --- |
| API | Java 21, Spring Boot 4, PostgreSQL 18 with pgvector, Flyway |
| App | Next.js 16, React 19, TypeScript, Tailwind CSS, Zustand |
| AI gateway | Python, FastAPI; Ollama or any OpenAI-compatible API |
| Sign-in | Keycloak |
| Files | MinIO (S3-compatible) |
| Coding agents | Local runner (Node.js) for Claude Code; GitHub Copilot coding agent |

| Folder | What it is |
| --- | --- |
| [`backend/tf-api`](./backend/tf-api) | The API |
| [`frontend`](./frontend) | The app |
| [`ai-service`](./ai-service) | The AI gateway |
| [`taskforce-runner`](./taskforce-runner) | The local runner for Claude Code |
| [`taskforce-plugin`](./taskforce-plugin) | The Claude Code plugin (`/taskforce`) |
| [`keycloak`](./keycloak) | Sign-in realms |
| [`landing-page`](./landing-page) | The website |

## Documentation

- [SELF_HOSTING.md](./SELF_HOSTING.md) to run it, [CONTRIBUTING.md](./CONTRIBUTING.md) to work on it.
- [API reference](https://docs.taskforce-project.fr).
- [Design and architecture notes](https://github.com/taskforce-project/taskforce-docs) (in French): decisions,
  architecture, API, known issues.

## Security

Report vulnerabilities privately, as described in [SECURITY.md](./SECURITY.md).

## License

TaskForce is free software under the [GNU Affero General Public License v3.0](./LICENSE). You can use it, change it
and host it, in a company too. If you offer a modified version to users over a network, you must give them the
source code of your changes, under the same license.

The TaskForce name and logo are not covered by this license: if you distribute a modified version, give it another
name.

---

<div align="center">
<sub>Built by <a href="https://github.com/Miche1-Pierre">Pierre Michel</a> · final project of a level 6 RNCP degree, Metz Numeric School · 2025-2026</sub>
</div>
