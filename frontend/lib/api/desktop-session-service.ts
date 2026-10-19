/**
 * Sessions de l'app desktop : l'app ouvre /auth/desktop dans le navigateur, la personne s'y connecte comme d'habitude
 * puis accepte ; la webapp demande alors à l'API l'adresse de retour de l'app (avec un code à usage unique). Les
 * réglages de sécurité listent ensuite les ordinateurs connectés et les déconnectent.
 */

import { apiClient } from "./client";
import { DESKTOP_SESSION_ROUTES } from "../config/api-routes";

/** Ce que l'app desktop a demandé : son défi PKCE, son adresse de retour sur 127.0.0.1, sa valeur `state`. */
export interface DesktopAuthorization {
  codeChallenge: string;
  redirectUri: string;
  state: string;
}

/** Ordinateur connecté à l'app desktop, tel que les réglages le montrent : jamais son jeton. */
export interface DesktopSession {
  id: number;
  name: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

/** Accord à l'app desktop : rend l'adresse vers laquelle renvoyer le navigateur. */
export async function authorizeDesktopApp(request: DesktopAuthorization): Promise<string> {
  const res = await apiClient.post<{ data: { redirectUrl: string } }>(DESKTOP_SESSION_ROUTES.AUTHORIZE, request);
  return res.data.data.redirectUrl;
}

/** Ordinateurs connectés. Appel de fond (ouverture des réglages) : jamais de toast. */
export async function listDesktopSessions(): Promise<DesktopSession[]> {
  const res = await apiClient.get<{ data: DesktopSession[] }>(DESKTOP_SESSION_ROUTES.SESSIONS, { silentError: true });
  return res.data.data ?? [];
}

/** Déconnecte cet ordinateur : l'app demandera de se reconnecter à son prochain lancement. */
export async function revokeDesktopSession(sessionId: number): Promise<void> {
  await apiClient.delete(DESKTOP_SESSION_ROUTES.SESSION(sessionId));
}
