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
  SELECT_PLAN: "/api/auth/select-plan",
  VERIFY_OTP: "/api/auth/verify-otp",
  RESEND_OTP: "/api/auth/resend-otp",
  FORGOT_PASSWORD: "/api/auth/forgot-password",
  RESET_PASSWORD: "/api/auth/reset-password",
  REFRESH_TOKEN: "/api/auth/refresh",
  LOGOUT: "/api/auth/logout",
} as const;

/**
 * Routes Stripe (paiements et abonnements)
 * Backend: @RequestMapping("/api/stripe")
 */
export const STRIPE_ROUTES = {
  CREATE_CHECKOUT: "/api/stripe/create-checkout",
  VERIFY_SESSION: "/api/stripe/verify-session",
  SUBSCRIPTION_INFO: "/api/stripe/subscription",
  CANCEL_SUBSCRIPTION: "/api/stripe/cancel",
  WEBHOOK: "/api/stripe/webhook",
} as const;

/**
 * Routes utilisateur (profil)
 * Backend: @RequestMapping("/api/users")
 */
export const USER_ROUTES = {
  ME: "/api/users/me",
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
  INVITE: (slug: string) => `/api/workspaces/${slug}/members/invite`,
  MEMBER_ROLE: (slug: string, memberId: number) => `/api/workspaces/${slug}/members/${memberId}/role`,
  MEMBER: (slug: string, memberId: number) => `/api/workspaces/${slug}/members/${memberId}`,
  // Rétrocompatibilité
  CURRENT: "/api/workspaces/current",
} as const;

/**
 * Routes projets
 * Backend: @RequestMapping("/api/workspaces/{slug}/projects")
 */
export const PROJECT_ROUTES = {
  LIST:    (slug: string) => `/api/workspaces/${slug}/projects`,
  CREATE:  (slug: string) => `/api/workspaces/${slug}/projects`,
  BY_ID:   (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}`,
  UPDATE:  (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}`,
  ARCHIVE: (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}/archive`,
  DELETE:  (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}`,
  MEMBERS: (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}/members`,
  MEMBER:  (slug: string, id: number, memberId: number) => `/api/workspaces/${slug}/projects/${id}/members/${memberId}`,
  LABELS:  (slug: string, id: number) => `/api/workspaces/${slug}/projects/${id}/labels`,
  LABEL:   (slug: string, id: number, labelId: number) => `/api/workspaces/${slug}/projects/${id}/labels/${labelId}`,
} as const;

/**
 * Routes issues
 * Backend: /api/workspaces/{slug}/projects/{projectId}/issues
 */
export const ISSUE_ROUTES = {
  LIST:    (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues`,
  CREATE:  (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues`,
  BY_ID:   (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}`,
  UPDATE:  (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}`,
  DELETE:  (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}`,
  STATUSES:      (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/statuses`,
  STATUS:        (slug: string, projectId: number, statusId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/statuses/${statusId}`,
  TYPES:         (slug: string, projectId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/types`,
  COMMENTS:      (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/comments`,
  COMMENT:       (slug: string, projectId: number, issueId: number, commentId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/comments/${commentId}`,
  ACTIVITY:      (slug: string, projectId: number, issueId: number) => `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/activity`,
} as const;

/**
 * Toutes les routes groupées (export par défaut)
 */
export const API_ROUTES = {
  AUTH: AUTH_ROUTES,
  STRIPE: STRIPE_ROUTES,
  USER: USER_ROUTES,
  WORKSPACE: WORKSPACE_ROUTES,
} as const;

export default API_ROUTES;
