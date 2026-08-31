/**
 * Centralisation des routes API
 * Ce fichier regroupe toutes les URLs des endpoints backend
 * Facilite la maintenance et évite les erreurs de typo
 */

/**
 * Routes d'authentification
 * Backend: @RequestMapping("/api/auth")
 */
export const AUTH_ROUTES = {
  LOGIN: "/api/auth/login",
  REGISTER: "/api/auth/register",
  /** Défi de vérification humaine, demandé au chargement du formulaire d'inscription. */
  CHALLENGE: "/api/auth/challenge",
  /** Connexion externe : URL de démarrage à demander au serveur (elle porte l'état anti-CSRF signé). */
  OAUTH_AUTHORIZE: (provider: string) => `/api/auth/oauth/${provider}/authorize`,
  /** Connexion externe : échange du code d'autorisation contre une session TaskForce. */
  OAUTH_CALLBACK: "/api/auth/oauth/callback",
  SELECT_PLAN: "/api/auth/select-plan",
  VERIFY_OTP: "/api/auth/verify-otp",
  RESEND_OTP: "/api/auth/resend-otp",
  FORGOT_PASSWORD: "/api/auth/forgot-password",
  RESET_PASSWORD: "/api/auth/reset-password",
  REFRESH_TOKEN: "/api/auth/refresh-token",
  LOGOUT: "/api/auth/logout",
} as const;

/**
 * Routes Stripe (paiements et abonnements)
 * Backend: @RequestMapping("/api/stripe")
 */
export const STRIPE_ROUTES = {
  CREATE_CHECKOUT: "/api/stripe/create-checkout",
  VERIFY_SESSION: "/api/stripe/verify-session",
  CANCEL_SUBSCRIPTION: "/api/stripe/cancel",
  WEBHOOK: "/api/stripe/webhook",
} as const;

/**
 * Routes facturation self-service (Stripe Customer Portal) - chemin protégé.
 * Backend: @RequestMapping("/api/billing")
 */
export const BILLING_ROUTES = {
  PORTAL: "/api/billing/portal",
  SUBSCRIPTION: "/api/billing/subscription",
  CHECKOUT: "/api/billing/checkout",
} as const;

/**
 * Routes utilisateur (profil)
 * Backend: @RequestMapping("/api/users")
 */
export const USER_ROUTES = {
  ME: "/api/users/me",
  AVATAR: "/api/users/me/avatar",
  DATA_REQUEST: "/api/users/me/data-request",
  /** Sécurité (métier Keycloak) : reset mot de passe + 2FA. */
  PASSWORD_RESET: "/api/users/me/password/reset",
  TWO_FACTOR: "/api/users/me/2fa",
  TWO_FACTOR_SETUP: "/api/users/me/2fa/setup",
  TWO_FACTOR_CONFIRM: "/api/users/me/2fa/confirm",
  SEARCH: (q: string) => `/api/users/search?q=${encodeURIComponent(q)}`,
  /** Clôture du parcours d'onboarding (rôle + drapeau). */
  ONBOARDING: "/api/users/me/onboarding",
} as const;

/**
 * Statut opérationnel (santé services, lue de l'actuator).
 * Backend: @RequestMapping("/api/status")
 */
export const STATUS_ROUTES = {
  SYSTEM: "/api/status",
} as const;

/**
 * Retours utilisateur (« Give feedback »).
 * Backend: @RequestMapping("/api/feedback")
 */
export const FEEDBACK_ROUTES = {
  SUBMIT: "/api/feedback",
} as const;

/**
 * Acceptation / refus d'une assignation de tâche (assigné courant).
 * Backend: @RequestMapping("/api/me/assignments")
 */
export const ASSIGNMENT_ROUTES = {
  ACCEPT:  (issueId: number) => `/api/me/assignments/${issueId}/accept`,
  DECLINE: (issueId: number) => `/api/me/assignments/${issueId}/decline`,
} as const;

/**
 * Routes workspace
 * Backend: @RequestMapping("/api/workspaces")
 */
