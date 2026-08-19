# 🔐 Configuration des variables d'environnement

## 📁 Structure des fichiers

```
.env.dev.example      ← Template pour développement (committé)
.env.dev              ← Fichier DEV réel (ignoré par git)
.env.prod.example     ← Template pour production (committé)
.env.prod             ← Fichier PROD réel (ignoré par git, à créer)
```

## 🚀 Installation

### Pour le développement local

```bash
# Copier le template
cp .env.dev.example .env.dev

# Ou sur Windows
copy .env.dev.example .env.dev

# Modifier les valeurs si nécessaire (optionnel)
# Les valeurs par défaut fonctionnent avec Docker Compose
```

### Pour la production

```bash
# Copier le template
cp .env.prod.example .env.prod

# Ou sur Windows
copy .env.prod.example .env.prod

# ⚠️ MODIFIER TOUTES LES VALEURS SENSIBLES
# - Mots de passe forts
# - URLs de production
# - Secrets Keycloak
```

## 📝 Utilisation

### Avec Maven (local)

```bash
# En développement
export $(cat .env.dev | xargs)  # Linux/Mac
$env:$(Get-Content .env.dev)    # Windows PowerShell
mvn spring-boot:run

# En production
export $(cat .env.prod | xargs)
mvn spring-boot:run
```

### Avec Docker Compose

```bash
# En développement
docker-compose --env-file .env.dev up

# En production
docker-compose -f docker-compose.prod.yml --env-file .env.prod up
```

## ⚠️ Sécurité

- ❌ **NE JAMAIS** commiter `.env.dev` ou `.env.prod`
- ✅ Seuls les fichiers `.example` sont committés pour information et template de construction des fichiers .env
- 🔒 Utiliser des mots de passe forts en production
- 🔐 Changer tous les secrets par défaut

## 🔄 Profils Spring Boot

Le fichier `.env.dev` charge → `application-dev.yml`
Le fichier `.env.prod` charge → `application-prod.yml`
