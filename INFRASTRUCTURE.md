# 📦 Infrastructure Docker - Taskforce Fullstack

## ✅ Résumé de ce qui a été configuré

### 🐳 Services Docker

#### 1. PostgreSQL (Base de données)
- **Image**: `postgres:16-alpine`
- **Port**: 5433 (externe) → 5432 (interne)
- **Database**: `taskforce-db`
- **Credentials**: postgres / PostgreSQLP54!
- **Health check**: ✅
- **Volume persistant**: ✅

#### 2. Keycloak (Authentification)
- **Image**: `quay.io/keycloak/keycloak:23.0`
- **Port**: 8180
- **Admin**: admin / admin
- **Realm dev**: Auto-importé depuis `keycloak/realms/taskforce-dev-realm.json`
- **Database**: Partage PostgreSQL (schema `keycloak_dev`)
- **Health check**: ✅

**Utilisateurs de test :**
- `admin` / `admin123` (rôles: admin, user, api-admin, api-user)
- `user` / `user123` (rôles: user, api-user)

#### 3. Backend API (Spring Boot)
- **Build**: Multi-stage Dockerfile
- **Port**: 8081 (externe) → 8080 (interne)
- **Debug port**: 5005
- **Profile**: dev
- **Health check**: ✅
- **Auto-restart**: ✅

**Configuration :**
- Java 21
- Maven 3.9
- Spring Boot 4.0.0
- Flyway (migrations DB)
- OAuth2 + JWT

#### 4. pgAdmin (Administration DB)
- **Image**: `dpage/pgadmin4:latest`
- **Port**: 5050
- **Credentials**: admin@taskforce.dev / admin
- **Optionnel**: Peut être désactivé en production

### 📁 Fichiers créés

```
taskforce-fullstack/
├── backend/tf-api/
│   ├── Dockerfile                    # ✅ Multi-stage, optimisé
│   ├── .dockerignore                 # ✅ Optimise le build
│   ├── .env.example                  # ✅ Template des variables
│   └── src/main/java/.../security/
│       └── SecurityConfig.java       # ✅ OAuth2 conditionnel
│
├── keycloak/
│   ├── realms/
│   │   ├── taskforce-dev-realm.json  # ✅ Config développement
│   │   └── taskforce-prod-realm.json # ✅ Config production
│   └── README.md                     # ✅ Documentation
│
├── docker-compose.dev.yml            # ✅ Développement complet
├── docker-compose.prod.yml           # ✅ Production (à ajuster)
├── start-dev.ps1                     # ✅ Script de démarrage
├── stop-dev.ps1                      # ✅ Script d'arrêt
├── README.QUICKSTART.md              # ✅ Guide rapide
└── INFRASTRUCTURE.md                 # ✅ Ce fichier
```

### 🔐 Sécurité configurée

#### Développement
- ✅ Keycloak avec realm auto-importé
- ✅ OAuth2 Resource Server
- ✅ OAuth2 Client
- ✅ JWT validation
- ✅ CORS configuré
- ✅ SSL désactivé (OK pour localhost)

#### Production (à configurer)
- ⚠️ Changer tous les secrets
- ⚠️ Activer SSL/TLS
- ⚠️ Certificats HTTPS
- ⚠️ Désactiver l'enregistrement public
- ⚠️ Configurer SMTP

### 🌐 Réseau Docker

Tous les services sont sur le même réseau `taskforce-dev-network` :

```
┌─────────────────────────────────────────────────┐
│           taskforce-dev-network                 │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │PostgreSQL│  │ Keycloak │  │ Backend  │     │
│  │  :5432   │◄─┤  :8080   │◄─┤  :8080   │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│       ▲                                         │
│       │                                         │
│  ┌────┴─────┐                                  │
│  │ pgAdmin  │                                  │
│  │   :80    │                                  │
│  └──────────┘                                  │
└─────────────────────────────────────────────────┘
         │           │          │
    Port 5433   Port 8180  Port 8081
         │           │          │
    ┌────┴───────────┴──────────┴────┐
    │         Localhost               │
    └─────────────────────────────────┘
```

### 🚀 Utilisation

#### Démarrage
```powershell
# Avec le script
.\start-dev.ps1

# Ou manuellement
docker-compose -f docker-compose.dev.yml up -d
```

#### Vérification
```bash
# Status des services
docker-compose -f docker-compose.dev.yml ps

# Logs
docker-compose -f docker-compose.dev.yml logs -f

# Health checks
curl http://localhost:8081/api/actuator/health
curl http://localhost:8180/health/ready
```

