# P0 — Fix sheet (exécution VSCode)

> Plan d'exécution précis des correctifs **P0** du [backlog](../../taskforce-docs/technique/Roadmap_Backlog.md)
> (TF-FIX-001→005 / PC-001→005). Paste-ready pour VSCode/Copilot. Chemins et signatures **vérifiés dans le
> code au 09/06/2026**. Faire les fixes dans l'ordre ; commiter chacun séparément (`fix(scope): …`).

Branche conseillée : `git checkout -b fix/p0-broken-routes`

---

## TF-FIX-001 🔴 — Ajouter `/api` aux 5 contrôleurs (PC-001)

**Pourquoi :** aucun `context-path` n'est configuré ; le front appelle déjà `/api/...`. 5 contrôleurs
servent `/workspaces/...` → 404. Front **déjà correct** (cf. `api-routes.ts`), donc on corrige **le backend**.

**Fichiers & changements** (`@RequestMapping` en tête de classe) :

| Fichier | Avant | Après |
|---------|-------|-------|
| `core/api/CycleController.java` | `@RequestMapping("/workspaces/{slug}/projects/{projectId}/cycles")` | `@RequestMapping("/api/workspaces/{slug}/projects/{projectId}/cycles")` |
| `core/api/TeamController.java` | `@RequestMapping("/workspaces/{slug}/teams")` | `@RequestMapping("/api/workspaces/{slug}/teams")` |
| `core/api/PageController.java` | `@RequestMapping("/workspaces/{slug}/projects/{projectId}/pages")` | `@RequestMapping("/api/workspaces/{slug}/projects/{projectId}/pages")` |
| `core/api/DiscussionController.java` | `@RequestMapping("/workspaces/{slug}/discussions")` | `@RequestMapping("/api/workspaces/{slug}/discussions")` |
| `modules/chat/api/ChannelController.java` | `@RequestMapping("/workspaces/{slug}/channels")` | `@RequestMapping("/api/workspaces/{slug}/channels")` |

**Vérif :**
- `grep -rn '@RequestMapping("/workspaces' backend/` → **0 résultat**.
- `GET http://localhost:8080/api/workspaces/<slug>/teams` (avec JWT) → 200, plus 404.
- Nettoyer le commentaire trompeur `shared/config/CorsConfig.java:65` (« context-path=/api ») → PC-015.

---

## TF-FIX-002 🟠 — Déclarer les 4 groupes de routes front manquants (PC-002)

**Pourquoi :** `MESSAGE_ROUTES`, `INTEGRATION_ROUTES`, `ATTACHMENT_ROUTES`, `ROADMAP_ROUTES` sont importés
mais **non déclarés** dans `frontend/lib/config/api-routes.ts` → `undefined` au runtime. Les backends
integrations/webhooks/attachments/roadmap ont **déjà `/api`** (rien à changer côté back) ; les messages
passent par `ChannelController` corrigé en TF-FIX-001.

**Fichier :** `frontend/lib/config/api-routes.ts` — ajouter ces 4 blocs (avant `export const API_ROUTES`).

> ⚠️ **Piège connect OAuth** : `connectGitHub`/`connectSlack` font `window.location.href = ROUTE(slug)`.
> Un chemin **relatif** irait sur le front (:3000). Les routes `*_CONNECT` doivent être **absolues** vers
> le backend. On ajoute donc une base `API_BASE` pour ces 2 routes uniquement (les autres passent par
> Axios qui préfixe déjà `baseURL`).

```ts
// Base backend pour les redirections navigateur (OAuth) — PAS pour les appels Axios.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * Routes messagerie / chat
 * Backend: /api/workspaces/{slug}/channels (ChannelController, corrigé en TF-FIX-001)
 */
export const MESSAGE_ROUTES = {
  CHANNELS:   (slug: string) => `/api/workspaces/${slug}/channels`,
  MESSAGES:   (slug: string, channelId: number) => `/api/workspaces/${slug}/channels/${channelId}/messages`,
  EDIT_MSG:   (slug: string, channelId: number, messageId: number) => `/api/workspaces/${slug}/channels/${channelId}/messages/${messageId}`,
  DELETE_MSG: (slug: string, channelId: number, messageId: number) => `/api/workspaces/${slug}/channels/${channelId}/messages/${messageId}`,
} as const;

/**
 * Routes intégrations (GitHub / Slack / Webhooks)
 * Backend: IntegrationController + WebhookController (déjà préfixés /api)
 */
export const INTEGRATION_ROUTES = {
  GITHUB_STATUS:     (slug: string) => `/api/workspaces/${slug}/integrations/github/status`,
  GITHUB_CONNECT:    (slug: string) => `${API_BASE}/api/workspaces/${slug}/integrations/github/connect`,
  GITHUB_DISCONNECT: (slug: string) => `/api/workspaces/${slug}/integrations/github`,
  GITHUB_LINKS:      (slug: string, issueId: number) => `/api/workspaces/${slug}/integrations/github/issues/${issueId}/links`,
  GITHUB_LINK:       (slug: string, linkId: number) => `/api/workspaces/${slug}/integrations/github/links/${linkId}`,
  SLACK_STATUS:      (slug: string) => `/api/workspaces/${slug}/integrations/slack/status`,
  SLACK_CONNECT:     (slug: string) => `${API_BASE}/api/workspaces/${slug}/integrations/slack/connect`,
  SLACK_DISCONNECT:  (slug: string) => `/api/workspaces/${slug}/integrations/slack`,
  SLACK_CHANNELS:    (slug: string) => `/api/workspaces/${slug}/integrations/slack/channels`,
  SLACK_CHANNEL:     (slug: string, channelId: number) => `/api/workspaces/${slug}/integrations/slack/channels/${channelId}`,
  WEBHOOKS:          (slug: string) => `/api/workspaces/${slug}/webhooks`,
  WEBHOOK:           (slug: string, id: number) => `/api/workspaces/${slug}/webhooks/${id}`,
} as const;

/**
 * Routes pièces jointes (attachments d'issue)
 * Backend: /api/workspaces/{slug}/projects/{projectId}/issues/{issueId}/attachments (déjà /api)
 */
export const ATTACHMENT_ROUTES = {
  LIST:   (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/attachments`,
  UPLOAD: (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/attachments`,
  DELETE: (slug: string, projectId: number, issueId: number, attachmentId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/attachments/${attachmentId}`,
} as const;

