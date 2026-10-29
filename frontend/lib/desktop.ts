/**
 * App desktop : l'interface tourne dans la fenêtre de la coque Electron (`desktop/`), qui lui expose
 * `window.taskforceDesktop` (cf. `desktop/src/preload.ts`). L'interface et l'API y partagent l'origine de la fenêtre
 * (proxy local de la coque) ; la session est le jeton de lancement que donne la coque ; la connexion, le mot de passe,
 * la double authentification et la suppression du compte se gèrent sur le compte TaskForce en ligne.
 */

/** Vrai dans le build desktop de l'interface (`NEXT_PUBLIC_DESKTOP=true`), figé au build comme toute `NEXT_PUBLIC_*`. */
export const IS_DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "true";

/**
 * App desktop : la connexion de GitHub et de Slack par OAuth n'y marche pas encore (PC-060) ; on ne montre que ce qui
 * marche (R12), ni dans le catalogue ni dans la pilule de l'accueil. Masqués avec revue au 30/11/2026 ; d'ici là,
 * GitHub passe par le GitHub CLI de la personne.
 */
export const DESKTOP_HIDDEN_CONNECTORS: ReadonlySet<string> = new Set(["github", "slack"]);

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

/** Réponse d'une action de la coque : la valeur, ou le message à montrer. */
export type DesktopResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Outils de la personne pour les tâches de Claude Code (cf. `desktop/src/tools.ts`). `claude.signedIn` vaut `null`
 * quand la version installée ne sait pas le dire.
 */
export interface DesktopToolsStatus {
  claude: { installed: boolean; version: string | null; signedIn: boolean | null };
  git: { installed: boolean; version: string | null };
  github: { installed: boolean; signedIn: boolean; login: string | null };
}

/** Claude Code de la personne branché sur le serveur MCP d'un espace (mode interactif). */
export interface DesktopMcpConnection {
  connected: boolean;
  /** Il vise l'adresse actuelle de l'app ; sinon l'app a changé de port et il faut le rebrancher. */
  current: boolean;
}

/** Projet de la webapp, que l'app peut apporter sur l'ordinateur. */
export interface DesktopWebProject {
  id: number;
  name: string;
  identifier: string;
  issueCount: number;
}

/** Espace de la personne dans la webapp, avec les projets qu'elle y voit. */
export interface DesktopWebWorkspace {
  slug: string;
  name: string;
  projects: DesktopWebProject[];
}

/** Projet créé de l'autre côté ; `url` : son adresse dans la webapp, pour un projet envoyé en ligne. */
export interface DesktopMovedProject {
  id: number;
  name: string;
  workspace: string;
  url?: string;
}

/** Espace créé de l'autre côté, avec son Brain OS et ses projets ; `url` : son adresse dans la webapp. */
export interface DesktopMovedWorkspace {
  slug: string;
  name: string;
  url?: string;
}

/** Déplacement d'un projet : l'espace et le projet d'origine, l'espace qui le reçoit de l'autre côté. */
export interface DesktopProjectMove {
  workspace: string;
  projectId: number;
  target: string;
}

/** Dépôt GitHub tel que le `gh` de la personne le voit. */
export interface DesktopGitHubRepo {
  fullName: string;
  private: boolean;
  /** La personne peut y pousser une branche : condition pour que Claude Code y ouvre une pull request. */
  canPush: boolean;
}

/**
 * Vérification des mises à jour : à jour, nouvelle version en cours de téléchargement (installée à la fermeture),
 * impossible pour l'instant (hors ligne), app lancée depuis les sources, ou version du Microsoft Store (mise à jour par
 * le Store).
 */
export type DesktopUpdateCheck =
  | { status: "up-to-date" | "downloading"; version: string }
  | { status: "unavailable" | "development" | "store" };

