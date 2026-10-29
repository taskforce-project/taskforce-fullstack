import { app, BrowserWindow, Notification } from "electron";
import { autoUpdater } from "electron-updater";

import { log } from "./log";
import { fromStore } from "./paths";
import { IDLE, reduceUpdate, type UpdateEvent, type UpdateState } from "./update-state";

/** Fréquence des vérifications pendant que l'app reste ouverte. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

let started = false;
let state: UpdateState = IDLE;

/** L'état de la mise à jour, que l'interface lit à son ouverture puis reçoit à chaque changement. */
export function updateState(): UpdateState {
  return state;
}

/** Redémarre sur la version téléchargée (bouton « Restart now » du toast) ; sans effet si rien n'est prêt. */
export function installNow(): void {
  if (state.status === "ready") autoUpdater.quitAndInstall();
}

/** Applique un événement d'`electron-updater` et, s'il change ce qu'il y a à montrer, l'envoie à chaque fenêtre. */
function apply(event: UpdateEvent): void {
  const next = reduceUpdate(state, event);
  if (!next) return;
  state = next;
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("desktop:update-state", state);
}

/**
 * Mises à jour, comme Claude Desktop : vérifiées au lancement puis toutes les six heures, téléchargées en arrière-plan,
 * installées à la fermeture de l'app ; la personne peut aussi redémarrer tout de suite. La source est la release
 * `desktop-latest` du dépôt (cf. electron-builder.yml), qui porte toujours la dernière version desktop : les autres
 * releases du dépôt (backend, site...) ne s'y mélangent pas. Les migrations de la base s'appliquent au redémarrage.
 *
 * L'interface montre l'avancement dans un toast qui reste, puis « Restart now » (cf. update-state.ts) : plus de boîte
 * de dialogue du système. La notification du système ne sert que si la fenêtre n'est pas au premier plan.
 */
export function startUpdater(): void {
  // Version du Microsoft Store : le Store installe ses mises à jour, l'app ne les cherche pas elle-même (ses règles
  // l'interdisent, et l'installeur de `desktop-latest` ne remplacerait pas un paquet).
  if (started || !app.isPackaged || fromStore()) return;
  started = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Téléchargement complet, directement : la mise à jour différentielle échouait toujours avant d'y revenir, car
  // `desktop-latest` ne garde que les fichiers de la dernière version (plus la carte de blocs de la précédente) et
  // GitHub refuse les requêtes à plusieurs plages. L'installeur n'est pas un installeur web.
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.disableWebInstaller = true;
  // Les erreurs passent par l'événement « error », une seule ligne par échec.
  autoUpdater.logger = { info: log.info, warn: log.warn, error: () => undefined, debug: () => undefined };

  // Avancement noté par quart dans le journal ; l'interface, elle, le reçoit au pourcent.
  let quarter = 0;
  autoUpdater.on("update-available", (info) => {
    quarter = 0;
    apply({ kind: "available", version: info.version });
  });
  autoUpdater.on("download-progress", (progress) => {
    const reached = Math.floor(progress.percent / 25);
    if (reached > quarter && reached < 4) {
      quarter = reached;
      log.info(`Downloading the update: ${reached * 25}%`);
    }
    apply({ kind: "progress", percent: progress.percent });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info(`Update ${info.version} downloaded`);
    apply({ kind: "downloaded", version: info.version });
    if (Notification.isSupported() && !BrowserWindow.getFocusedWindow()) {
      new Notification({
        title: `TaskForce ${info.version} is ready`,
        body: "Restart TaskForce to use it. It also installs when you quit.",
      }).show();
    }
  });
  autoUpdater.on("error", (error) => {
    log.warn(`Update check failed: ${error.message}`);
    apply({ kind: "error", message: error.message });
  });

  void check();
  setInterval(() => void check(), CHECK_EVERY_MS).unref();
}

/**
 * Résultat d'une vérification, pour les réglages : à jour, nouvelle version en cours de téléchargement (le toast en
 * montre l'avancement), déjà téléchargée (prête au redémarrage), vérification impossible (hors ligne), app lancée depuis
 * les sources (pas de mises à jour), ou version du Microsoft Store (mises à jour par le Store).
 */
export type UpdateCheck =
  | { status: "up-to-date" | "downloading" | "ready"; version: string }
  | { status: "unavailable" | "development" | "store" };

/** Vérifie maintenant (au lancement, toutes les six heures, ou à la demande depuis les réglages). */
export async function check(): Promise<UpdateCheck> {
  if (fromStore()) return { status: "store" };
  if (!app.isPackaged) return { status: "development" };
  if (state.status === "ready") return { status: "ready", version: state.version };
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result?.isUpdateAvailable) return { status: "downloading", version: result.updateInfo.version };
    return { status: "up-to-date", version: app.getVersion() };
  } catch {
    // Déjà dit par l'événement « error » (hors ligne, release introuvable) : l'app continue, on réessaie plus tard.
    return { status: "unavailable" };
  }
}
