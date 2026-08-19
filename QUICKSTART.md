# 🚀 Guide de Démarrage Rapide - Taskforce

## ⚡ Démarrage ultra-rapide (3 commandes)

```powershell
# 1. Aller à la racine du projet
cd C:\taskforce-project\taskforce-fullstack

# 2. Démarrer tous les services
.\tf.ps1 up

# 3. Ouvrir le frontend
start http://localhost:3000
```

## 📋 Vérification des services

Après quelques minutes (le temps que tous les services démarrent), vérifier que tout est UP :

```powershell
docker ps
```

**Vous devriez voir 5 containers running :**
- ✅ `taskforce-postgres-dev` - Base de données
- ✅ `taskforce-keycloak-dev` - Authentification
- ✅ `taskforce-backend-dev` - API Spring Boot
- ✅ `taskforce-frontend-dev` - Interface Next.js
- ✅ `taskforce-pgadmin-dev` - Administration DB

## 🌐 URLs d'accès

| Service | URL | Identifiants |
|---------|-----|--------------|
| **Frontend** | http://localhost:3000 | - |
| **Backend API** | http://localhost:8080/api | - |
| **Keycloak** | http://localhost:8180 | admin / admin |
| **pgAdmin** | http://localhost:5050 | admin@taskforce.dev / admin |

## 🧪 Test complet du flux d'inscription

### 1️⃣ Inscription (http://localhost:3000/auth/register)

Remplir le formulaire :
- **Prénom :** Jean
- **Nom :** Dupont
- **Email :** jean.dupont@example.com
- **Mot de passe :** `Test@2024!`
- **Confirmer mot de passe :** `Test@2024!`

➡️ Cliquer sur **"Continuer"**

✅ **Résultat attendu :** 
- Toast de succès "Compte créé avec succès"
- Redirection automatique vers choix du plan

---

### 2️⃣ Choix du plan

Sélectionner un plan :
- **Gratuit** (recommandé pour les tests)
- Pro
- Enterprise

➡️ Cliquer sur **"Continuer"**

✅ **Résultat attendu :** 
- Toast de succès "Plan sélectionné avec succès"
- Toast "Code de vérification envoyé à votre email"
- Redirection automatique vers vérification OTP

---

### 3️⃣ Vérification email (OTP)

**IMPORTANT :** Le code OTP est envoyé par email via **Mailtrap**.

#### Comment récupérer le code OTP :

**Option A : Via Mailtrap (Recommandé)**
1. Aller sur https://mailtrap.io
2. Se connecter avec les credentials Mailtrap
3. Aller dans **Email Testing** → **Inboxes** → **Sandbox**
4. Ouvrir l'email le plus récent de `noreply@taskforce.dev`
5. Copier le code à 6 chiffres

**Option B : Via les logs backend**
```powershell
# Afficher les derniers logs contenant "OTP"
docker logs taskforce-backend-dev | Select-String "OTP" | Select-Object -Last 5
```

➡️ Entrer le code à 6 chiffres dans le formulaire

➡️ Cliquer sur **"Vérifier"**

✅ **Résultat attendu :** 
- Toast de succès "Compte vérifié avec succès !"
- Redirection automatique vers page de connexion

---

### 4️⃣ Connexion (http://localhost:3000/auth/login)

Entrer les identifiants :
- **Email :** jean.dupont@example.com
- **Mot de passe :** `Test@2024!`

➡️ Cliquer sur **"Se connecter"**

✅ **Résultat attendu :** 
- Toast de succès "Connexion réussie"
- Redirection automatique vers `/dashboard`
- JWT token stocké dans localStorage

---

## 🔍 Vérifier les données créées

### Dans Keycloak (http://localhost:8180)

1. Se connecter : `admin` / `admin`
2. Sélectionner realm : **taskforce-dev** (menu déroulant en haut à gauche)
3. Menu **Users** → Cliquer sur **View all users**
4. Vérifier que l'utilisateur `jean.dupont@example.com` existe
5. Cliquer sur l'utilisateur → Onglet **Details**
   - ✅ Email verified : **Yes**
   - ✅ Enabled : **On**

