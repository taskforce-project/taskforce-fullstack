# 🚀 Taskforce API - Backend REST

API REST modulaire pour l'ERP Taskforce, construite avec **Spring Boot 4**, **PostgreSQL**, et **Keycloak** pour l'authentification.

---

## 📋 Table des matières

- [Technologies](#-technologies)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Démarrage](#-démarrage)
- [Documentation](#-documentation)
- [Architecture](#-architecture)
- [Tests](#-tests)
- [Déploiement](#-déploiement)

---

## 🛠️ Technologies

| Technologie | Version | Usage |
|------------|---------|-------|
| **Java** | 25 | Langage principal |
| **Spring Boot** | 4.0.0 | Framework backend |
| **PostgreSQL** | 16+ | Base de données |
| **Keycloak** | 23.0.4 | Authentification OAuth2/OIDC |
| **Flyway** | Intégré | Migrations de BDD |
| **Maven** | 3.9+ | Gestionnaire de dépendances |
| **Docker** | 24+ | Conteneurisation |
| **Lombok** | Intégré | Réduction boilerplate |
| **SpringDoc** | 2.3.0 | Documentation OpenAPI/Swagger |

---

## ✅ Prérequis

### Pour le développement local

- **Java 25** (ou 21+)
- **Maven 3.9+**
- **Docker Desktop** (optionnel mais recommandé)
- **PostgreSQL 16+** (si pas Docker)

### Vérification

```bash
java -version
mvn -version
docker -version
```

---

## 📦 Installation

### 1. Cloner le projet

```bash
cd backend/tf-api
```

### 2. Configurer les variables d'environnement

```bash
# Windows PowerShell
copy .env.dev.example .env.dev

# Linux/Mac
cp .env.dev.example .env.dev
```

> ⚠️ **Production** : Créer `.env.prod` depuis `.env.prod.example` et modifier toutes les valeurs sensibles !

### 3. Installer les dépendances

```bash
mvn clean install
```

---

## 🚀 Démarrage

### Option 1 : Avec Docker (recommandé)

Depuis la **racine du projet fullstack** :

```bash
# Développement
docker-compose --env-file backend/tf-api/.env.dev up

# Production
docker-compose -f docker-compose.prod.yml --env-file backend/tf-api/.env.prod up
```

### Option 2 : En local (sans Docker)

**Prérequis :** PostgreSQL doit être lancé localement.

```bash
# 1. Charger les variables d'environnement
# Windows PowerShell
Get-Content .env.dev | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2]) } }

# Linux/Mac
export $(cat .env.dev | xargs)

# 2. Lancer l'application
mvn spring-boot:run
```

### Option 3 : Depuis l'IDE (IntelliJ IDEA)

1. Ouvrir le projet dans IntelliJ
2. Configurer les variables d'environnement dans **Run Configuration** (depuis `.env.dev`)
3. Lancer `TfApiApplication.java`

---

## 📖 Documentation

### Accès à la documentation

Une fois l'application lancée :

| Documentation | URL | Description |
|--------------|-----|-------------|
| **Swagger UI** | http://localhost:8080/api/swagger-ui.html | Interface interactive |
| **OpenAPI JSON** | http://localhost:8080/api/api-docs | Spec OpenAPI 3.0 |
| **Health Check** | http://localhost:8080/api/actuator/health | Statut de l'API |

### Fichiers de documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Architecture détaillée + Guide création de modules
- **[ENV_CONFIG.md](./ENV_CONFIG.md)** - Configuration des variables d'environnement
- **[HELP.md](./HELP.md)** - Ressources Spring Boot

---

## 🏗️ Architecture

### Structure modulaire

```
src/main/java/com/taskforce/tf_api/
├── shared/         # Code partagé (config, security, exceptions...)
├── core/           # Base ERP (Users, Companies, Roles...)
└── modules/        # Modules optionnels (chat, ged, analytics...)
    ├── chat/
    ├── ged/
    └── taskforceHorizon/
```

### Principes

- ✅ **Modulaire** : Chaque module est autonome
- ✅ **Scalable** : Ajout de nouveaux modules facile
- ✅ **Clean Architecture** : Séparation claire des responsabilités
- ✅ **DRY** : Code partagé dans `shared/`

👉 **Voir [ARCHITECTURE.md](./ARCHITECTURE.md) pour plus de détails**

---

## 🧪 Tests

### Lancer tous les tests

```bash
mvn test
```

### Lancer un test spécifique

```bash
mvn test -Dtest=UserServiceTest
```

### Coverage

```bash
mvn clean test jacoco:report
# Rapport dans target/site/jacoco/index.html
```

---

## 🐳 Déploiement

### Build de l'image Docker

```bash
# Image de développement
docker build -t taskforce-api:dev .

# Image de production
docker build -t taskforce-api:prod --build-arg SPRING_PROFILE=prod .
```

### Variables d'environnement Docker

Le Dockerfile utilise les variables définies dans `.env.dev` ou `.env.prod`.

### Production

```bash
# Avec docker-compose (depuis la racine)
docker-compose -f docker-compose.prod.yml up -d

# Logs
docker-compose -f docker-compose.prod.yml logs -f backend
```

---

## 🔐 Sécurité

### Keycloak

L'API utilise **Keycloak** pour l'authentification OAuth2/OIDC.

- Configuration dans `shared/config/SecurityConfig.java`
- Variables dans `.env.dev` / `.env.prod`

### Endpoints protégés

```java
@GetMapping("/users")
@PreAuthorize("hasRole('USER')")
public List<UserResponse> getUsers() { ... }
```

---

## 🌍 Internationalisation (i18n)

### Langues supportées

- 🇫🇷 Français (`messages_fr.properties`)
- 🇬🇧 English (`messages_en.properties`)

### Utilisation

```java
@Autowired
private MessageSource messageSource;

String message = messageSource.getMessage(
    "user.not.found", 
    new Object[]{userId}, 
    LocaleContextHolder.getLocale()
);
```

---

## 📊 Base de données

### Migrations Flyway

Les migrations sont dans `src/main/resources/db/migration/`

```
V1__init_schema.sql
V2__add_users_table.sql
V3__add_companies_table.sql
```

### Commandes utiles

```bash
# Info sur l'état des migrations
mvn flyway:info

# Valider les migrations
mvn flyway:validate

# Réparer (si problème)
mvn flyway:repair
```

---

## 🤝 Contribution

### Créer un nouveau module

Voir le guide complet dans **[ARCHITECTURE.md](./ARCHITECTURE.md#-guide--créer-un-nouveau-module)**

### Conventions

- **Controllers** : Minimal, délègue tout aux Services
- **Services** : Contient la logique métier
- **DTOs** : Séparation Request/Response
- **Exceptions** : Utiliser les exceptions custom (`BusinessException`, `ResourceNotFoundException`)

---

## 📞 Support

Pour toute question sur l'architecture ou le développement, consulter :

1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Architecture et patterns
2. **[ENV_CONFIG.md](./ENV_CONFIG.md)** - Configuration
3. **Swagger UI** - Documentation des endpoints

---

## 📄 Licence

Propriétaire - Taskforce © 2026

