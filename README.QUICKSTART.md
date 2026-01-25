# 🚀 Démarrage Rapide - Taskforce Backend

## ✅ Ce qui a été fait

### 1. Configuration Docker complète
- ✅ Dockerfile multi-stage pour l'API Java
- ✅ Configuration Keycloak avec realms dev et prod
- ✅ docker-compose.dev.yml avec tous les services
- ✅ docker-compose.prod.yml pour la production
- ✅ Scripts PowerShell de démarrage/arrêt

### 2. Base de données
- ✅ PostgreSQL 18 configuré (port 5433)
- ✅ Flyway pour les migrations
- ✅ pgAdmin pour l'administration

### 3. Sécurité
- ✅ Keycloak intégré
- ✅ Realms configurés (dev et prod)
- ✅ Utilisateurs de test créés
- ✅ Configuration OAuth2 conditionnelle

## 🎯 Démarrer le projet

### Option 1 : Avec Docker (Recommandé)

```powershell
# Démarrer tous les services
.\start-dev.ps1

# Ou manuellement
docker-compose -f docker-compose.dev.yml up -d
```

**Services disponibles :**
- API: http://localhost:8081/api
- Swagger: http://localhost:8081/api/swagger-ui.html
- Keycloak: http://localhost:8180 (admin/admin)
- pgAdmin: http://localhost:5050 (admin@taskforce.dev/admin)

### Option 2 : Sans Docker (Local)

1. **Démarrer PostgreSQL localement** (votre instance sur port 5433)

2. **Configurer l'environnement :**
   ```yaml
   # Dans application-dev.yml, définir :
   keycloak:
     enabled: false  # Désactiver Keycloak
   ```

3. **Lancer l'application :**
   ```bash
   cd backend/tf-api
   mvn spring-boot:run
   ```

## 🔐 Utilisateurs de test Keycloak

| Username | Password | Rôles |
|----------|----------|-------|
| admin | admin123 | admin, user, api-admin, api-user |
| user | user123 | user, api-user |

## 📁 Structure du projet

```
taskforce-fullstack/
├── backend/tf-api/              # API Spring Boot
│   ├── Dockerfile               # ✅ Configuré
│   ├── pom.xml                  # ✅ Dépendances à jour
│   └── src/
│       ├── main/
│       │   ├── java/
│       │   │   └── com/taskforce/tf_api/
│       │   │       ├── shared/
│       │   │       │   └── security/
│       │   │       │       └── SecurityConfig.java  # ✅ OAuth2 conditionnel
│       │   └── resources/
│       │       ├── application.yml
│       │       ├── application-dev.yml  # ✅ Configuré
│       │       └── db/migration/
│       │           └── V1_init_schema.sql
├── keycloak/                    # ✅ Configuration Keycloak
│   ├── realms/
│   │   ├── taskforce-dev-realm.json
│   │   └── taskforce-prod-realm.json
│   └── README.md
├── docker-compose.dev.yml       # ✅ Développement
├── docker-compose.prod.yml      # ✅ Production
├── start-dev.ps1                # ✅ Script de démarrage
├── stop-dev.ps1                 # ✅ Script d'arrêt
└── README.QUICKSTART.md         # Ce fichier
```

## 🐛 Résolution des problèmes

### PostgreSQL : "version 18.1 not supported"
✅ **Résolu** : Ajout de `flyway-database-postgresql` dans pom.xml

### Keycloak ne démarre pas
```bash
# Voir les logs
docker-compose -f docker-compose.dev.yml logs keycloak

# Réinitialiser
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d
```

### Port déjà utilisé
Votre PostgreSQL local tourne sur 5433, donc :
- Docker PostgreSQL : 5432 (interne)
- Exposition : 5433:5432 dans docker-compose.dev.yml

## 📊 Commandes utiles

```bash
# Voir les logs
docker-compose -f docker-compose.dev.yml logs -f

# Logs d'un service spécifique
docker-compose -f docker-compose.dev.yml logs -f backend

# Rebuild l'API
docker-compose -f docker-compose.dev.yml build backend

# Accéder au conteneur
docker exec -it taskforce-backend-dev sh

# Accéder à PostgreSQL
docker exec -it taskforce-postgres-dev psql -U postgres -d taskforce-db
```

## 🎨 Prochaines étapes

1. **Frontend React**
   - [ ] Créer Dockerfile pour le frontend
   - [ ] Ajouter au docker-compose.dev.yml
   - [ ] Configurer Keycloak côté client

2. **Landing Page**
   - [ ] Créer Dockerfile
   - [ ] Ajouter au docker-compose

3. **Nginx**
   - [ ] Configurer reverse proxy
   - [ ] SSL/TLS en production

4. **Monitoring (Production)**
   - [ ] Grafana
   - [ ] Loki (logs)
   - [ ] Prometheus (métriques)

## 📚 Documentation

- [README.Docker.md](./README.Docker.md) : Guide complet Docker
- [backend/tf-api/ARCHITECTURE.md](./backend/tf-api/ARCHITECTURE.md) : Architecture de l'API
- [keycloak/README.md](./keycloak/README.md) : Configuration Keycloak

## ✅ Checklist avant commit

- [ ] Les secrets sont dans `.env` (pas dans le code)
- [ ] `.env.prod` n'est PAS commité
- [ ] Les tests passent
- [ ] Le code est formaté
- [ ] La documentation est à jour

## 🎯 Tester l'API

```bash
# Health check
curl http://localhost:8081/api/actuator/health

# Swagger UI
# Ouvrir http://localhost:8081/api/swagger-ui.html

# Obtenir un token Keycloak
curl -X POST http://localhost:8180/realms/taskforce-dev/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin123" \
  -d "grant_type=password" \
  -d "client_id=taskforce-api" \
  -d "client_secret=dev-secret-change-in-production"
```

## 🔥 Reset complet

Si tout est cassé :

```powershell
# Arrêter et supprimer TOUT
docker-compose -f docker-compose.dev.yml down -v --rmi all
docker system prune -a --volumes

# Rebuild from scratch
docker-compose -f docker-compose.dev.yml up -d --build
```

---

**Bon développement ! 🚀**