### Dans PostgreSQL via pgAdmin (http://localhost:5050)

1. Se connecter : `admin@taskforce.dev` / `admin`
2. Cliquer droit sur **Servers** → **Register** → **Server**
3. Configurer :
   - **Name :** Taskforce DB
   - Onglet **Connection :**
     - Host : `postgres`
     - Port : `5432`
     - Database : `taskforce-db`
     - Username : `postgres`
     - Password : `PostgreSQLP54!`
4. Sauvegarder
5. Naviguer : **Servers** → **Taskforce DB** → **Databases** → **taskforce-db** → **Schemas** → **public** → **Tables**
6. Cliquer droit sur **users** → **View/Edit Data** → **All Rows**
7. Vérifier que l'utilisateur Jean Dupont existe avec :
   - ✅ email : `jean.dupont@example.com`
   - ✅ plan_type : `FREE` (ou celui sélectionné)
   - ✅ email_verified : `true`

### Via ligne de commande

```powershell
# Se connecter au container PostgreSQL
docker exec -it taskforce-postgres-dev psql -U postgres -d taskforce-db

# Lister tous les utilisateurs
SELECT id, email, first_name, last_name, plan_type, email_verified, created_at FROM users;

# Vérifier les OTP générés
SELECT email, otp_code, otp_type, is_used, expires_at, created_at FROM otp_codes ORDER BY created_at DESC LIMIT 10;

# Quitter
\q
```

---

## 🛑 Arrêter les services

```powershell
.\tf.ps1 down
```

Ou :

```powershell
docker-compose -f docker-compose.dev.yml down
```

## 🗑️ Nettoyer complètement (supprimer volumes)

**⚠️ ATTENTION :** Cela supprimera toutes les données (utilisateurs, OTP, etc.)

```powershell
docker-compose -f docker-compose.dev.yml down -v
```

---

## 🐛 Problèmes fréquents

### ❌ "Connection refused" sur le backend

**Cause :** Le backend met du temps à démarrer (compilation Spring Boot).

**Solution :** Attendre 1-2 minutes et recharger la page.

```powershell
# Vérifier les logs
docker logs taskforce-backend-dev
```

---

### ❌ "Email pas reçu" (OTP)

**Cause :** Les credentials Mailtrap ne sont pas corrects.

**Solution :** Vérifier `.env.dev` :
```bash
MAILTRAP_USERNAME=41bc6508eb1568
MAILTRAP_PASSWORD=6f5505ff791ede
```

**Alternative :** Récupérer le code dans les logs :
```powershell
docker logs taskforce-backend-dev | Select-String "OTP"
```

---

### ❌ "Code OTP invalide"

**Causes possibles :**
1. Code expiré (15 minutes max)
2. Code déjà utilisé
3. Typo dans le code

**Solution :** Cliquer sur "Renvoyer le code" (1 fois par minute max).

---

### ❌ Keycloak ne démarre pas

**Cause :** Port 8180 déjà utilisé ou problème de volume.

**Solution :**
```powershell
# Nettoyer et redémarrer
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up --build
```

---

## 📚 Documentation complète

Pour plus de détails, voir :
- [KEYCLOAK_INTEGRATION_COMPLETE.md](./KEYCLOAK_INTEGRATION_COMPLETE.md) - Documentation complète de l'intégration
- [FRONTEND_IMPROVEMENTS.md](./frontend/FRONTEND_IMPROVEMENTS.md) - Améliorations frontend

---

## ✅ Checklist de démarrage

- [ ] Docker Desktop est lancé
- [ ] Aucun autre service n'utilise les ports 3000, 8080, 8180, 5432, 5050
- [ ] Fichier `.env.dev` présent à la racine
- [ ] Exécution de `.\tf.ps1 up`
- [ ] Attendre 2-3 minutes que tous les services démarrent
- [ ] Vérifier `docker ps` → 5 containers running
- [ ] Ouvrir http://localhost:3000
- [ ] Tester le flow d'inscription complet

---

🎉 **Bon développement !**