#### Arrêt
```powershell
# Avec le script
.\stop-dev.ps1

# Ou manuellement (garde les volumes)
docker-compose -f docker-compose.dev.yml down

# Supprimer aussi les volumes
docker-compose -f docker-compose.dev.yml down -v
```

### 🔄 Workflow de développement

1. **Démarrer l'infrastructure**
   ```bash
   .\start-dev.ps1
   ```

2. **Attendre que tout soit prêt** (~60s)
   - PostgreSQL démarre en premier
   - Keycloak importe le realm
   - Backend se connecte à tout

3. **Développer**
   - Modifier le code dans `backend/tf-api/src`
   - Le hot-reload est configuré (optionnel)
   - Ou rebuild : `docker-compose -f docker-compose.dev.yml build backend`

4. **Tester**
   - Swagger UI : http://localhost:8081/api/swagger-ui.html
   - Obtenir un token Keycloak
   - Tester les endpoints protégés

5. **Déboguer**
   - Attacher le debugger IntelliJ au port 5005
   - Voir les logs : `docker-compose logs -f backend`

### 📊 Monitoring

#### Logs
```bash
# Tous les services
docker-compose -f docker-compose.dev.yml logs -f

# Un service spécifique
docker-compose -f docker-compose.dev.yml logs -f backend
docker-compose -f docker-compose.dev.yml logs -f keycloak
docker-compose -f docker-compose.dev.yml logs -f postgres
```

#### Métriques
- Actuator endpoints : http://localhost:8081/api/actuator
- Health : http://localhost:8081/api/actuator/health
- Metrics : http://localhost:8081/api/actuator/metrics

### 🎯 Prochaines étapes

#### Frontend React (à faire)
1. Créer `frontend/Dockerfile`
2. Ajouter au docker-compose :
   ```yaml
   frontend:
     build: ./frontend
     ports:
       - "3000:3000"
     depends_on:
       - backend
       - keycloak
   ```
3. Configurer Keycloak client React

#### Landing Page (à faire)
1. Créer `landing-page/Dockerfile`
2. Ajouter au docker-compose
3. Configurer Nginx pour router

#### Nginx Reverse Proxy (à faire)
```yaml
nginx:
  image: nginx:alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf
    - ./nginx/ssl:/etc/nginx/ssl
```

#### Production
1. Configurer les secrets (fichier `.env.prod` sécurisé)
2. Activer SSL/TLS
3. Configurer backups automatiques PostgreSQL
4. Ajouter Grafana/Loki/Prometheus
5. Configurer monitoring & alerting

### 🐛 Troubleshooting

#### Le backend ne se connecte pas à Keycloak
```bash
# Vérifier que Keycloak est prêt
docker-compose -f docker-compose.dev.yml logs keycloak | grep "Listening"

# Vérifier le realm
curl http://localhost:8180/realms/taskforce-dev/.well-known/openid-configuration
```

#### PostgreSQL version 18 non supportée
✅ **Résolu** : `flyway-database-postgresql` ajouté au pom.xml

#### Erreur de port déjà utilisé
```powershell
# Voir quel processus utilise le port
netstat -ano | findstr :8081

# Changer le port dans docker-compose.dev.yml
ports:
  - "8082:8080"  # Utiliser 8082 au lieu de 8081
```

### 📚 Documentation

- **Backend API**: `backend/tf-api/ARCHITECTURE.md`
- **Docker**: `README.Docker.md`
- **Keycloak**: `keycloak/README.md`
- **Démarrage rapide**: `README.QUICKSTART.md`

### ✅ Checklist de validation

- [x] Docker fonctionne
- [x] PostgreSQL démarre et est accessible
- [x] Keycloak démarre et importe le realm
- [x] Backend démarre et se connecte
- [x] Flyway exécute les migrations
- [x] Health checks passent
- [x] Swagger UI accessible
- [x] Authentification Keycloak fonctionne
- [x] pgAdmin connecté à PostgreSQL

### 🎉 Résultat

Vous avez maintenant une infrastructure Docker complète et professionnelle pour le développement de Taskforce, avec :

- ✅ Base de données PostgreSQL 18
- ✅ Authentification Keycloak avec realms
- ✅ API Spring Boot avec OAuth2
- ✅ Administration via pgAdmin
- ✅ Health checks et monitoring
- ✅ Scripts de gestion PowerShell
- ✅ Documentation complète

**Prêt pour le développement ! 🚀**
