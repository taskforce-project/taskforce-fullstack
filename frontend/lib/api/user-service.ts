/**
 * Service pour les opérations sur l'utilisateur courant.
 * Utilise l'endpoint GET/PATCH /api/users/me du backend.
 */

import { apiClient } from "./client";
import type { AuthUser } from "../auth";
import { USER_ROUTES } from "../config/api-routes";

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface UserSearchResult {
  id: number;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Récupère le profil de l'utilisateur connecté depuis le backend.
 */
export async function getMe(): Promise<AuthUser> {
  const response = await apiClient.get<{ data: AuthUser }>(USER_ROUTES.ME);
  return response.data.data;
}

/**
 * Met à jour le displayName et/ou l'avatarUrl de l'utilisateur connecté.
 */
export async function updateMe(payload: UpdateUserPayload): Promise<AuthUser> {
  const response = await apiClient.patch<{ data: AuthUser }>(USER_ROUTES.ME, payload);
  return response.data.data;
}

/**
 * Clôt le parcours d'onboarding : enregistre le rôle (optionnel) et lève le drapeau
 * {@code onboardingCompleted} côté serveur. Renvoie l'utilisateur à jour.
 */
export async function completeOnboarding(jobTitle?: string): Promise<AuthUser> {
  const response = await apiClient.post<{ data: AuthUser }>(USER_ROUTES.ONBOARDING, { jobTitle });
  return response.data.data;
}

/**
 * Recherche des utilisateurs par email ou displayName (max 10 résultats).
 */
export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  if (!q.trim()) return [];
  const response = await apiClient.get<{ data: UserSearchResult[] }>(USER_ROUTES.SEARCH(q));
  return response.data.data;
}

// ---- Sécurité (métier Keycloak : reset mot de passe + 2FA TOTP) --------------------------------

/** Déclenche l'email « réinitialiser le mot de passe » (flux Keycloak). */
export async function requestPasswordReset(): Promise<void> {
  await apiClient.post(USER_ROUTES.PASSWORD_RESET);
}

/** Indique si le 2FA (TOTP) est actif pour l'utilisateur courant. */
export async function getTwoFactorStatus(): Promise<boolean> {
  const response = await apiClient.get<{ data: boolean }>(USER_ROUTES.TWO_FACTOR);
  return response.data.data;
}

/** Déclenche l'email de configuration du 2FA (l'utilisateur scanne le QR côté Keycloak). */
export async function enableTwoFactor(): Promise<void> {
  await apiClient.post(USER_ROUTES.TWO_FACTOR_ENABLE);
}

/** Désactive le 2FA (supprime le credential TOTP). */
export async function disableTwoFactor(): Promise<void> {
  await apiClient.delete(USER_ROUTES.TWO_FACTOR);
}
