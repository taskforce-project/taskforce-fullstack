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
 * Toutes les routes groupées (export par défaut)
 */
export const API_ROUTES = {
  AUTH: AUTH_ROUTES,
  STRIPE: STRIPE_ROUTES,
  USER: USER_ROUTES,
  WORKSPACE: WORKSPACE_ROUTES,
} as const;

export default API_ROUTES;