/** Ce que la coque expose à la fenêtre de l'app. */
export interface DesktopBridge {
  /** Jeton de la session de l'app, valable tant qu'elle reste ouverte. */
  readonly launchToken: string;
  readonly version: string;
  readonly platform: string;
  readonly email: string;
  /** Compte déjà configuré sur la webapp (onboarding fait en ligne) : l'app en a repris les réglages. */
  readonly onboardedOnline?: boolean;
  /** Qui installe les mises à jour : l'app elle-même, ou le Microsoft Store pour sa version Store. Absent : l'app. */
  readonly updates?: "app" | "store";
  /** Déconnecte le compte de cet ordinateur : la coque oublie la session et rouvre l'écran de connexion. */
  signOut(): Promise<void>;
  /** Ouvre le compte TaskForce en ligne (mot de passe, double authentification, suppression) dans le navigateur. */
  openAccountPage(): Promise<void>;
  checkForUpdates(): Promise<DesktopUpdateCheck>;
  /** Ouvre le dossier des journaux de l'app (à joindre à un signalement). */
  openLogs(): Promise<void>;
  /** Ouvre le dossier des copies de la base faites avant chaque mise à jour. */
  openBackups(): Promise<void>;
  /**
   * Notification du système, montrée par la coque seulement quand la fenêtre n'est pas au premier plan ; un clic ramène
   * l'app sur `path`, une page de l'app.
   */
  notify(input: { title: string; body?: string; path?: string }): void;
  /** Page demandée par la coque (clic sur une notification du système) ; rend de quoi arrêter l'écoute. */
  onNavigate(callback: (path: string) => void): () => void;
  /**
   * Boutons du système (réduire, agrandir, fermer), posés sur la barre du haut de l'interface : couleurs du thème, et
   * hauteur de cette barre depuis le haut de la fenêtre.
   */
  setTitleBarTheme(dark: boolean, height?: number): void;
  /** IA de l'app : `apiKey` absente garde la clé enregistrée, `null` l'efface. */
  ai: {
    get(): Promise<DesktopAiView>;
    save(input: { settings: DesktopAiSettings; apiKey?: string | null }): Promise<DesktopAiSaveResult>;
  };
  tools: {
    status(): Promise<DesktopToolsStatus>;
  };
  /** GitHub par le GitHub CLI de la personne : son jeton reste dans le trousseau du système, jamais dans la page. */
  github: {
    repos(): Promise<DesktopResult<DesktopGitHubRepo[]>>;
    /** Le dépôt, ou `null` s'il n'existe pas ou que la personne n'y a pas accès. */
    repo(fullName: string): Promise<DesktopResult<DesktopGitHubRepo | null>>;
    /** Crée le dépôt (avec un README) et rend son `owner/name`. */
    createRepo(input: { name: string; private: boolean }): Promise<DesktopResult<string>>;
    /** Lance la connexion et rend le code à usage unique à saisir sur github.com. */
    signIn(): Promise<DesktopResult<string>>;
    openSignInPage(): Promise<void>;
    waitForSignIn(): Promise<{ ok: true } | { ok: false; error: string }>;
    cancelSignIn(): Promise<void>;
  };
  /**
   * Projets entre la webapp et cet ordinateur : la coque joint la webapp avec la session de l'app, qui ne passe jamais
   * par la page. Le projet est copié ; l'original reste où il était.
   */
  projects: {
    web(): Promise<DesktopResult<DesktopWebWorkspace[]>>;
    /** Copie un projet de la webapp (`workspace`, `projectId`) dans un espace de cet ordinateur (`target`). */
    bring(move: DesktopProjectMove): Promise<DesktopResult<DesktopMovedProject>>;
    /** Copie un projet de cet ordinateur dans un espace de la webapp (`target`). */
    send(move: DesktopProjectMove): Promise<DesktopResult<DesktopMovedProject>>;
    /** Copie un espace entier de la webapp (Brain OS et projets) sur cet ordinateur, comme un nouvel espace. */
    bringWorkspace(input: { workspace: string }): Promise<DesktopResult<DesktopMovedWorkspace>>;
    /** Copie un espace entier de cet ordinateur dans la webapp, comme un nouvel espace. */
    sendWorkspace(input: { workspace: string }): Promise<DesktopResult<DesktopMovedWorkspace>>;
    /** Ouvre une adresse de la webapp dans le navigateur. */
    openWeb(url: string): Promise<void>;
  };
  /** Claude Code de la personne et le serveur MCP d'un espace : le jeton personnel va de la page à `claude`. */
  claude: {
    mcpStatus(slug: string): Promise<DesktopResult<DesktopMcpConnection>>;
    connectMcp(input: { slug: string; token: string }): Promise<DesktopResult<void>>;
    disconnectMcp(slug: string): Promise<DesktopResult<void>>;
  };
}

/** Le pont de la coque, ou `null` hors de l'app desktop (build web, rendu serveur, navigateur ordinaire). */
export function desktopBridge(): DesktopBridge | null {
  if (!IS_DESKTOP || globalThis.window === undefined) return null;
  return (globalThis.window as Window & { taskforceDesktop?: DesktopBridge }).taskforceDesktop ?? null;
}

/**
 * Notification du système pour un événement reçu dans l'app desktop (la coque ne la montre que si la fenêtre n'est pas
 * au premier plan). Sans effet sur la webapp.
 */
export function notifySystem(input: { title: string; body?: string | null; path?: string | null }): void {
  desktopBridge()?.notify?.({
    title: input.title,
    ...(input.body ? { body: input.body } : {}),
    ...(input.path ? { path: input.path } : {}),
  });
}

/**
 * App desktop d'un compte déjà configuré en ligne : la personne connaît TaskForce, l'app ne lui remontre pas l'accueil
 * des nouveaux comptes (la visite guidée reste rejouable depuis Ctrl+K). Toujours faux sur la webapp.
 */
export function onboardedOnline(): boolean {
  return desktopBridge()?.onboardedOnline === true;
}
