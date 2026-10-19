/**
 * App desktop : l'interface tourne dans la fenêtre de la coque Electron (`desktop/`), qui lui expose
 * `window.taskforceDesktop` (cf. `desktop/src/preload.ts`). L'interface et l'API y partagent l'origine de la fenêtre
 * (proxy local de la coque) ; la session est le jeton de lancement que donne la coque ; la connexion, le mot de passe,
 * la double authentification et la suppression du compte se gèrent sur le compte TaskForce en ligne.
 */

/** Vrai dans le build desktop de l'interface (`NEXT_PUBLIC_DESKTOP=true`), figé au build comme toute `NEXT_PUBLIC_*`. */
export const IS_DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "true";

/** Ce que la coque expose à la fenêtre de l'app. */
export interface DesktopBridge {
  /** Jeton de la session de l'app, valable tant qu'elle reste ouverte. */
  readonly launchToken: string;
  readonly version: string;
  readonly platform: string;
  readonly email: string;
  /** Déconnecte le compte de cet ordinateur : la coque oublie la session et rouvre l'écran de connexion. */
  signOut(): Promise<void>;
  /** Ouvre le compte TaskForce en ligne (mot de passe, double authentification, suppression) dans le navigateur. */
  openAccountPage(): Promise<void>;
  checkForUpdates(): Promise<void>;
}

/** Le pont de la coque, ou `null` hors de l'app desktop (build web, rendu serveur, navigateur ordinaire). */
export function desktopBridge(): DesktopBridge | null {
  if (!IS_DESKTOP || globalThis.window === undefined) return null;
  return (globalThis.window as Window & { taskforceDesktop?: DesktopBridge }).taskforceDesktop ?? null;
}
