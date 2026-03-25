# 📡 API Specification - Frontend → Backend

Documentation des endpoints API attendus par le frontend pour l'authentification et la gestion des utilisateurs.

---

## 🔐 Authentication Flow

### 1. **POST /api/auth/login** - Connexion

**Fichier frontend :** `components/auth/login/login-form.tsx`

**Request :**
```json
{
  "email": "user@exemple.com",
  "password": "motdepasse123"
}
```

**Response Success (200) :**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@exemple.com",
    "firstName": "John",
    "lastName": "Doe",
    "plan": "FREE" | "PRO" | "ENTERPRISE",
    "isEmailVerified": true
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

**Response Error (401) :**
```json
{
  "error": "INVALID_CREDENTIALS",
  "message": "Email ou mot de passe incorrect"
}
```

**Response Error (403) :**
```json
{
  "error": "EMAIL_NOT_VERIFIED",
  "message": "Veuillez vérifier votre email avant de vous connecter"
}
```

---

### 2. **POST /api/auth/register** - Inscription (Étape 1)

**Fichier frontend :** `components/auth/register/register-info-form.tsx`

**Request :**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "user@exemple.com",
  "password": "motdepasse123"
}
```

**Response Success (201) :**
```json
{
  "userId": "uuid",
  "email": "user@exemple.com",
  "message": "Compte créé avec succès. Veuillez choisir un plan."
}
```

**Response Error (409) :**
```json
{
  "error": "EMAIL_ALREADY_EXISTS",
  "message": "Un compte existe déjà avec cet email"
}
```

**Response Error (400) :**
```json
{
  "error": "INVALID_PASSWORD",
  "message": "Le mot de passe doit contenir au moins 8 caractères"
}
```

---

### 3. **POST /api/auth/register/plan** - Sélection du plan (Étape 2)

**Fichier frontend :** `components/auth/register/plan/plan-form.tsx`

**Request :**
```json
{
  "userId": "uuid",
  "plan": "FREE" | "PRO" | "ENTERPRISE"
}
```

**Response Success (200) :**
```json
{
  "userId": "uuid",
  "plan": "PRO",
  "stripeCheckoutUrl": "https://checkout.stripe.com/...", // Si plan payant
  "message": "Plan sélectionné. Vérification OTP envoyée par email."
}
```

**Notes :**
- Si plan = "FREE" : pas de `stripeCheckoutUrl`, on passe direct à l'OTP
- Si plan = "PRO" ou "ENTERPRISE" : retourner l'URL Stripe (mais OTP envoyé quand même)
- Le backend envoie un email avec le code OTP à 6 chiffres

---

### 4. **POST /api/auth/verify-otp** - Vérification OTP (Étape 3)

**Fichier frontend :** `components/auth/register/verification/verification-form.tsx`

**Request :**
```json
{
  "email": "user@exemple.com",
  "otp": "123456"
}
```

**Response Success (200) :**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@exemple.com",
    "firstName": "John",
    "lastName": "Doe",
    "plan": "PRO",
    "isEmailVerified": true
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "message": "Email vérifié avec succès"
}
```

**Response Error (400) :**
```json
{
  "error": "INVALID_OTP",
  "message": "Code de vérification incorrect"
}
```

**Response Error (410) :**
```json
{
  "error": "OTP_EXPIRED",
  "message": "Le code a expiré. Veuillez en demander un nouveau."
}
```

---

### 5. **POST /api/auth/resend-otp** - Renvoyer le code OTP

**Fichier frontend :** `components/auth/register/verification/verification-form.tsx`

**Request :**
```json
{
  "email": "user@exemple.com"
}
```

**Response Success (200) :**
```json
{
  "message": "Un nouveau code a été envoyé à votre adresse email",
  "expiresIn": 300
}
```

**Response Error (429) :**
```json
{
  "error": "TOO_MANY_REQUESTS",
  "message": "Veuillez attendre avant de demander un nouveau code",
  "retryAfter": 60
}
```