/**
 * Routes roadmap (issues planifiées)
 * Backend: /api/workspaces/{slug}/roadmap (RoadmapController, déjà /api)
 */
export const ROADMAP_ROUTES = {
  SCHEDULED: (slug: string) => `/api/workspaces/${slug}/roadmap`,
} as const;
```

**Vérif :**
- `npm run build` (ou `tsc --noEmit`) sans erreur d'import.
- Ouvrir Messages / Intégrations / Roadmap / upload PJ → plus d'erreur `Cannot read properties of undefined`.
- (Optionnel TD-011) ajouter ces groupes à l'agrégat `API_ROUTES`.

---

## TF-FIX-003 🔴 — Import cassé `profile-service.ts` (PC-003)

**Fichier :** `frontend/lib/api/profile-service.ts` — **ligne 1**.

```ts
// AVANT
import apiClient from "./api-client";
// APRÈS
import { apiClient } from "./client";
```

**Vérif :** `tsc --noEmit` OK ; la page profil charge sans erreur runtime.

---

## TF-FIX-004 🟠 — Refresh token + logout (PC-004) — ⚠️ DESIGN avec Claude

Pas un simple patch : implémentation sécurité. **Décisions à trancher avant code** :
1. Stratégie refresh : **Keycloak refresh grant** (recommandé, cohérent avec l'archi OAuth2) vs JWT maison via `JwtService`.
2. Chemin : aligner front `/api/auth/refresh` ↔ back (actuellement `/api/auth/refresh-token`). → choisir UNE valeur.
3. Logout : révocation côté Keycloak (`logout` endpoint OIDC) + purge `RefreshToken` en base.

**Fichiers concernés :** `core/api/AuthController.java`, `core/service/AuthService.java`,
`core/service/Keycloak(Auth)Service.java`, `core/service/JwtService.java`, `frontend/lib/api/client.ts` (séquence refresh).
👉 On le fait ensemble (je fournis le diff complet une fois les 3 décisions prises).

---

## TF-FIX-005 🟠 — Webhooks Stripe (PC-005) — ⚠️ DESIGN avec Claude

Implémentation facturation, correctness critique. **À définir** :
1. Events gérés : `customer.subscription.updated` / `.deleted`, `invoice.payment_succeeded` / `.failed`.
2. Mutations DB : mapping event → `Subscription` (statut, période) + `SubscriptionHistory`.
3. Vérif signature webhook (`STRIPE_WEBHOOK_SECRET`) + idempotence (event id déjà traité ?).
4. Vérifier que `create-checkout` / `subscription` / `cancel` existent bien côté `StripeController` (sinon les ajouter).

**Fichiers :** `core/api/StripeWebhookController.java`, `core/service/StripeService.java`,
`core/model/Subscription.java` / `SubscriptionHistory.java`.
👉 On le fait ensemble.

---

## Ordre & commits

1. `fix(api): add /api prefix to cycle/team/page/discussion/channel controllers` (TF-FIX-001)
2. `fix(frontend): declare missing message/integration/attachment/roadmap routes` (TF-FIX-002)
3. `fix(frontend): correct profile-service api client import` (TF-FIX-003)
4. `feat(auth): implement token refresh & logout revocation` (TF-FIX-004 — après design)
5. `feat(billing): handle stripe subscription/invoice webhooks` (TF-FIX-005 — après design)

> Après 001+002+003 : relancer les vérifs de [API.md](../../taskforce-docs/technique/API.md) §4 et passer
> les domaines Cycles/Teams/Pages/Discussions/Chat/Intégrations/PJ/Roadmap de ❌ à ✅ dans le tableau de
> bord du [Brain OS](../../taskforce-docs/Brain_OS.md).
