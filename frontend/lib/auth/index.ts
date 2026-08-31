/**
 * Auth utilities
 */

export * from "./register-storage";

// Types
export type PlanType = "FREE" | "BASIC" | "BUSINESS" | "ENTERPRISE";
export type PlanStatus =
  | "ACTIVE"
  | "CANCELED"
  | "PAST_DUE"
  | "TRIALING"
  | "INCOMPLETE"
  | "UNPAID";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl?: string;
  /** Rôle/intitulé déclaré à l'onboarding (nullable). */
  jobTitle?: string;
  /** Faux tant que le parcours d'onboarding n'a pas été franchi → déclenche le wizard. */
  onboardingCompleted?: boolean;
  planType: PlanType;
  planStatus?: PlanStatus;
  isActive?: boolean;
  createdAt?: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
  /** Code TOTP (2FA) - envoyé seulement au 2ᵉ passage, quand le serveur a répondu `twoFactorRequired`. */
  totp?: string;
};

export type RegisterCredentials = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  planType: string; // "FREE" | "PRO" | "PREMIUM" | "ENTERPRISE"
  // Champs optionnels pour le plan ENTERPRISE
  companyName?: string;
  phoneNumber?: string;
  enterpriseMessage?: string;
  /**
   * Jeton de vérification humaine émis à l'étape 1 et transporté jusqu'à l'appel d'inscription
   * (déclenché à l'étape 3). Facultatif côté type : le serveur peut avoir le mécanisme désactivé.
   */
  challengeToken?: string;
  /** Jeton Cloudflare Turnstile (`cf-turnstile-response`). Facultatif : le serveur peut l'avoir désactivé. */
  turnstileToken?: string;
};
