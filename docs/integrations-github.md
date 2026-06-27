# Configurer l'intégration GitHub (TaskForce)

> TL;DR — l'intégration ne marche pas tant que tu n'as pas créé une **OAuth App GitHub** et renseigné `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` dans `.env.dev`. Aujourd'hui ce sont des placeholders.

## Pourquoi ça ne fonctionne pas actuellement

Dans `.env.dev` :

```env
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
```

Ces valeurs sont des placeholders → le flux OAuth (`/api/integrations/github/connect` → GitHub → `/api/integrations/github/callback`) ne peut pas aboutir. Côté backend, la config attend ces variables (`application-dev.yml` → `integrations.github.client-id/secret`).

## Étapes (dev local)

1. **Créer une OAuth App GitHub** : https://github.com/settings/applications/new
   - **Application name** : `TaskForce (dev)`
   - **Homepage URL** : `http://localhost:3000`
   - **Authorization callback URL** : `http://localhost:8080/api/integrations/github/callback`
   > ⚠️ Le callback pointe sur le **backend (8080)**, pas le front (3000).

2. **Récupérer les identifiants** : note le **Client ID**, puis **Generate a new client secret** et copie-le (visible une seule fois).

3. **Renseigner `.env.dev`** :

   ```env
   GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
   GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

4. **Redémarrer le backend** (les env sont lues au démarrage) :

   ```bash
   docker compose -f docker-compose.dev.yml up -d --build backend
   ```

5. **Connecter dans l'app** : Settings → Integrations → **Connect GitHub**. Tu es redirigé vers GitHub pour autoriser, puis renvoyé sur l'app (toast « GitHub connecté avec succès ! »).

## Scopes demandés

`repo, read:org` — lecture des dépôts (issues, PR) et de l'organisation. Définis dans `GitHubIntegrationService` (`&scope=repo,read:org`). Pour un usage en lecture seule plus strict, on pourra plus tard restreindre à `public_repo` (à discuter).

## En production

- Créer une **2e** OAuth App (ou une GitHub App) avec le callback de prod : `https://<domaine-api>/api/integrations/github/callback`.
- Injecter `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` via les secrets de l'hébergeur (jamais en dur).

## Vérifier que c'est branché

- `GET /api/workspaces/{slug}/integrations/github/status` → doit renvoyer `connected: true` après autorisation.
- Endpoints disponibles une fois connecté : `/repos`, `/issues`, liens issue↔GitHub (`/issues/{id}/links`).

## Dépannage

| Symptôme | Cause probable |
|----------|----------------|
| Rien ne se passe au clic « Connect » | `GITHUB_CLIENT_ID` vide/placeholder → backend ne construit pas l'URL d'autorisation |
| `redirect_uri mismatch` côté GitHub | Le callback de l'OAuth App ≠ `http://localhost:8080/api/integrations/github/callback` |
| Connecté mais aucun repo | Scope insuffisant ou compte sans accès au dépôt/org |
