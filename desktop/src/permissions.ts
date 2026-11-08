import type { Session } from "electron";

import { log } from "./log";

/**
 * Ce que les pages de l'app peuvent demander au navigateur. Sans ces réglages, Electron accorde tout, à toute page. Seule
 * l'origine de la fenêtre (le relais local) reçoit quelque chose : le micro, jamais la caméra (R80, R132), l'écriture dans
 * le presse-papiers (boutons « copier ») et le plein écran d'une vidéo. Le reste, que l'interface n'utilise pas, est refusé.
 */
const OWN_ORIGIN_ONLY = new Set(["clipboard-sanitized-write", "fullscreen"]);

export interface PermissionQuery {
  permission: string;
  /** Adresse de la page qui demande. */
  url: string | undefined;
  /** Origine de la fenêtre ; `null` tant que l'app n'a pas démarré. */
  appOrigin: string | null;
  /** La voix est embarquée sur ce poste (voice.ts). */
  voice: boolean;
  isMainFrame: boolean;
  /** Pour le micro : les médias demandés. */
  mediaTypes: readonly string[];
}

function originOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

export function permissionAllowed(query: PermissionQuery): boolean {
  const { permission, url, appOrigin, voice, isMainFrame, mediaTypes } = query;
  if (appOrigin === null || originOf(url) !== originOf(appOrigin)) return false;
  // La caméra ne passe jamais ; la vérification sans précision de média (« unknown ») reste possible pour l'audio.
  if (permission === "media") return voice && isMainFrame && !mediaTypes.includes("video");
  return OWN_ORIGIN_ONLY.has(permission);
}

/** Pose les deux réglages d'Electron sur la session de la fenêtre : la demande (un geste) et la vérification (un état). */
export function applyPermissions(session: Session, appOrigin: () => string | null, voice: boolean): void {
  session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const mediaTypes = "mediaTypes" in details ? details.mediaTypes ?? [] : [];
    const allowed = permissionAllowed({
      permission,
      url: details.requestingUrl,
      appOrigin: appOrigin(),
      voice,
      isMainFrame: details.isMainFrame,
      mediaTypes,
    });
    if (!allowed) log.warn(`Permission refused: ${permission}`);
    callback(allowed);
  });
  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) =>
    permissionAllowed({
      permission,
      url: details.requestingUrl ?? requestingOrigin,
      appOrigin: appOrigin(),
      voice,
      isMainFrame: details.isMainFrame ?? false,
      mediaTypes: details.mediaType ? [details.mediaType] : [],
    }));
}
