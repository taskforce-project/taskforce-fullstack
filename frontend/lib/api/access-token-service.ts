/**
 * Jetons personnels (lot 5) : durables, révocables, utilisables seulement sur le serveur MCP de l'instance (Claude
 * Code en mode interactif, autres clients MCP). La valeur d'un jeton n'est rendue qu'à sa création.
 */

import { apiClient } from "./client";
import { ACCESS_TOKEN_ROUTES } from "../config/api-routes";

/** Jeton tel que la liste le montre : jamais sa valeur, seulement son début (`hint`). */
export interface AccessToken {
  id: number;
  name: string;
  hint: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
}

/** Réponse de création : `value` est le jeton complet, à copier tout de suite. */
export interface CreatedAccessToken {
  token: AccessToken;
  value: string;
}

/** Jetons non révoqués de la personne connectée. Appel de fond (ouverture du panneau) : jamais de toast. */
export async function listAccessTokens(): Promise<AccessToken[]> {
  const res = await apiClient.get<{ data: AccessToken[] }>(ACCESS_TOKEN_ROUTES.TOKENS, { silentError: true });
  return res.data.data ?? [];
}

/** Crée un jeton ; `expiresInDays` null = sans expiration. */
export async function createAccessToken(name: string, expiresInDays: number | null): Promise<CreatedAccessToken> {
  const res = await apiClient.post<{ data: CreatedAccessToken }>(ACCESS_TOKEN_ROUTES.TOKENS, { name, expiresInDays });
  return res.data.data;
}

/** Révoque un jeton, effet immédiat. */
export async function revokeAccessToken(tokenId: number): Promise<void> {
  await apiClient.delete(ACCESS_TOKEN_ROUTES.TOKEN(tokenId));
}
