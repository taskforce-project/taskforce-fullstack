/**
 * App desktop : l'interface tourne dans la fenêtre de la coque Electron (`desktop/`), qui lui expose
 * `window.taskforceDesktop` (cf. `desktop/src/preload.ts`). L'interface et l'API y partagent l'origine de la fenêtre
 * (proxy local de la coque) ; la session est le jeton de lancement que donne la coque ; la connexion, le mot de passe,
 * la double authentification et la suppression du compte se gèrent sur le compte TaskForce en ligne.
 */

/** Vrai dans le build desktop de l'interface (`NEXT_PUBLIC_DESKTOP=true`), figé au build comme toute `NEXT_PUBLIC_*`. */
export const IS_DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "true";

/** Fournisseur d'IA choisi sur cet ordinateur (cf. `desktop/src/ai.ts`). Un modèle vide est choisi automatiquement. */
export interface DesktopAiSettings {
  provider: "ollama" | "custom" | "off";
  baseUrl: string;
  model: string;
  modelFast: string;
  embedModel: string;
}

/** État lu chez le fournisseur : joignable ou non, modèles installés, modèles retenus. */
export interface DesktopAiState {
  configured: boolean;
  reachable: boolean;
  models: string[];
  chat: { model: string | null; model_fast: string | null; available: boolean };
  embeddings: { model: string | null; dimensions: number; available: boolean };
}

/** Réglages d'IA tels que l'écran les montre. La clé d'API n'en sort jamais : on sait seulement qu'elle existe. */
export interface DesktopAiView {
  settings: DesktopAiSettings;
  hasApiKey: boolean;
  state: DesktopAiState;
}

export type DesktopAiSaveResult = { ok: true; view: DesktopAiView } | { ok: false; error: string };

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
  /** IA de l'app : `apiKey` absente garde la clé enregistrée, `null` l'efface. */
  ai: {
    get(): Promise<DesktopAiView>;
    save(input: { settings: DesktopAiSettings; apiKey?: string | null }): Promise<DesktopAiSaveResult>;
  };
}

/** Le pont de la coque, ou `null` hors de l'app desktop (build web, rendu serveur, navigateur ordinaire). */
export function desktopBridge(): DesktopBridge | null {
  if (!IS_DESKTOP || globalThis.window === undefined) return null;
  return (globalThis.window as Window & { taskforceDesktop?: DesktopBridge }).taskforceDesktop ?? null;
}
