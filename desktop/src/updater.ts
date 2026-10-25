import { app, dialog, Notification } from "electron";
import { autoUpdater } from "electron-updater";

import { log } from "./log";
import { fromStore } from "./paths";

/** Fréquence des vérifications pendant que l'app reste ouverte. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

let started = false;

/**
 * Mises à jour, comme Claude Desktop : vérifiées au lancement puis toutes les six heures, téléchargées en arrière-plan,
 * installées à la fermeture de l'app ; la personne peut aussi redémarrer tout de suite. La source est la release
 * `desktop-latest` du dépôt (cf. electron-builder.yml), qui porte toujours la dernière version desktop : les autres
 * releases du dépôt (backend, site...) ne s'y mélangent pas. Les migrations de la base s'appliquent au redémarrage.
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

  // Avancement noté par quart : un téléchargement de près de 300 Mo prend quelques minutes, le journal dit où il en est.
  let quarter = 0;
  autoUpdater.on("update-available", () => (quarter = 0));
  autoUpdater.on("download-progress", (progress) => {
    const reached = Math.floor(progress.percent / 25);
    if (reached > quarter && reached < 4) {
      quarter = reached;
      log.info(`Downloading the update: ${reached * 25}%`);
    }
  });

  autoUpdater.on("update-downloaded", async (info) => {
    log.info(`Update ${info.version} downloaded`);
    if (Notification.isSupported()) {
      new Notification({
        title: `TaskForce ${info.version} is ready`,
        body: "It installs when you quit TaskForce.",
      }).show();
    }
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 1,
      cancelId: 1,
      message: `TaskForce ${info.version} is ready`,
      detail: "Restart now to use it, or it installs when you quit TaskForce.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", (error) => log.warn(`Update check failed: ${error.message}`));

  void check();
  setInterval(() => void check(), CHECK_EVERY_MS).unref();
}

/**
 * Résultat d'une vérification, pour les réglages : à jour, nouvelle version en cours de téléchargement (installée à la
 * fermeture), vérification impossible (hors ligne), app lancée depuis les sources (pas de mises à jour), ou version du
 * Microsoft Store (mises à jour par le Store).
 */
export type UpdateCheck =
  | { status: "up-to-date" | "downloading"; version: string }
  | { status: "unavailable" | "development" | "store" };

/** Vérifie maintenant (au lancement, toutes les six heures, ou à la demande depuis les réglages). */
export async function check(): Promise<UpdateCheck> {
  if (fromStore()) return { status: "store" };
  if (!app.isPackaged) return { status: "development" };
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result?.isUpdateAvailable) return { status: "downloading", version: result.updateInfo.version };
    return { status: "up-to-date", version: app.getVersion() };
  } catch {
    // Déjà dit par l'événement « error » (hors ligne, release introuvable) : l'app continue, on réessaie plus tard.
    return { status: "unavailable" };
  }
}
