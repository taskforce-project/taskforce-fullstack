# Keycloak Configuration

Ce dossier contient la configuration Keycloak pour les différents environnements.

## Structure

```
keycloak/
├── realms/
│   ├── taskforce-dev-realm.json    # Configuration développement
│   └── taskforce-prod-realm.json   # Configuration production
└── README.md
```

## Realms

### Development (taskforce-dev)

**Utilisateurs de test :**
- **Admin**
  - Username: `admin`
  - Password: `admin123`
  - Email: `admin@taskforce.dev`
  - Rôles: `admin`, `user`, `api-admin`, `api-user`

- **User**
  - Username: `user`
  - Password: `user123`
  - Email: `user@taskforce.dev`
  - Rôles: `user`, `api-user`

**Clients configurés :**
- `taskforce-api` : Backend API (confidential)
  - Client Secret: `dev-secret-change-in-production`
- `taskforce-web` : Frontend web (public)

**Configuration de sécurité :**
- SSL requis: None (pour localhost)
- Inscription activée
- Vérification email désactivée
- Token lifetime: 1h

### Production (taskforce-prod)

**Clients configurés :**
- `taskforce-api` : Backend API (confidential)
  - Client Secret: À configurer via variables d'environnement
- `taskforce-web` : Frontend web (public)

**Configuration de sécurité :**
- SSL requis: External
- Inscription désactivée
- Vérification email activée
- Token lifetime: 30min
- Protection brute force renforcée
- Révocation des refresh tokens

## Import dans Keycloak

### Via Docker Compose

Les realms sont automatiquement importés au démarrage de Keycloak via le volume monté :

```yaml
volumes:
  - ./keycloak/realms:/opt/keycloak/data/import
```

### Manuellement

1. Accéder à l'admin console Keycloak
2. Menu "Realm settings" > "Partial import"
3. Sélectionner le fichier JSON approprié
4. Choisir les options d'import
5. Cliquer sur "Import"

## Personnalisation

Pour créer un nouveau realm :

1. Créer le realm dans l'interface Keycloak
2. Configurer les clients, rôles, utilisateurs
3. Exporter via "Realm settings" > "Partial export"
4. Sauvegarder dans `keycloak/realms/`

## Sécurité

⚠️ **IMPORTANT** :
- Les secrets dans `taskforce-dev-realm.json` sont pour le développement uniquement
- En production, utiliser des secrets forts via variables d'environnement
- Ne jamais commiter de secrets de production dans le repository
- Activer HTTPS en production
- Configurer SMTP pour les emails
