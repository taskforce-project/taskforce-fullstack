/**
 * L'écran de la coque (static/splash.html, le même que la connexion : à gauche le panneau, à droite ce qui se passe) :
 * ce qu'il dit et où il s'ouvre. Pur, sans Electron : la coque passe l'état à la page par l'adresse.
 *
 * Le CEO, le 10/11/2026, devant la carte de la mise à jour : « c'est possible d'avoir vraiment le mm ecran que l ecran de
 * login [...] pour toute les situation [...] Juste la partie droite qui change ». Démarrage, mise à jour, déconnexion et
 * leurs échecs ont donc la fenêtre de la connexion, à la même place d'un écran à l'autre ; l'installeur dessine le même.
 */

/** Une action d'un écran d'échec. */
export type ScreenAction = "quit" | "logs" | "retry" | "signin";

const ACTIONS: readonly ScreenAction[] = ["quit", "logs", "retry", "signin"];

export function isScreenAction(value: unknown): value is ScreenAction {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

export interface ScreenState {
  /** L'étape, en quelques mots, sur une ligne : « Starting TaskForce ». */
  readonly step: string;
  /** Ce qui se passe, ou ce qu'il faut faire. */
  readonly note?: string;
  /** Un échec : ses actions, la dernière est la principale. */
  readonly actions?: readonly ScreenAction[];
  /** Le détail brut d'un échec, à un clic. */
  readonly detail?: string;
}

/** La taille de la fenêtre de chaque écran de la coque, celle de la connexion, en points. */
export const SCREEN_SIZE = { width: 1000, height: 640 } as const;

/**
 * Les phrases que l'installeur dit aussi (installer.nsh), une ligne de texte par ligne à l'écran : il les dessine une à
 * une, sans retour à la ligne de son cru.
 */
export const INSTALLING_NOTE = "It takes a minute or two.\nTaskForce opens again by itself.";
export const UPDATED_NOTE = "The update is installed.";
export const NOT_UPDATED_NOTE = "Your projects are safe.\nTaskForce opens again as it was.";

export const SCREENS = {
  starting: { step: "Starting TaskForce" },
  installing: (version: string): ScreenState => ({ step: `Installing TaskForce ${version}`, note: INSTALLING_NOTE }),
  /** Premier lancement après une mise à jour : les mots de l'installeur qui lui passe la main. */
  updated: { step: "Opening TaskForce", note: UPDATED_NOTE },
  notUpdated: (version: string): ScreenState => ({ step: `TaskForce ${version} didn't install`, note: NOT_UPDATED_NOTE }),
  signingOut: { step: "Signing out", note: "TaskForce opens the sign-in in a moment." },
  signedOut: {
    step: "You're signed out",
    note: "Your session ended, or this computer was signed out from your account settings. Sign in again to keep using TaskForce here. Your projects stay on this computer.",
    actions: ["signin"],
  },
  startFailed: (detail: string): ScreenState => ({
    step: "TaskForce could not start",
    note: "Something stopped it while it was getting ready. Try again; if it happens again, the logs say what went wrong.",
    actions: ["quit", "logs", "retry"],
    detail,
  }),
} satisfies Record<string, ScreenState | ((value: string) => ScreenState)>;

/**
 * Le premier écran d'un lancement. Juste après une mise à jour, les mots de l'installeur qui passe la main, ceux de sa
 * fenêtre à cet instant ; la version qui n'a pas pris, si l'installeur a rouvert l'ancienne. Sinon, le démarrage.
 */
export function firstScreen(update: { outcome: "installed" | "not-installed" | null; version: string } | null): ScreenState {
  if (update?.outcome === "installed") return SCREENS.updated;
  if (update?.outcome === "not-installed") return SCREENS.notUpdated(update.version);
  return SCREENS.starting;
}

/** L'adresse de la page pour un état (`#step=...`). */
export function screenHash(state: ScreenState): string {
  const params = new URLSearchParams({ step: state.step });
  if (state.note) params.set("note", state.note);
  if (state.actions?.length) params.set("actions", state.actions.join(","));
  if (state.detail) params.set("detail", state.detail);
  return params.toString();
}

/** Les mêmes mots, avec une autre ligne sous l'étape : les étapes du démarrage. */
export function withNote(state: ScreenState, note: string): ScreenState {
  return { step: state.step, note };
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}

/** Le coin d'une fenêtre de `size` centrée dans `area` (la zone de travail d'un écran), sans en sortir. */
export function centeredIn(area: Rect, size: { width: number; height: number } = SCREEN_SIZE): Point {
  return {
    x: area.x + Math.max(0, Math.round((area.width - size.width) / 2)),
    y: area.y + Math.max(0, Math.round((area.height - size.height) / 2)),
  };
}

/**
 * Relancer l'app à la même place (déconnexion, nouvel essai) : l'argument qui la donne à la prochaine instance, en
 * points. Les arguments de l'instance en cours sont repris, sans sa propre place.
 */
export const PLACE_ARG = "--tf-screen-at=";

export function relaunchArgs(current: readonly string[], place: Point | null): string[] {
  const args = current.filter((arg) => !arg.startsWith(PLACE_ARG));
  if (place) args.push(`${PLACE_ARG}${Math.round(place.x)},${Math.round(place.y)}`);
  return args;
}

/** La place donnée par l'instance d'avant, ou `null`. */
export function placeFromArgs(argv: readonly string[]): Point | null {
  const arg = argv.find((item) => item.startsWith(PLACE_ARG));
  const match = arg ? /^(-?\d+),(-?\d+)$/.exec(arg.slice(PLACE_ARG.length)) : null;
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

/**
 * La place de la fenêtre de l'installeur, qu'il écrit dans le fichier de la passation (cf. update-pending.ts) : « x y
 * largeur hauteur », en pixels de l'écran. `null` si le texte n'en est pas une.
 */
export function parseScreenRect(text: string): Rect | null {
  const match = /^\s*(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s*$/.exec(text);
  if (!match) return null;
  const [x, y, width, height] = match.slice(1).map(Number) as [number, number, number, number];
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
