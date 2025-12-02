# 🐳 Guide Docker - Taskforce

## 📋 Prérequis

- Docker Desktop installé
- Docker Compose installé
- Au moins 4 GB de RAM disponible pour Docker

## 🚀 Démarrage rapide

### 1. Configuration initiale

Copiez le fichier d'environnement exemple :

```bash
# Racine du projet
cp .env.example .env.dev

# Backend (optionnel, si besoin de config locale)
cp backend/tf-api/.env.example backend/tf-api/.env

# Frontend (optionnel, si besoin de config locale)
cp frontend/.env.example frontend/.env
```

Éditez `.env.dev` avec vos valeurs personnalisées.

### 2. Développement

Démarrer tous les services en mode développement :

```bash
# Avec le fichier .env.dev
docker-compose -f docker-compose-dev.yml --env-file .env.dev up

# Ou en arrière-plan
docker-compose -f docker-compose-dev.yml --env-file .env.dev up -d

# Voir les logs
docker-compose -f docker-compose-dev.yml logs -f
```

Les services seront accessibles sur :
- **Frontend** : http://localhost:3000
- **Backend API** : http://localhost:8080/api
- **PgAdmin** : http://localhost:5050
- **PostgreSQL** : localhost:5432

### 3. Production

```bash
# Créer et configurer .env.prod avec des valeurs sécurisées
cp .env.example .env.prod

# IMPORTANT : Modifiez .env.prod avec des mots de passe forts !

# Lancer en production
docker-compose -f docker-compose-prod.yml --env-file .env.prod up -d
```

## 📦 Services disponibles

### Développement (`docker-compose-dev.yml`)

- **postgres** : Base de données PostgreSQL 16
- **backend** : API Spring Boot (Java 21)
- **frontend** : Application Next.js
- **pgadmin** : Interface de gestion PostgreSQL

### Production (`docker-compose-prod.yml`)

- **postgres** : Base de données PostgreSQL 16 (non exposée)
- **backend** : API Spring Boot optimisée
- **frontend** : Application Next.js optimisée
- **nginx** : Reverse proxy (à configurer)

## 🛠️ Commandes utiles

### Gestion des conteneurs

```bash
# Arrêter tous les services
docker-compose -f docker-compose-dev.yml down

# Arrêter et supprimer les volumes
docker-compose -f docker-compose-dev.yml down -v

# Reconstruire les images
docker-compose -f docker-compose-dev.yml build

# Reconstruire sans cache
docker-compose -f docker-compose-dev.yml build --no-cache

# Voir l'état des services
docker-compose -f docker-compose-dev.yml ps

# Redémarrer un service spécifique
docker-compose -f docker-compose-dev.yml restart backend
```

### Logs et debugging

```bash
# Voir tous les logs
docker-compose -f docker-compose-dev.yml logs

# Logs d'un service spécifique
docker-compose -f docker-compose-dev.yml logs backend

# Suivre les logs en temps réel
docker-compose -f docker-compose-dev.yml logs -f backend

# Accéder au shell d'un conteneur
docker exec -it taskforce-backend-dev sh
docker exec -it taskforce-frontend-dev sh

# Voir les processus
docker-compose -f docker-compose-dev.yml top
```

### Base de données

```bash
# Se connecter à PostgreSQL
docker exec -it taskforce-db-dev psql -U taskforce_user -d taskforce_dev

# Backup de la base
docker exec taskforce-db-dev pg_dump -U taskforce_user taskforce_dev > backup.sql

# Restaurer un backup
docker exec -i taskforce-db-dev psql -U taskforce_user -d taskforce_dev < backup.sql
```

## 🔧 Configuration

### Variables d'environnement

Les fichiers `.env` configurent :

- **Base de données** : nom, utilisateur, mot de passe, port
- **Backend** : port, CORS, JWT secret
- **Frontend** : port, URL de l'API
- **PgAdmin** : email, mot de passe, port

### Ports par défaut

| Service | Port Dev | Port Prod |
|---------|----------|-----------|
| Frontend | 3000 | 3000 (interne) |
| Backend | 8080 | 8080 (interne) |
| PostgreSQL | 5432 | - (interne) |
| PgAdmin | 5050 | - |
| Nginx | - | 80, 443 |

## 🐛 Résolution des problèmes

### Le backend ne démarre pas

```bash
# Vérifier les logs
docker-compose -f docker-compose-dev.yml logs backend

# Reconstruire l'image
docker-compose -f docker-compose-dev.yml build --no-cache backend

# Vérifier la connexion à la base
docker-compose -f docker-compose-dev.yml exec backend ping postgres
```

### Le frontend ne se connecte pas au backend

1. Vérifiez `NEXT_PUBLIC_API_URL` dans `.env`
2. Vérifiez les CORS dans le backend
3. Vérifiez que les deux services sont sur le même réseau

### Erreurs de permission

```bash
# Nettoyer les volumes
docker-compose -f docker-compose-dev.yml down -v

# Supprimer les données persistantes
rm -rf postgres_data pgadmin_data

# Redémarrer
docker-compose -f docker-compose-dev.yml up
```

### Problème de build Maven

```bash
# Nettoyer le cache Maven
docker-compose -f docker-compose-dev.yml run --rm backend mvn clean

# Ou supprimer le volume
docker volume rm taskforce-fullstack_maven_cache
```

## 🔒 Sécurité (Production)

Avant de déployer en production :

1. ✅ Changez tous les mots de passe dans `.env.prod`
2. ✅ Utilisez un JWT secret fort (256+ bits)
3. ✅ Configurez SSL/TLS avec Nginx
4. ✅ N'exposez pas PostgreSQL publiquement
5. ✅ Activez les pare-feu appropriés
6. ✅ Mettez en place des sauvegardes automatiques
7. ✅ Configurez les health checks
8. ✅ Utilisez des secrets Docker ou un gestionnaire de secrets

## 📊 Monitoring

### Health Checks

- **Backend** : http://localhost:8080/api/actuator/health
- **Frontend** : http://localhost:3000 (vérifier le chargement)

### Métriques

- **Backend Actuator** : http://localhost:8080/api/actuator/metrics

## 🎯 Workflow recommandé

### Développement

```bash
# 1. Démarrer les services
docker-compose -f docker-compose-dev.yml up -d

# 2. Voir les logs
docker-compose -f docker-compose-dev.yml logs -f

# 3. Développer (hot reload actif)

# 4. Arrêter
docker-compose -f docker-compose-dev.yml down
```

### Déploiement

```bash
# 1. Tester en local
docker-compose -f docker-compose-prod.yml --env-file .env.prod up

# 2. Vérifier les services
# 3. Déployer sur serveur
# 4. Configurer les domaines et SSL
```

## 📚 Ressources

- [Documentation Docker](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Spring Boot Docker](https://spring.io/guides/gs/spring-boot-docker/)
- [Next.js Docker](https://nextjs.org/docs/deployment#docker-image)
