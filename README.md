# ⚡ TaskForce - la couche d'exécution IA pour les équipes qui livrent

<div align="center">

![Status](https://img.shields.io/badge/status-beta-f59e0b?style=flat-square)
![Backend](https://img.shields.io/badge/backend-Java%2021%20·%20Spring%20Boot%204-111827?style=flat-square)
![Frontend](https://img.shields.io/badge/frontend-Next.js%2016%20·%20React%2019-111827?style=flat-square)
![AI](https://img.shields.io/badge/AI-auto--héberg%C3%A9%20·%20Ollama-16a34a?style=flat-square)
![Infra](https://img.shields.io/badge/infra-Docker%20·%20Keycloak%20·%20PostgreSQL-111827?style=flat-square)

**TaskForce se pose au-dessus des outils qu'une équipe utilise déjà et transforme une intention en résultat livré.**

[🌐 Site](https://taskforce-project.fr) • [🚀 Application](https://app.taskforce-project.fr) • [📖 Référence API](https://docs.taskforce-project.fr) • [🧠 Brain OS (doc)](https://github.com/taskforce-project/taskforce-docs)

</div>

---

## 📋 Sommaire

- [À propos](#-à-propos)
- [Ce qui tourne aujourd'hui](#-ce-qui-tourne-aujourdhui)
- [Stack technique](#-stack-technique)
- [Architecture](#-architecture)
- [Démarrage rapide](#-démarrage-rapide)
- [Services & accès](#-services--accès-dev-local)
- [Développement](#-développement)
- [Déploiement](#-déploiement)
- [Documentation](#-documentation)
- [Licence](#-licence)

---

## 🎯 À propos

**TaskForce** se pose au-dessus des outils qu'une équipe utilise déjà (Linear, Notion, GitHub, Claude) et transforme une intention en résultat livré. Les outils de gestion de projet *suivent* le travail ; TaskForce le *comprend* : il orchestre le flux entre les outils d'une équipe et l'IA qui agit dessus, concentre le contexte de chaque projet dans un modèle unique, et éclaire les décisions - jusqu'à en anticiper les conséquences avant qu'elles ne soient prises.

Ce coeur d'intelligence, c'est le **Brain OS** : un modèle persistant et navigable d'un projet (sa connaissance, son histoire, les conséquences des actions passées) qu'un humain et un agent parcourent de la même façon.

> **Statut : beta, en évolution.** Ce qui tourne de bout en bout aujourd'hui est un workspace dockerisé, déployé et joignable - les écrans sont réels. La couche d'orchestration et de décision complète est la direction vers laquelle pousse le Brain OS, pas une feature livrée. On montre la capacité, jamais de la traction inventée.

---

## 🌟 Ce qui tourne aujourd'hui

| | Capacité | Ce que ça fait |
| --- | --- | --- |
| 🧭 | **Un workspace** | Projets, cycles, issues, backlog, roadmap, pages et analytics au même endroit - vues board, liste et roadmap. |
| 🤖 | **Smart Assign** | Recommande le bon responsable pour chaque issue par compétence, charge et historique - un score décomposé et transparent, pas une réunion de planif. |
| 📊 | **AI Insights** | Une lecture exécutive du débit, de la capacité et de ce qui est à risque, générée sans que personne ne construise un rapport. |
| 💬 | **Ask AI** | Un assistant contextuel qui répond depuis le vrai workspace de l'équipe, pas un chat générique. |
| 🧠 | **Brain OS** | La connaissance du workspace sous forme de graphe navigable, lisible par un humain comme par un agent. |

---

## 🛠️ Stack technique

| Couche | Technologies |
| --- | --- |
| **Backend** | Java 21, Spring Boot 4, Clean Architecture, multi-tenant, REST + WebSocket/STOMP |
| **Frontend** | Next.js 16, React 19, TypeScript, TailwindCSS, shadcn/ui |
| **Landing** | Astro 5 |
| **IA** | Inférence auto-hébergée - Ollama (Qwen3 14B / 8B), embeddings BGE-M3 (1024d) dans pgvector, derrière une passerelle FastAPI ; serveur MCP |
| **Identité** | Keycloak - OIDC, JWT, RBAC |
| **Données** | PostgreSQL 18 + pgvector, Redis, MinIO (S3), RabbitMQ (relais STOMP) |
| **Observabilité** | OpenTelemetry vers SigNoz |
| **CI/CD** | GitHub Actions, GHCR, Docker Compose (dev / prod / tools), Nginx |

> L'inférence est **auto-hébergée** : aucun LLM tiers, aucune donnée du workspace ne sort de la machine.

---

## 🏗️ Architecture

Monorepo multi-tenant. L'identité est déléguée à Keycloak ; le frontend parle à l'API en REST (JWT bearer) et en WebSocket/STOMP pour le temps réel (RabbitMQ comme relais). L'API délègue l'inférence à une passerelle IA qui route vers un runtime Ollama local.

```
taskforce-fullstack/
├─ backend/          API Spring Boot (Java 21, Clean Architecture)
├─ frontend/         App Next.js 16 (React 19, TypeScript)
├─ landing-page/     Site marketing Astro
├─ ai-service/       Passerelle IA (FastAPI) -> runtime Ollama local
├─ taskforce-mcp/    Serveur Model Context Protocol
├─ keycloak/         Identité & accès
├─ nginx/            Reverse proxy / TLS
├─ observability/    OpenTelemetry + SigNoz
├─ rabbitmq/         Relais STOMP temps réel
├─ security-reports/ OWASP ZAP / Trivy / Semgrep
├─ scripts/          Outils & automatisation
└─ docker-compose.{dev,prod,tools}.yml
```

📖 Diagramme complet, C4 et ADR dans le **[Brain OS](https://github.com/taskforce-project/taskforce-docs)**.

---

## 📦 Démarrage rapide

**Prérequis :** Docker Desktop 4.x+ (Compose V2), Git, et `make` (Windows : `choco install make`). Pour le dev natif : JDK 21+, Node 20+, Maven 3.9+.

```bash
# 1. Cloner
git clone https://github.com/taskforce-project/taskforce-fullstack.git
cd taskforce-fullstack

# 2. Initialiser l'environnement (.env + vérif Docker)
make init-dev

# 3. Démarrer toute la stack
make dev-up            # menu interactif : make menu
```

Sur Windows, le centre de commande est `.\tf.ps1` (`.\tf.ps1 up` / `down` / `logs` / `help`). Les scripts Docker vivent dans [`scripts/`](./scripts/README.md).

---

## 🚀 Services & accès (dev local)

| Service | URL |
| --- | --- |
| 🌐 Frontend | http://localhost:3000 |
| 🌍 Landing | http://localhost:4321 |
| 🔌 API | http://localhost:8080/api |
| 📚 Swagger UI | http://localhost:8080/api/swagger-ui.html |
| 🔐 Keycloak | http://localhost:8180 |
| 🗄️ pgAdmin | http://localhost:5050 |

Comptes de test (realm `taskforce-dev`) : `admin / admin123`, `user / user123`.

---

## 💻 Développement

- **Branches** depuis l'intégration (`feature/*`, `fix/*`) ; **Conventional Commits** (`type(scope): description`).
- Chaque PR porte **un label de release** par service modifié (`release:{major|minor|patch}`).
- **Tests** : backend JUnit 5 (`./mvnw test`), frontend Jest + E2E Playwright sur la stack Docker réelle (pas de mock).
- **Qualité** : ESLint / Checkstyle avant commit.
- Les règles d'architecture (couches, préfixe `/api`, stores Zustand, migrations Flyway) sont dans **[CLAUDE.md](./CLAUDE.md)** et le Brain OS.

---

## 🚢 Déploiement

Images publiées sur **GHCR** à chaque release. La production tourne en `docker compose` (profil prod) derrière Nginx/TLS ; un merge sur `main` déclenche le déploiement automatique.

```bash
docker compose -f docker-compose.prod.yml up -d
```

---

## 📚 Documentation

- 🧠 **[Brain OS - vault de doc](https://github.com/taskforce-project/taskforce-docs)** : architecture, ADR, API, runbooks, sécurité, R&D.
- 📖 **[Référence API publique](https://docs.taskforce-project.fr)** (Fern).
- 🔧 Par service : [backend](./backend/tf-api/README.md) · [frontend](./frontend/README.md) · [landing](./landing-page/README.md).

---

## 📄 Licence

Projet sous licence **Fair Use** - voir [LICENSE](./LICENSE). Le nom « TaskForce » est protégé. Pour tout usage commercial : **contact@taskforce-project.fr**.

---

<div align="center">
<sub>Construit par <a href="https://github.com/Miche1-Pierre">Pierre Michel</a> · fil-rouge du titre RNCP niveau 6, Metz Numeric School · 2025-2026</sub>
</div>