---

### 6. **POST /api/auth/forgot-password** - Demande de réinitialisation

**Fichier frontend :** `components/auth/forgot-password/forgot-password-form.tsx` (état "request")

**Request :**
```json
{
  "email": "user@exemple.com"
}
```

**Response Success (200) :**
```json
{
  "message": "Un email avec les instructions a été envoyé",
  "expiresIn": 3600
}
```

**Notes :**
- Le backend génère un token unique et l'envoie par email
- Format du lien : `https://app.taskforce.com/auth/forgot-password?token=abc123xyz`
- Le token doit expirer après 1h

**Response Error (404) :**
```json
{
  "error": "USER_NOT_FOUND",
  "message": "Aucun compte associé à cet email"
}
```

---

### 7. **POST /api/auth/reset-password** - Réinitialisation du mot de passe

**Fichier frontend :** `components/auth/forgot-password/forgot-password-form.tsx` (état "reset-password")

**Request :**
```json
{
  "token": "abc123xyz",
  "password": "nouveaumotdepasse123"
}
```

**Response Success (200) :**
```json
{
  "message": "Mot de passe réinitialisé avec succès"
}
```

**Response Error (400) :**
```json
{
  "error": "INVALID_TOKEN",
  "message": "Le lien de réinitialisation est invalide ou a expiré"
}
```

**Response Error (410) :**
```json
{
  "error": "TOKEN_EXPIRED",
  "message": "Le lien a expiré. Veuillez faire une nouvelle demande."
}
```

---

## 🔄 Token Management

### 8. **POST /api/auth/refresh** - Rafraîchir le token

**Utilisation :** Automatique quand le `accessToken` expire

**Request :**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response Success (200) :**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

**Response Error (401) :**
```json
{
  "error": "INVALID_REFRESH_TOKEN",
  "message": "Session expirée, veuillez vous reconnecter"
}
```

---

### 9. **POST /api/auth/logout** - Déconnexion

**Request Headers :**
```
Authorization: Bearer {accessToken}
```

**Request :**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response Success (200) :**
```json
{
  "message": "Déconnexion réussie"
}
```

---

## 👤 User Profile

### 10. **GET /api/user/me** - Récupérer le profil

**Request Headers :**
```
Authorization: Bearer {accessToken}
```

**Response Success (200) :**
```json
{
  "id": "uuid",
  "email": "user@exemple.com",
  "firstName": "John",
  "lastName": "Doe",
  "plan": "PRO",
  "isEmailVerified": true,
  "createdAt": "2026-01-27T10:00:00Z",
  "subscription": {
    "status": "ACTIVE" | "CANCELED" | "PAST_DUE",
    "currentPeriodEnd": "2026-02-27T10:00:00Z",
    "cancelAtPeriodEnd": false
  }
}
```

**Response Error (401) :**
```json
{
  "error": "UNAUTHORIZED",
  "message": "Token invalide ou expiré"
}
```

---

## 💳 Stripe Integration (Gestion des plans)

### 11. **POST /api/stripe/create-checkout** - Créer une session de paiement

**Utilisé si l'utilisateur upgrade son plan après inscription**

**Request Headers :**
```
Authorization: Bearer {accessToken}
```

**Request :**
```json
{
  "plan": "PRO" | "ENTERPRISE",
  "successUrl": "https://app.taskforce.com/dashboard?payment=success",
  "cancelUrl": "https://app.taskforce.com/auth/register/plan?payment=cancel"
}
```

**Response Success (200) :**
```json
{
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_...",
  "sessionId": "cs_test_..."
}
```

---

### 12. **POST /api/stripe/webhook** - Webhook Stripe

**Note :** Endpoint pour que Stripe notifie le backend des événements (paiement réussi, échec, etc.)

