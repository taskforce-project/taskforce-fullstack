# 🚀 Taskforce - Plateforme ERP Modulaire

<div align="center">

![Version](https://img.shields.io/badge/version-0.2.0--rc1-blue.svg)
![License](https://img.shields.io/badge/license-Fair%20Use-green.svg)
![Java](https://img.shields.io/badge/Java-21-orange.svg)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.4.1-brightgreen.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4-38bdf8.svg)
![Keycloak](https://img.shields.io/badge/Keycloak-26-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-blue.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)

**Plateforme ERP complète pour la gestion de projets, ressources et compétences**

[Documentation](../taskforce-docs/) • [Démo](#-démo) • [Installation](#-installation) • [Contributing](#-contribution)

</div>

---

## 📋 Table des Matières

- [À Propos](#-à-propos)
- [Fonctionnalités](#-fonctionnalités)
- [Stack Technique](#-stack-technique)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Utilisation](#-utilisation)
- [Développement](#-développement)
- [Déploiement](#-déploiement)
- [Documentation](#-documentation)
- [Contribution](#-contribution)
- [Licence](#-licence)
- [Support](#-support)

---

## 🎯 À Propos

**Taskforce** est une plateforme ERP modulaire open-source conçue pour optimiser la gestion de projets et des ressources humaines dans les organisations modernes.

### 🌟 Caractéristiques Principales

- **🎨 Interface Moderne** : UI/UX intuitive avec Next.js 16 et TailwindCSS 4
- **🔐 Sécurité Robuste** : Authentification OAuth2/OIDC via Keycloak
- **📊 Gestion Multi-tenant** : Support natif du multi-organisation
- **🔄 Architecture Modulaire** : Extensible via un système de modules
- **🐳 Cloud-Ready** : Conteneurisation complète avec Docker
- **🚀 CI/CD Automatisé** : Déploiement continu via GitHub Actions

### 🎯 Cas d'Usage

- Gestion de projets agiles
- Allocation des ressources par compétences
- Suivi des tâches et workload
- Gestion des absences et congés
- Reporting et analytics temps réel

---

## ✨ Fonctionnalités

### Core Features

- ✅ **Authentification & Autorisation** (Keycloak)
- ✅ **Gestion des Utilisateurs & Rôles**
- ✅ **Multi-Organisation (Tenants)**
- ✅ **Dashboard Analytics**
- ✅ **API REST Documentée** (OpenAPI 3.0)

### Modules Métier

- 🎯 **Gestion de Projets**
  - Création et suivi de projets
  - Phases et jalons
  - Budget et ressources
  
- 👥 **Gestion des Ressources**
  - Profils de compétences
  - Disponibilité et allocation
  - Matrix de compétences
  
- 📋 **Gestion des Tâches**
  - Création et assignation
  - Workflow personnalisable
  - Tracking du temps
  
- 📊 **Reporting**
  - Tableaux de bord personnalisables
  - Exports (PDF, Excel, CSV)
  - Analytics avancés

### Modules Extensions (Roadmap)

- 🔬 **LIMS** (Laboratory Information Management)
- 🏭 **Qualité** (ISO 9001, contrôle qualité)
- 📦 **Gestion des Stocks**
- 💰 **Facturation**

---

## 🛠️ Stack Technique

### Backend

| Technologie | Version | Rôle |
|-------------|---------|------|
| **Java** | 21 LTS | Langage principal |
| **Spring Boot** | 3.4.1 | Framework backend |
| **PostgreSQL** | 18 | Base de données |
| **Keycloak** | 26 | Authentification/SSO |
| **Flyway** | - | Migrations DB |
| **Maven** | 3.9+ | Build tool |
| **SpringDoc** | 2.7.0 | Documentation API |

### Frontend

| Technologie | Version | Rôle |
|-------------|---------|------|
| **Next.js** | 16 | Framework React |
| **TypeScript** | 5.x | Langage typé |
| **TailwindCSS** | 4+ | Styling |
| **Shadcn/ui** | - | Composants UI |
| **React Query** | 5.x | State management |

### Landing Page

| Technologie | Version | Rôle |
|-------------|---------|------|
| **Astro** | 5.x | Framework statique |
| **TailwindCSS** | 4+ | Styling |

### DevOps

| Technologie | Rôle |
|-------------|------|
| **Docker** | Conteneurisation |
| **Docker Compose** | Orchestration locale |
| **GitHub Actions** | CI/CD |
| **GHCR** | Registry Docker |
| **Nginx** | Reverse proxy |

---

## 🏗️ Architecture

### Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────┐
│                    NGINX (Reverse Proxy)                 │
│                     Port 80/443                          │
└────────────┬────────────────────────┬────────────────────┘
             │                        │
     ┌───────▼────────┐       ┌──────▼────────┐
     │   Frontend     │       │  Landing Page │
     │   (Next.js)    │       │    (Astro)    │
     │   Port 3000    │       │   Port 4321   │
     └───────┬────────┘       └───────────────┘
             │
             │ API Calls
             │
     ┌───────▼────────┐       ┌──────────────┐
     │   Backend API  │◄──────│   Keycloak   │
     │  (Spring Boot) │       │   Port 8180  │
     │   Port 8080    │       └──────────────┘
     └───────┬────────┘
             │
             │ JDBC
             │
     ┌───────▼────────┐
     │  PostgreSQL    │
     │   Port 5432    │
     └────────────────┘
```

### Architecture Backend (Clean Architecture)

```
backend/tf-api/
├── domain/           # Entités métier
├── application/      # Use cases & services
├── infrastructure/   # Repositories & adapters
└── presentation/     # Controllers & DTOs
```

📖 **[Documentation Architecture Complète](../taskforce-docs/technique/Architecture.md)**

---

## 📦 Installation

### Prérequis

- **Docker Desktop** 4.x+ (avec Docker Compose V2)
- **Git** 2.x+
- **PowerShell** 5.1+ (Windows) ou **Bash** (Linux/Mac)

Pour le développement local :
- **Java JDK** 21+
- **Node.js** 20+
- **Maven** 3.9+

### Installation Rapide (Docker)

```bash
# 1. Cloner le repository
git clone https://github.com/taskforce-project/taskforce-fullstack.git
cd taskforce-fullstack

# 2. Démarrer tous les services
docker-compose up -d

# 3. Attendre que tous les services soient prêts (~2 minutes)
docker-compose logs -f

# 4. Accéder à l'application
# Frontend: http://localhost:3000
# Backend:  http://localhost:8080
# Keycloak: http://localhost:8180
```

### Installation Développement

<details>
<summary>🔧 Configuration détaillée (cliquer pour développer)</summary>

#### 1. Backend (Spring Boot)

```bash
cd backend/tf-api

# Copier la configuration
cp .env.dev.example .env.dev

# Installer les dépendances
./mvnw clean install

# Lancer le backend
./mvnw spring-boot:run
```

#### 2. Frontend (Next.js)

```bash
cd frontend

# Installer les dépendances
npm install

# Lancer le dev server
npm run dev
```

#### 3. Landing (Astro)

```bash
cd landing-page

# Installer les dépendances
npm install

# Lancer le dev server
npm run dev
```

</details>

---

## 🚀 Utilisation

### Accès aux Services

| Service | URL | Identifiants |
|---------|-----|--------------|
| 🌐 **Frontend** | http://localhost:3000 | - |
| 🌍 **Landing Page** | http://localhost:4321 | - |
| 🔌 **API Backend** | http://localhost:8080/api | - |
| 📚 **Swagger UI** | http://localhost:8080/swagger-ui.html | - |
| 🔐 **Keycloak Admin** | http://localhost:8180 | `admin` / `admin` |
| 🗄️ **pgAdmin** | http://localhost:5050 | `admin@taskforce.dev` / `admin` |

### Utilisateurs de Test

**Keycloak (Realm: taskforce-dev)**

| Utilisateur | Mot de passe | Rôles |
|-------------|--------------|-------|
| `admin` | `admin123` | admin, user, api-admin |
| `user` | `user123` | user, api-user |

### Scripts Disponibles

#### Windows (PowerShell)

```powershell
.\start-dev.ps1        # Démarrer tous les services
.\stop-dev.ps1         # Arrêter tous les services
.\dev-docker.ps1       # Menu interactif dev
.\prod-docker.ps1      # Menu interactif prod
```

#### Linux/Mac (Bash)

```bash
make dev-up            # Démarrer tous les services
make dev-down          # Arrêter tous les services
make logs              # Voir les logs
make clean             # Nettoyer les volumes
```

---

## 💻 Développement

### Workflow Git

Le projet utilise **GitFlow** avec versioning sémantique par service :

```bash
# 1. Créer une branche feature
git checkout dev
git checkout -b feature/my-feature

# 2. Développer et commiter
git add .
git commit -m "feat(backend): add user profile API"

# 3. Push et créer une PR
git push origin feature/my-feature
gh pr create --base dev --label "backend:release:minor"
```

📖 **[Guide complet Git Workflow](../taskforce-docs/developpeur/git-workflow/README.md)**

### Versioning

Chaque service a **son propre versioning indépendant** :

- `backend-v1.2.3-rc1` - Backend API
- `frontend-v2.0.1-rc2` - Frontend Next.js 16
- `landing-v1.0.0-rc1` - Landing Astro

📖 **[Documentation Versioning](../taskforce-docs/developpeur/git-workflow/versioning-par-service.md)**

### Tests

```bash
# Backend (JUnit 5)
cd backend/tf-api
./mvnw test

# Frontend (Jest + React Testing Library)
cd frontend
npm test

# E2E (Playwright)
npm run test:e2e
```

### Code Quality

```bash
# Linter Backend (Checkstyle)
./mvnw checkstyle:check

# Linter Frontend (ESLint)
npm run lint

# Formatter
npm run format
```

---

## 🚢 Déploiement

### Images Docker

Les images Docker sont publiées automatiquement sur **GitHub Container Registry** :

```bash
# Pull des images
docker pull ghcr.io/taskforce-project/taskforce-fullstack/backend:latest
docker pull ghcr.io/taskforce-project/taskforce-fullstack/frontend:latest
docker pull ghcr.io/taskforce-project/taskforce-fullstack/landing:latest
```

### Production

```bash
# 1. Configurer les variables d'environnement
cp .env.example .env.prod
nano .env.prod

# 2. Déployer avec Docker Compose
docker-compose -f docker-compose.prod.yml up -d

# 3. Vérifier les services
docker-compose ps
```

📖 **[Guide Déploiement Production](../taskforce-docs/technique/DevOps.md)**

---

## 📚 Documentation

### Pour les Développeurs

- 🚀 **[Quickstart Guide](../taskforce-docs/developpeur/quickstart/README.md)** - Démarrer en 5 minutes
- 🔀 **[Git Workflow](../taskforce-docs/developpeur/git-workflow/README.md)** - Branches, PR, labels
- 🔖 **[Versioning](../taskforce-docs/developpeur/git-workflow/versioning-par-service.md)** - Gestion des versions
- 🐳 **[Docker & GHCR](../taskforce-docs/developpeur/docker/GHCR_USAGE.md)** - Images Docker

### Architecture & Technique

- 🏗️ **[Architecture Globale](../taskforce-docs/technique/Architecture.md)** - Vue d'ensemble
- 🔌 **[API Documentation](../taskforce-docs/technique/API.md)** - REST API specs
- 🔐 **[Sécurité](../taskforce-docs/technique/Sécurité.md)** - OAuth2, RBAC
- 🚀 **[DevOps & CI/CD](../taskforce-docs/technique/DevOps.md)** - Pipelines

### Par Service

- 🔧 **[Backend API](./backend/tf-api/README.md)** - Spring Boot
- 🎨 **[Frontend](./frontend/README.md)** - Next.js
- 🌐 **[Landing Page](./landing-page/README.md)** - Astro
- 🔑 **[Keycloak](./keycloak/README.md)** - Configuration SSO

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Veuillez lire notre **[Guide de Contribution](../taskforce-docs/developpeur/git-workflow/pull-requests-service.md)** avant de soumettre une PR.

### Process de Contribution

1. **Fork** le projet
2. Créer une **branche feature** (`git checkout -b feature/AmazingFeature`)
3. **Commit** vos changements (`git commit -m 'feat: Add AmazingFeature'`)
4. **Push** vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une **Pull Request** avec les labels appropriés

### Conventional Commits

Nous utilisons [Conventional Commits](https://www.conventionalcommits.org/) :

```
feat(backend): add user authentication
fix(frontend): correct header alignment
docs(readme): update installation steps
```

### Labels de Release

Chaque PR doit avoir **au moins un label de release par service modifié** :

- `backend:release:major` - Breaking changes
- `backend:release:minor` - Nouvelles features
- `backend:release:patch` - Corrections bugs

📖 **[Référence Complète des Labels](../taskforce-docs/developpeur/git-workflow/labels-reference.md)**

---

## 📄 Licence

Ce projet est sous licence **Fair Use License** - voir le fichier [LICENSE](./LICENSE) pour plus de détails.

### Résumé de la Licence

- ✅ **Utilisation libre** pour usage personnel et éducatif
- ✅ **Modification** autorisée pour usage interne
- ✅ **Distribution** du code source autorisée
- ❌ **Usage commercial** interdit sans autorisation
- ❌ **Redistribution commerciale** interdite sans permission
- ❌ **Marque déposée** - le nom "Taskforce" est protégé

Pour toute utilisation commerciale, contactez : contact@taskforce.dev

---

## 🆘 Support

### 💬 Community Support

- **[GitHub Issues](https://github.com/taskforce-project/taskforce-fullstack/issues)** - Bug reports & feature requests
- **[GitHub Discussions](https://github.com/taskforce-project/taskforce-fullstack/discussions)** - Questions & discussions
- **[Documentation](../taskforce-docs/)** - Guides complets

### 📧 Contact

- **Email** : contact@taskforce.dev
- **Website** : https://taskforce.dev
- **Twitter** : [@taskforce_erp](https://twitter.com/taskforce_erp)

---

## 🙏 Remerciements

Merci à tous les contributeurs qui ont participé au développement de ce projet !

<div align="center">

**[⬆ Retour en haut](#-taskforce---plateforme-erp-modulaire)**

Made with ❤️ by the Taskforce Team

</div>

