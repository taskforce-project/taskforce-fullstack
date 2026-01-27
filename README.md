# 🚀 Taskforce - ERP Modulaire

Application ERP modulaire avec architecture microservices-ready.

## 📁 Structure du Projet

```
taskforce-fullstack/
├── backend/
│   └── tf-api/                      # API REST Spring Boot
│       ├── src/
│       ├── Dockerfile               # Build multi-stage
│       ├── .env.dev.example
│       └── .env.prod.example
├── frontend/                        # À venir
├── nginx/
│   └── nginx.conf.example          # Reverse proxy production
├── docker-compose.dev.yml          # Configuration développement
├── docker-compose.prod.yml         # Configuration production
├── docker.ps1                      # Scripts PowerShell (Windows)
├── Makefile                        # Scripts Make (Linux/Mac)
├── init-dev.ps1                    # Init automatique
└── DOCKER_README.md                # Documentation Docker
```

---

## 🛠️ Stack Technique

### Backend
- **Java 21** avec Spring Boot 3.4.1
- **PostgreSQL 16** - Base de données
- **Keycloak 23** - Authentification/Autorisation
- **Flyway** - Migrations DB
- **SpringDoc OpenAPI** - Documentation API
- **Docker** - Conteneurisation

### Architecture
- **Modular Monolith** → Évolution vers microservices
- **Clean Architecture** par module
- **Multi-environnements** (dev/prod)

---

## 🚀 Démarrage Rapide (Windows)

### 1️⃣ Prérequis
- [Docker Desktop](https://www.docker.com/products/docker-desktop) installé et démarré
- PowerShell 5.1+

### 2️⃣ Initialisation
```powershell
# Cloner le repo
git clone <votre-repo>
cd taskforce-fullstack

# Initialiser l'environnement DEV
.\init-dev.ps1
```

### 3️⃣ Lancer les services
```powershell
# Démarrer (première fois - avec build)
.\docker.ps1 dev-up

# Les fois suivantes
.\docker.ps1 dev-up
```

### 4️⃣ Accéder aux services

| Service | URL | Identifiants |
|---------|-----|--------------|
| **API Backend** | http://localhost:8081/api | - |
| **Swagger UI** | http://localhost:8081/api/swagger-ui.html | - |
| **Keycloak Admin** | http://localhost:8180 | admin / admin |
| **PostgreSQL** | localhost:5432 | postgres / postgres |
| **pgAdmin** | http://localhost:5050 | admin@taskforce.dev / admin |

---

## 🐳 Commandes Docker

### Développement (Windows)
```powershell
.\docker.ps1 dev-up          # Démarrer
.\docker.ps1 dev-down        # Arrêter
.\docker.ps1 dev-logs        # Voir les logs
.\docker.ps1 dev-build       # Rebuild
.\docker.ps1 dev-clean       # Supprimer volumes
.\docker.ps1 help            # Aide
```

### Développement (Linux/Mac)
```bash
make dev-up          # Démarrer
make dev-down        # Arrêter
make dev-logs        # Voir les logs
make dev-build       # Rebuild
make dev-clean       # Supprimer volumes
make help            # Aide
```

### Production
```powershell
# 1. Créer .env.prod
copy backend\tf-api\.env.prod.example backend\tf-api\.env.prod

# 2. Modifier .env.prod avec vraies valeurs

# 3. Démarrer
.\docker.ps1 prod-up
```

---

## 📝 Configuration

### Variables d'environnement

#### Développement
Fichier: `backend/tf-api/.env.dev`
```env
SPRING_PROFILE=dev
DB_HOST=localhost
DB_NAME=taskforce_dev
KEYCLOAK_URL=http://localhost:8180
# ...
```

#### Production
Fichier: `backend/tf-api/.env.prod`
```env
SPRING_PROFILE=prod
DB_HOST=your-prod-db.com
DB_NAME=taskforce_prod
KEYCLOAK_URL=https://auth.yourdomain.com
# ...
```

⚠️ **Important**: Ne jamais commiter les fichiers `.env.dev` et `.env.prod` !

---

## 🏗️ Architecture Backend

```
tf-api/
├── shared/                   # Code partagé
│   ├── config/              # Configurations (Security, Keycloak, OpenAPI)
│   ├── exception/           # Gestion des erreurs
│   └── dto/                 # DTOs communs
└── modules/                 # Modules métier
    ├── core/                # Module principal ERP
    │   ├── api/            # Controllers REST
    │   ├── domain/         # Entities JPA
    │   ├── service/        # Logique métier
    │   └── repository/     # Accès DB
    ├── chat/                # Module chat (futur)
    └── analytics/           # Module analytics (futur)
```

### Profils Spring Boot

- **dev** → Charge `application.yml` + `application-dev.yml`
- **prod** → Charge `application.yml` + `application-prod.yml`

---

## 🔐 Sécurité

### Développement
- ✅ CORS ouvert sur localhost
- ✅ Logs DEBUG
- ✅ H2 Console (si activé)
- ✅ Swagger UI accessible

### Production
- 🔒 CORS restreint aux domaines autorisés
- 🔒 Logs minimaux (WARN/INFO)
- 🔒 Swagger UI désactivable
- 🔒 HTTPS via Nginx
- 🔒 Secrets dans .env.prod
- 🔒 Health checks actifs
- 🔒 Resource limits Docker

---

## 📚 Documentation

- [DOCKER_README.md](./DOCKER_README.md) - Guide Docker complet
- [backend/tf-api/ENV_CONFIG.md](./backend/tf-api/ENV_CONFIG.md) - Configuration environnements
- [nginx/nginx.conf.example](./nginx/nginx.conf.example) - Config Nginx production

---

## 🧪 Tests

```bash
# Backend
cd backend/tf-api
mvn test
```

---

## 📦 Build Production

```bash
# Build l'image Docker
cd backend/tf-api
docker build -t taskforce-api:latest .

# Ou avec docker-compose
docker-compose -f docker-compose.prod.yml build
```

---

## 🐛 Debugging

### Voir les logs d'un service
```powershell
.\docker.ps1 dev-logs        # Tous les services
docker logs taskforce-backend-dev -f     # Backend uniquement
docker logs taskforce-postgres-dev -f    # PostgreSQL uniquement
```

### Accéder à un conteneur
```powershell
docker exec -it taskforce-backend-dev sh              # Backend
docker exec -it taskforce-postgres-dev psql -U postgres -d taskforce_dev  # DB
```

### Rebuild complet
```powershell
.\docker.ps1 dev-clean       # Supprimer volumes
.\docker.ps1 dev-build       # Rebuild
.\docker.ps1 dev-up          # Relancer
```

---

## 🔄 Workflow Git

```bash
# Créer une branche feature
git checkout -b feature/nom-de-la-feature

# Commit
git add .
git commit -m "feat: description"

# Push
git push origin feature/nom-de-la-feature
```

---

## 🎯 Roadmap

- [x] Configuration multi-environnements
- [x] Docker dev/prod
- [x] Keycloak integration
- [x] OpenAPI documentation
- [ ] Migrations Flyway
- [ ] Module Core (ERP)
- [ ] CI/CD Pipeline
- [ ] Tests unitaires/intégration
- [ ] Module Chat
- [ ] Module Analytics
- [ ] Frontend React/Vue

---

## 👥 Contribuer

1. Fork le projet
2. Créer une branche feature
3. Commit les changements
4. Push vers la branche
5. Ouvrir une Pull Request

---

## 📄 Licence

À définir

---

## 🆘 Support

Pour toute question, ouvrir une issue sur le repo.