export const WORKSPACE_ROUTES = {
  // Liste et création
  LIST: "/api/workspaces",
  CREATE: "/api/workspaces",
  // Par slug
  BY_SLUG: (slug: string) => `/api/workspaces/${slug}`,
  MEMBERS: (slug: string) => `/api/workspaces/${slug}/members`,
  USAGE: (slug: string) => `/api/workspaces/${slug}/usage`,
  AUDIT: (slug: string) => `/api/workspaces/${slug}/audit`,
  INVITE: (slug: string) => `/api/workspaces/${slug}/members/invite`,
  MEMBER_ROLE: (slug: string, memberId: number) => `/api/workspaces/${slug}/members/${memberId}/role`,
  MEMBER: (slug: string, memberId: number) => `/api/workspaces/${slug}/members/${memberId}`,
  // Invitations par email (PROD-3.5)
  INVITATIONS: (slug: string) => `/api/workspaces/${slug}/invitations`,
  INVITATION: (slug: string, invitationId: number) => `/api/workspaces/${slug}/invitations/${invitationId}`,
  // Redistribution de charge (PROD-1.12)
  REDISTRIBUTE_PREVIEW: (slug: string) => `/api/workspaces/${slug}/redistribute/preview`,
  REDISTRIBUTE_APPLY: (slug: string) => `/api/workspaces/${slug}/redistribute/apply`,
  // Journalisation des erreurs client (E25) - logs serveur classiques
  CLIENT_LOG: "/api/logs/client",
  // Rétrocompatibilité
  CURRENT: "/api/workspaces/current",
} as const;

/**
 * Routes d'invitation par token (PROD-3.5)
 * Backend: InvitationController
 */
export const INVITATION_ROUTES = {
  PREVIEW: (token: string) => `/api/invitations/${token}`,
  ACCEPT: (token: string) => `/api/invitations/${token}/accept`,
  // Invitations reçues par l'utilisateur courant (bannière d'approbation in-app, sans token)
  MINE: () => `/api/invitations/mine`,
  MINE_ACCEPT: (invitationId: number) => `/api/invitations/mine/${invitationId}/accept`,
} as const;

/**
 * Routes profils de compétences (Smart Assign)
 * Backend: MemberSkillController
 */
export const SKILL_ROUTES = {
  /** Tous les profils de compétences du workspace */
  LIST:   (slug: string) => `/api/workspaces/${slug}/skills`,
  /** Profil de compétences d'un membre (GET) / upsert (PUT) */
  MEMBER: (slug: string, userId: number) => `/api/workspaces/${slug}/members/${userId}/skills`,
  /** Suggestion IA de tags de compétences à partir d'un rôle (onboarding). */
  SUGGESTIONS: (slug: string) => `/api/workspaces/${slug}/skills/suggestions`,
} as const;

/**
 * Routes disponibilité / congés (US-006)
 * Backend: MemberLeaveController @RequestMapping("/api/workspaces/{slug}/members/{userId}/leaves")
 */
export const AVAILABILITY_ROUTES = {
  /** Congés d'un membre (GET liste / POST création) */
  LEAVES: (slug: string, userId: number) => `/api/workspaces/${slug}/members/${userId}/leaves`,
  /** Un congé précis (DELETE) */
  LEAVE:  (slug: string, userId: number, leaveId: number) => `/api/workspaces/${slug}/members/${userId}/leaves/${leaveId}`,
} as const;

/**
 * Routes projets
 * Backend: @RequestMapping("/api/workspaces/{slug}/projects")
 */
