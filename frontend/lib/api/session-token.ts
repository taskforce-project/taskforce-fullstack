import { desktopBridge, IS_DESKTOP } from "@/lib/desktop";

/**
 * Jeton d'accès des appels à l'API, source unique du client HTTP, du temps réel et du journal d'erreurs : dans l'app
 * desktop, le jeton de lancement que donne la coque ; sinon celui que la connexion a posé dans le navigateur.
 */
export function getSessionToken(): string | null {
  if (globalThis.window === undefined) return null;
  if (IS_DESKTOP) return desktopBridge()?.launchToken || null;
  return localStorage.getItem("accessToken");
}