**Events à gérer :**
- `checkout.session.completed` → Activer le plan PRO/ENTERPRISE
- `customer.subscription.updated` → Mise à jour du statut
- `customer.subscription.deleted` → Downgrade vers FREE

---

## 📊 Résumé des données nécessaires

### Frontend → Backend (ce que le front envoie)

| Page/Action | Données envoyées |
|------------|------------------|
| **Login** | `email`, `password` |
| **Register Step 1** | `firstName`, `lastName`, `email`, `password` |
| **Register Step 2** | `userId`, `plan` |
| **Register Step 3** | `email`, `otp` |
| **Resend OTP** | `email` |
| **Forgot Password** | `email` |
| **Reset Password** | `token`, `password` |

### Backend → Frontend (ce que le front attend)

| Endpoint | Données critiques retournées |
|----------|------------------------------|
| **Login** | `user` (id, email, firstName, lastName, plan), `accessToken`, `refreshToken` |
| **Register Step 1** | `userId`, `email` |
| **Register Step 2** | `userId`, `plan`, `stripeCheckoutUrl` (si payant) |
| **Verify OTP** | `user`, `accessToken`, `refreshToken` (connexion auto après vérification) |
| **Forgot Password** | `message` (confirmation d'envoi) |
| **Reset Password** | `message` (confirmation de succès) |
| **/user/me** | Profil complet + infos subscription |

---

## 🔧 Configuration Backend requise

### Headers CORS
```
Access-Control-Allow-Origin: https://app.taskforce.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
```

### JWT Configuration
- **Access Token :** Expiration 1h (3600s)
- **Refresh Token :** Expiration 7 jours (604800s)
- **Algorithm :** RS256 (recommandé) ou HS256
- **Payload minimal :**
  ```json
  {
    "sub": "userId",
    "email": "user@exemple.com",
    "plan": "PRO",
    "iat": 1234567890,
    "exp": 1234571490
  }
  ```

### Keycloak Integration
- **Créer un user** → Endpoint Keycloak Admin API
- **Vérifier email** → Mettre `emailVerified: true`
- **Login** → Utiliser Keycloak pour l'authentification
- **Tokens** → Les tokens JWT doivent venir de Keycloak

### Stripe Integration
- **Webhooks :** Configurer l'endpoint `/api/stripe/webhook`
- **Plans :**
  - FREE : Aucune subscription
  - PRO : Price ID Stripe (ex: `price_1234...`)
  - ENTERPRISE : Price ID Stripe (ex: `price_5678...`)

---

## 📝 Notes importantes

1. **SessionStorage Frontend :**
   - Le frontend garde temporairement les données d'inscription (firstName, lastName, email, plan) dans `sessionStorage`
   - Ces données sont envoyées à chaque étape et nettoyées après vérification OTP

2. **Flux d'inscription complet :**
   ```
   Register Info → POST /api/auth/register (userId retourné)
   ↓
   Select Plan → POST /api/auth/register/plan (OTP envoyé par email)
   ↓
   Verify OTP → POST /api/auth/verify-otp (tokens retournés, connexion auto)
   ↓
   Redirect to Dashboard (authentifié)
   ```

3. **Redirection après login :**
   - Le frontend redirige vers `/dashboard` après login/vérification réussie
   - Assure-toi que le backend retourne bien les tokens à ces moments

4. **Gestion des erreurs :**
   - Toutes les erreurs doivent retourner un format cohérent :
     ```json
     {
       "error": "CODE_ERREUR",
       "message": "Message descriptif en français"
     }
     ```

5. **Rate limiting recommandé :**
   - `/api/auth/login` : 5 tentatives / 15 min
   - `/api/auth/register` : 3 inscriptions / heure par IP
   - `/api/auth/resend-otp` : 1 requête / minute
   - `/api/auth/forgot-password` : 3 requêtes / heure

---

Une fois le backend implémenté selon cette spec, je remplacerai tous les `// TODO:` dans le frontend avec les vrais appels API ! 🚀