export const PROJECT_ROUTES = {
  LIST:    (slug: string) => `/api/workspaces/${slug}/projects`,
  CREATE:  (slug: string) => `/api/workspaces/${slug}/projects`,
  /** Santé des opérations jour par jour (courbe du KPI « At risk ») */
  HEALTH_HISTORY: (slug: string) => `/api/workspaces/${slug}/projects/health-history`,
  /** Activité de tous les projets visibles en un appel (sparklines de la page Operations) */
  ALL_ACTIVITY:   (slug: string) => `/api/workspaces/${slug}/projects/activity`,
  BY_ID:   (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}`,
  /** Export COMPLET du projet (JSON/CSV) - issues + descriptions + commentaires + activité (P1b bêta). */
  EXPORT:  (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}/export`,
  UPDATE:  (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}`,
  ARCHIVE: (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}/archive`,
  FAVORITE: (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}/favorite`,
  DELETE:  (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}`,
  MEMBERS: (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}/members`,
  MEMBER:  (slug: string, id: number, memberId: number) => `/api/workspaces/${slug}/projects/${id}/members/${memberId}`,
  LABELS:  (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}/labels`,
  LABEL:   (slug: string, id: number, labelId: number) => `/api/workspaces/${slug}/projects/${id}/labels/${labelId}`,
  // Équipes associées (PROD-3.6b)
  TEAMS:   (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}/teams`,
  TEAM:    (slug: string, id: number, teamId: number) => `/api/workspaces/${slug}/projects/${id}/teams/${teamId}`,
  // Activité quotidienne (QA2-32)
  ACTIVITY: (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}/activity`,
} as const;

/**
 * Routes issues
 * Backend: /api/workspaces/{slug}/projects/{projectId}/issues
 */
