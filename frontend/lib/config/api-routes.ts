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
 * Routes utilisateur (profil, etc.)
 * TODO: À implémenter quand UserController sera créé
 */
// export const USER_ROUTES = {
//   PROFILE: "/api/users/profile",
//   UPDATE_PROFILE: "/api/users/profile",
//   DELETE_ACCOUNT: "/api/users/account",
// } as const;

/**
 * Toutes les routes groupées (export par défaut)
 */
export const API_ROUTES = {
  AUTH: AUTH_ROUTES,
  STRIPE: STRIPE_ROUTES,
  // USER: USER_ROUTES,
} as const;

export default API_ROUTES;
