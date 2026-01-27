# 🚀 GUIDE RAPIDE - DOCKER

## ⚡ Démarrage Ultra-Rapide

### Développement

```powershell
.\dev-docker.ps1
```

Choisissez l'option **2** pour démarrer en arrière-plan.

### Production

```powershell
.\prod-docker.ps1
```

## 🌐 Services Disponibles

| Service | URL | Identifiants |
|---------|-----|--------------|
| 🌐 Frontend | http://localhost:3000 | - |
| 🔌 API | http://localhost:8080/api | - |
| 📚 Swagger | http://localhost:8080/swagger-ui.html | - |
| 🔐 Keycloak | http://localhost:8180 | admin/admin |
| 🗄️ pgAdmin | http://localhost:5050 | admin@taskforce.dev/admin |
| 🐘 PostgreSQL | localhost:5432 | postgres/postgres |

## 📋 Menu des Scripts

Les deux scripts (`dev-docker.ps1` et `prod-docker.ps1`) offrent :

1. 🚀 Démarrer les services
2. ⏹️ Arrêter les services  
3. 🔄 Redémarrer
4. 🔨 Build
5. 📋 Logs
6. 📊 État des conteneurs
7. 🧹 Nettoyer
8. 🗑️ Prune Docker
9. 📦 Rebuild complet
0. ❌ Quitter

## 🔧 Commandes Directes

```powershell
# Démarrer (dev)
docker-compose -f docker-compose.dev.yml up -d

# Arrêter
docker-compose -f docker-compose.dev.yml down

# Logs
docker-compose -f docker-compose.dev.yml logs -f

# Rebuild
docker-compose -f docker-compose.dev.yml up -d --build
```

## 🆘 Dépannage

### Rebuild complet
Utilisez l'option **10** dans le menu ou :
```powershell
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml build --no-cache  
docker-compose -f docker-compose.dev.yml up -d
```

### Nettoyer tout
```powershell
docker-compose -f docker-compose.dev.yml down -v
docker system prune -af --volumes
```

---

**C'est parti !** Lancez `.\dev-docker.ps1` 🚀