export const ISSUE_ROUTES = {
  /** Vue My Work - issues assignées à l'utilisateur, tous projets du workspace */
  MY_ISSUES: (slug: string) => `/api/workspaces/${slug}/my-issues`,
  /** Vue My Work - cycles de tous les projets visibles, en un appel (évite un appel par projet) */
  MY_CYCLES: (slug: string) => `/api/workspaces/${slug}/my-cycles`,
  /** Vue My Work - pages récentes de tous les projets visibles, en un appel */
  MY_PAGES:  (slug: string) => `/api/workspaces/${slug}/my-pages`,
  LIST:    (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues`,
  /** Liste paginée pour l'infinite-scroll du backlog (QA2-33) */
  PAGED:   (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/paged`,
  CREATE:  (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues`,
  BY_ID:   (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}`,
  UPDATE:  (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}`,
  DELETE:  (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}`,
  ARCHIVE:   (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/archive`,
  UNARCHIVE: (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/unarchive`,
  PIN:       (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/pin`,
  STATUSES:         (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/statuses`,
  STATUS:           (slug: string, projectId: number, statusId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/statuses/${statusId}`,
  STATUSES_REORDER: (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/statuses/reorder`,
  TYPES:            (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/types`,
  COMMENTS:         (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/comments`,
  COMMENT:          (slug: string, projectId: number, issueId: number, commentId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/comments/${commentId}`,
  ACTIVITY:         (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/activity`,
  SMART_ASSIGN:     (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/smart-assign`,
  SMART_ASSIGN_PREVIEW: (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/smart-assign/preview`,
  SMART_ASSIGN_BULK: (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/smart-assign/bulk`,
  CHILDREN:         (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/children`,
  CHECKLIST:        (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/checklist`,
  CHECKLIST_ITEM:   (slug: string, projectId: number, issueId: number, itemId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/checklist/${itemId}`,
  RELATIONS:        (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/relations`,
  RELATION:         (slug: string, projectId: number, issueId: number, relationId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/relations/${relationId}`,
  WORKLOGS:         (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/worklogs`,
  WORKLOG:          (slug: string, projectId: number, issueId: number, worklogId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/worklogs/${worklogId}`,
  /** IA - génère un brouillon spec + prompt d'exécution (human-in-the-loop, rien persisté) */
  AI_SPEC:          (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/ai/spec`,
  /** IA - approuve le brouillon → persiste un node SPEC lié à l'issue */
  AI_SPEC_APPROVE:  (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/ai/spec/approve`,
} as const;

/**
 * Routes cycles
 * Backend: /api/workspaces/{slug}/projects/{projectId}/cycles
 */
export const CYCLE_ROUTES = {
  LIST:         (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/cycles`,
  CREATE:       (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/cycles`,
  BY_ID:        (slug: string, projectId: number, cycleId: number) => `/api/workspaces/${slug}/projects/${projectId}/cycles/${cycleId}`,
  UPDATE:       (slug: string, projectId: number, cycleId: number) => `/api/workspaces/${slug}/projects/${projectId}/cycles/${cycleId}`,
  DELETE:       (slug: string, projectId: number, cycleId: number) => `/api/workspaces/${slug}/projects/${projectId}/cycles/${cycleId}`,
  ISSUES:       (slug: string, projectId: number, cycleId: number) => `/api/workspaces/${slug}/projects/${projectId}/cycles/${cycleId}/issues`,
  ISSUE:        (slug: string, projectId: number, cycleId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/cycles/${cycleId}/issues/${issueId}`,
  // Reverse-lookup : cycles auxquels une issue est rattachée (sélecteur du sheet - CYC-03b).
  FOR_ISSUE:    (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/cycles`,
} as const;

/**
 * Routes analytics
 * Backend: /api/workspaces/{slug}/analytics
 */
export const ANALYTICS_ROUTES = {
  KPIS:       (slug: string) => `/api/workspaces/${slug}/analytics/kpis`,
  THROUGHPUT: (slug: string) => `/api/workspaces/${slug}/analytics/throughput`,
  BURNDOWN:   (slug: string) => `/api/workspaces/${slug}/analytics/burndown`,
  CAPACITY:   (slug: string) => `/api/workspaces/${slug}/analytics/capacity`,
  INSIGHTS:   (slug: string) => `/api/workspaces/${slug}/analytics/insights`,
  /** Heatmap charge équipe (US-022) : membre × jour, sur N jours */
  WORKLOAD:   (slug: string) => `/api/workspaces/${slug}/analytics/workload`,
  /** Génération de graphe par l'IA (langage naturel → spec rendue depuis les vraies séries) */
  CHART:      (slug: string) => `/api/workspaces/${slug}/analytics/chart`,
  /** Ré-exécution d'une répartition « X par Y » (rafraîchit un graphe épinglé) */
  BREAKDOWN:  (slug: string) => `/api/workspaces/${slug}/analytics/breakdown`,
  /** Graphes épinglés « Custom » (GET liste / POST épingler) */
  SAVED_CHARTS: (slug: string) => `/api/workspaces/${slug}/analytics/charts`,
  SAVED_CHART:  (slug: string, id: number) => `/api/workspaces/${slug}/analytics/charts/${id}`,
} as const;

/**
 * Cartes de dashboard épinglées - par utilisateur et par workspace.
 * Backend: @RequestMapping("/api/workspaces/{slug}/dashboard-cards")
 */
export const DASHBOARD_CARD_ROUTES = {
  /** Liste triée par position (le premier GET bootstrape les 4 cartes par défaut) / POST création */
  LIST:    (slug: string) => `/api/workspaces/${slug}/dashboard-cards`,
  CREATE:  (slug: string) => `/api/workspaces/${slug}/dashboard-cards`,
  UPDATE:  (slug: string, id: number) => `/api/workspaces/${slug}/dashboard-cards/${id}`,
  /** PUT { orderedIds } - réécrit les positions 0..n dans cet ordre */
  REORDER: (slug: string) => `/api/workspaces/${slug}/dashboard-cards/reorder`,
  DELETE:  (slug: string, id: number) => `/api/workspaces/${slug}/dashboard-cards/${id}`,
} as const;

/**
 * Workflows d'analyse IA - async, persistés, temps réel (dock « Workflows IA »).
 * Backend: /api/workspaces/{slug}/analysis & /api/workspaces/{slug}/priorities/{id}
 */
export const ANALYSIS_ROUTES = {
  /** Lancer (POST {projectId, depth}) & lister les workflows du workspace. */
  JOBS:   (slug: string) => `/api/workspaces/${slug}/analysis`,
  JOB:    (slug: string, jobId: number) => `/api/workspaces/${slug}/analysis/${jobId}`,
  /** Répondre à une question du modèle (HITL) → reprend le workflow. */
  ANSWER: (slug: string, jobId: number) => `/api/workspaces/${slug}/analysis/${jobId}/answer`,
  /** Dernier brief persisté d'un projet (situation + risques + priorités actionnables). */
  BRIEF:  (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/brief`,
  /** Actions sur une priorité. */
  PRIORITY:         (slug: string, priorityId: number) => `/api/workspaces/${slug}/priorities/${priorityId}`,
  PRIORITY_ACCEPT:  (slug: string, priorityId: number) => `/api/workspaces/${slug}/priorities/${priorityId}/accept`,
  PRIORITY_PIN:     (slug: string, priorityId: number) => `/api/workspaces/${slug}/priorities/${priorityId}/pin`,
  PRIORITY_DISMISS: (slug: string, priorityId: number) => `/api/workspaces/${slug}/priorities/${priorityId}/dismiss`,
} as const;

/**
 * Route assistant IA (QA2-16)
 * Backend: POST /api/workspaces/{slug}/assistant (variante JSON → ApiResponse<{content}>)
 */
export const ASSISTANT_ROUTES = {
  CHAT: (slug: string) => `/api/workspaces/${slug}/assistant`,
} as const;

/**
 * Consommation IA (tokens) du workspace - mois courant + plafond du plan.
 * Backend: @RequestMapping("/api/workspaces/{slug}/ai")
 */
export const AI_ROUTES = {
  USAGE: (slug: string) => `/api/workspaces/${slug}/ai/usage`,
  CONVERSATIONS: (slug: string) => `/api/workspaces/${slug}/ai/conversations`,
  CONVERSATION: (slug: string, id: number) => `/api/workspaces/${slug}/ai/conversations/${id}`,
} as const;

/**
 * Routes notifications
 * Backend: /api/workspaces/{slug}/notifications
 */
export const NOTIFICATION_ROUTES = {
  LIST:            (slug: string) => `/api/workspaces/${slug}/notifications`,
  UNREAD_COUNT:    (slug: string) => `/api/workspaces/${slug}/notifications/unread-count`,
  MARK_READ:       (slug: string, id: number) => `/api/workspaces/${slug}/notifications/${id}/read`,
  MARK_ALL_READ:   (slug: string) => `/api/workspaces/${slug}/notifications/read-all`,
  ACKNOWLEDGE:     (slug: string, id: number) => `/api/workspaces/${slug}/notifications/${id}/acknowledge`,
  ACKNOWLEDGE_ALL: (slug: string) => `/api/workspaces/${slug}/notifications/acknowledge-all`,
  /** Réglages par événement (portée compte, pas workspace). GET + PUT. */
  PREFERENCES:     "/api/me/notification-preferences",
} as const;

/**
 * Routes profil utilisateur
 * Backend: /api/workspaces/{slug}/profile
 */
export const PROFILE_ROUTES = {
  GET: (slug: string) => `/api/workspaces/${slug}/profile`,
} as const;

/**
 * Routes pages/wiki
 * Backend: /api/workspaces/{slug}/projects/{projectId}/pages
 */
export const PAGE_ROUTES = {
  LIST:   (slug: string, projectId: string) => `/api/workspaces/${slug}/projects/${projectId}/pages`,
  CREATE: (slug: string, projectId: string) => `/api/workspaces/${slug}/projects/${projectId}/pages`,
  GET:    (slug: string, projectId: string, pageId: string) => `/api/workspaces/${slug}/projects/${projectId}/pages/${pageId}`,
  UPDATE: (slug: string, projectId: string, pageId: string) => `/api/workspaces/${slug}/projects/${projectId}/pages/${pageId}`,
  DELETE: (slug: string, projectId: string, pageId: string) => `/api/workspaces/${slug}/projects/${projectId}/pages/${pageId}`,
} as const;

/**
 * Routes teams
 * Backend: /api/workspaces/{slug}/teams
 */
export const TEAM_ROUTES = {
  LIST:           (slug: string) => `/api/workspaces/${slug}/teams`,
  CREATE:         (slug: string) => `/api/workspaces/${slug}/teams`,
  BY_ID:          (slug: string, teamId: number) => `/api/workspaces/${slug}/teams/${teamId}`,
  UPDATE:         (slug: string, teamId: number) => `/api/workspaces/${slug}/teams/${teamId}`,
  DELETE:         (slug: string, teamId: number) => `/api/workspaces/${slug}/teams/${teamId}`,
  MEMBERS:        (slug: string, teamId: number) => `/api/workspaces/${slug}/teams/${teamId}/members`,
  ADD_MEMBER:     (slug: string, teamId: number) => `/api/workspaces/${slug}/teams/${teamId}/members`,
  REMOVE_MEMBER:  (slug: string, teamId: number, userId: number) => `/api/workspaces/${slug}/teams/${teamId}/members/${userId}`,
} as const;

// Base backend pour les redirections navigateur (OAuth) - PAS pour les appels Axios.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * Routes intégrations (GitHub / Slack / Webhooks)
 * Backend: IntegrationController + WebhookController
 */
export const INTEGRATION_ROUTES = {
  GITHUB_STATUS:     (slug: string) => `/api/workspaces/${slug}/integrations/github/status`,
  GITHUB_REPOS:      (slug: string) => `/api/workspaces/${slug}/integrations/github/repos`,
  GITHUB_ISSUES:     (slug: string, repo: string) => `/api/workspaces/${slug}/integrations/github/issues?repo=${encodeURIComponent(repo)}`,
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
  /** Catalogue générique : le pool d'outils + statut de connexion */
  CATALOG:           (slug: string) => `/api/workspaces/${slug}/integrations/catalog`,
  /** Connexion générique d'un connecteur du catalogue (POST config / DELETE) */
  CONNECTOR:         (slug: string, key: string) => `/api/workspaces/${slug}/integrations/connectors/${key}`,
  /** Plane (connecteur clé API → ingestion Brain OS) */
  PLANE_STATUS:      (slug: string) => `/api/workspaces/${slug}/integrations/plane/status`,
  PLANE_CONNECT:     (slug: string) => `/api/workspaces/${slug}/integrations/plane/connect`,
  PLANE_PROJECTS:    (slug: string) => `/api/workspaces/${slug}/integrations/plane/projects`,
  PLANE_SYNC:        (slug: string, project: string) => `/api/workspaces/${slug}/integrations/plane/sync?project=${encodeURIComponent(project)}`,
  PLANE_DISCONNECT:  (slug: string) => `/api/workspaces/${slug}/integrations/plane`,
} as const;

/** Routes RGPD - droits des personnes (CERT-C11). */
export const GDPR_ROUTES = {
  EXPORT:  () => `/api/gdpr/export`,
  ACCOUNT: () => `/api/gdpr/account`,
} as const;

/**
 * Routes pièces jointes (attachments d'issue)
 * Backend: /api/workspaces/{slug}/projects/{projectId}/issues/{issueId}/attachments
 */
export const ATTACHMENT_ROUTES = {
  LIST:   (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/attachments`,
  UPLOAD: (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/attachments`,
  DELETE: (slug: string, projectId: number, issueId: number, attachmentId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/attachments/${attachmentId}`,
} as const;

/**
 * Routes roadmap (issues planifiées)
 * Backend: /api/workspaces/{slug}/roadmap
 */
export const ROADMAP_ROUTES = {
  SCHEDULED: (slug: string) => `/api/workspaces/${slug}/roadmap`,
} as const;

/**
 * Routes Brain OS (couche de connaissance / knowledge graph)
 * Backend: /api/workspaces/{slug}/brain
 */
export const BRAIN_ROUTES = {
  OVERVIEW:    (slug: string) => `/api/workspaces/${slug}/brain`,
  SEARCH:      (slug: string) => `/api/workspaces/${slug}/brain/search`,
  NODES:       (slug: string) => `/api/workspaces/${slug}/brain/nodes`,
  NODE:        (slug: string, nodeId: number) => `/api/workspaces/${slug}/brain/nodes/${nodeId}`,
  EDGES:       (slug: string) => `/api/workspaces/${slug}/brain/edges`,
  EDGE:        (slug: string, edgeId: number) => `/api/workspaces/${slug}/brain/edges/${edgeId}`,
  FILES:       (slug: string) => `/api/workspaces/${slug}/brain/files`,
} as const;

/**
 * Toutes les routes groupées (export par défaut)
 */
export const API_ROUTES = {
  AUTH: AUTH_ROUTES,
  STRIPE: STRIPE_ROUTES,
  USER: USER_ROUTES,
  WORKSPACE: WORKSPACE_ROUTES,
  ANALYTICS: ANALYTICS_ROUTES,
} as const;

export default API_ROUTES;
