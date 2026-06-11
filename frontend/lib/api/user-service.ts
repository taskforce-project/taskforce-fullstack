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
 * Recherche des utilisateurs par email ou displayName (max 10 résultats).
 */
export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  if (!q.trim()) return [];
  const response = await apiClient.get<{ data: UserSearchResult[] }>(USER_ROUTES.SEARCH(q));
  return response.data.data;
}
