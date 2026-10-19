import type { BrowserWindowConstructorOptions, TitleBarOverlayOptions } from "electron";

/**
 * Fenêtres sans barre de titre ni menu du système, comme Claude Desktop : l'interface dessine le haut de la fenêtre, les
 * boutons du système (réduire, agrandir, fermer) s'y superposent à droite sur un fond transparent, et Windows 11
 * arrondit les coins. macOS garde son cadre tant qu'il n'y a pas de build mac.
 */

/** Haut de la fenêtre principale : la marge de 8 px au-dessus du contenu, puis sa barre de 56 px. */
export const MAIN_TITLE_BAR_HEIGHT = 64;
/** Haut de l'écran de connexion, où se posent les boutons du système. */
export const SIGNIN_TITLE_BAR_HEIGHT = 44;

export function integratedTitleBar(platform: NodeJS.Platform): boolean {
  return platform === "win32" || platform === "linux";
}

/** Boutons du système sur fond transparent, de la couleur du texte du thème de l'interface. */
export function titleBarOverlay(dark: boolean, height: number): TitleBarOverlayOptions {
  return { color: "#00000000", symbolColor: dark ? "#f3f2f0" : "#191715", height };
}

/** Hauteur demandée par la page, bornée ; à défaut celle de la fenêtre principale. */
export function titleBarHeight(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 32 && value <= 96
    ? Math.round(value)
    : MAIN_TITLE_BAR_HEIGHT;
}

export function titleBarOptions(platform: NodeJS.Platform, dark: boolean, height: number): Partial<BrowserWindowConstructorOptions> {
  if (!integratedTitleBar(platform)) return {};
  return { titleBarStyle: "hidden", titleBarOverlay: titleBarOverlay(dark, height) };
}
