# 🚀 Taskforce API - Backend REST

API REST modulaire pour l'ERP Taskforce, construite avec **Spring Boot 4**, **PostgreSQL**, et **Keycloak** pour l'authentification.

---

## 📋 Table des matières

- [Technologies](#-technologies)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Configuration](#-configuration)
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

#### Développement

```bash
# Windows PowerShell
copy .env.dev.example .env.dev

# Linux/Mac
cp .env.dev.example .env.dev
```

Éditer `.env.dev` avec vos paramètres locaux (mot de passe PostgreSQL, etc.)

#### Production

```bash
# Windows PowerShell
copy .env.prod.example .env.prod

# Linux/Mac
cp .env.prod.example .env.prod
```

> ⚠️ **IMPORTANT** : Modifier **toutes les valeurs** dans `.env.prod` et ne **jamais commiter** ce fichier !

### 3. Installer les dépendances

```bash
mvn clean install
```

---

## ⚙️ Configuration

### Variables d'environnement

L'application charge automatiquement le fichier `.env.dev` ou `.env.prod` selon le profil actif :

- **Par défaut** : `.env.dev` est chargé (profil `dev`)
- **Production** : Définir `SPRING_PROFILE=prod` pour charger `.env.prod`

### Fichiers de configuration Spring

- **`application.yml`** : Configuration commune à tous les environnements
- **`application-dev.yml`** : Configuration spécifique au développement
- **`application-prod.yml`** : Configuration spécifique à la production

**Important** : Les valeurs `${VARIABLE}` dans les fichiers YAML sont remplacées par les variables d'environnement du fichier `.env` correspondant.

### Profiles Spring

Pour changer de profil :

```bash
# Option 1 : Variable d'environnement
export SPRING_PROFILE=prod  # Linux/Mac
$env:SPRING_PROFILE="prod"  # Windows PowerShell

# Option 2 : Argument JVM
mvn spring-boot:run -Dspring-boot.run.profiles=prod

# Option 3 : Dans .env.dev ou .env.prod
SPRING_PROFILE=dev
```

---

## 🚀 Démarrage

### Option 1 : Avec Docker (recommandé)

Depuis la **racine du projet fullstack** :

```bash
# Développement
docker-compose -f docker-compose.dev.yml up

# Production
docker-compose -f docker-compose.prod.yml up
```

### Option 2 : En local (sans Docker)

**Prérequis :** PostgreSQL doit être lancé localement.

#### Démarrage rapide (développement)

```bash
# 1. Démarrer PostgreSQL (si pas Docker)
# Assurez-vous que PostgreSQL tourne sur localhost:5432

# 2. Démarrer l'application
mvn spring-boot:run
```

L'API sera accessible sur **http://localhost:8081/api**

#### Démarrage en production

```bash
# 1. Définir le profil
export SPRING_PROFILE=prod  # Linux/Mac
$env:SPRING_PROFILE="prod"  # Windows PowerShell

# 2. Lancer l'application
mvn spring-boot:run
```

### Option 3 : Lancer depuis IntelliJ IDEA

1. Ouvrir le projet dans IntelliJ
2. Créer une configuration Run/Debug :
   - **Main class** : `com.taskforce.tf_api.TfApiApplication`
   - **VM options** : `-Dspring.profiles.active=dev`
   - **Environment variables** : `SPRING_PROFILE=dev`
3. Cliquer sur Run ▶️

---

## 📚 Documentation

### Swagger UI (Interface interactive)

Une fois l'application démarrée :

- **URL** : http://localhost:8081/api/swagger-ui.html
- Tester directement les endpoints
- Voir les schémas de données

### OpenAPI JSON

- **URL** : http://localhost:8081/api/v3/api-docs

### Health Check

- **URL** : http://localhost:8081/api/actuator/health

---

## 🏗️ Architecture

Voir **[ARCHITECTURE.md](ARCHITECTURE.md)** pour une description détaillée de l'architecture modulaire.

### Structure du projet

```
tf-api/
├── src/main/java/com/taskforce/tf_api/
│   ├── TfApiApplication.java          # Point d'entrée
│   ├── core/                           # Module Core (commun)
│   │   ├── api/                        # Controllers Core
│   │   ├── domain/                     # Entités Core
│   │   ├── dto/                        # DTOs Core
│   │   ├── repository/                 # Repositories Core
│   │   └── service/                    # Services Core
│   ├── modules/                        # Modules métiers
│   │   ├── chat/                       # Module Chat
│   │   ├── ged/                        # Module GED
│   │   └── taskforceHorizon/           # Module Taskforce Horizon
│   └── shared/                         # Code partagé
│       ├── audit/                      # Auditabilité
│       ├── config/                     # Configurations
│       ├── dto/                        # DTOs communs
│       ├── exception/                  # Gestion des erreurs
│       ├── i18n/                       # Internationalisation
│       ├── security/                   # Sécurité Keycloak
│       └── utils/                      # Utilitaires
└── src/main/resources/
    ├── application.yml                 # Config commune
    ├── application-dev.yml             # Config dev
    ├── application-prod.yml            # Config prod
    ├── db/migration/                   # Scripts Flyway
    └── i18n/                           # Fichiers de traduction
```

---

## 🧪 Tests

### Lancer tous les tests

```bash
mvn test
```

### Lancer un test spécifique

```bash
mvn test -Dtest=TfApiApplicationTests
```

### Tests avec couverture

```bash
mvn clean test jacoco:report
```

Rapport dans `target/site/jacoco/index.html`

---

## 🚢 Déploiement

### Construire le JAR

```bash
mvn clean package -DskipTests
```

Le JAR sera dans `target/tf-api-0.0.1-SNAPSHOT.jar`

### Docker

#### Construire l'image

```bash
docker build -t taskforce-api:latest .
```

#### Lancer le conteneur

```bash
# Développement
docker run -p 8081:8081 --env-file .env.dev taskforce-api:latest

# Production
docker run -p 8080:8080 --env-file .env.prod taskforce-api:latest
```

### Déploiement production

Voir le fichier `docker-compose.prod.yml` à la racine du projet fullstack.

---

## 🔒 Sécurité

- **Authentification** : OAuth2/OIDC via Keycloak
- **Autorisation** : Basée sur les rôles et scopes Keycloak
- **CORS** : Configuré via `CORS_ALLOWED_ORIGINS`
- **Variables sensibles** : Jamais en dur, toujours dans `.env`

---

## 🌍 Internationalisation (i18n)

L'API supporte le français et l'anglais :

- **Fichiers** : `src/main/resources/i18n/messages_{fr,en}.properties`
- **Header HTTP** : `Accept-Language: fr` ou `Accept-Language: en`

---

## 🤝 Contribution

### Ajouter un nouveau module

Voir [ARCHITECTURE.md - Créer un nouveau module](ARCHITECTURE.md#créer-un-nouveau-module)

### Standards de code

- **Java** : Suivre les conventions Google Java Style
- **Commits** : Messages en anglais, format conventionnel
- **Tests** : Couverture minimum 80%

---

## 📞 Support

Pour toute question ou problème :

1. Vérifier [ARCHITECTURE.md](ARCHITECTURE.md)
2. Consulter les logs : `docker logs tf-api` ou dans la console
3. Contacter l'équipe de développement

---

## 📝 Licence

Propriétaire - Taskforce © 2026


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
V1_init_schema.sql
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

