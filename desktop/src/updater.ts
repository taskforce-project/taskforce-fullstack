import { app, dialog, Notification } from "electron";
import { autoUpdater } from "electron-updater";

import { log } from "./log";

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
  if (started || !app.isPackaged) return;
  started = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Les erreurs passent par l'événement « error », une seule ligne par échec.
  autoUpdater.logger = { info: log.info, warn: log.warn, error: () => undefined, debug: () => undefined };

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

/** Vérifie maintenant (au lancement, toutes les six heures, ou à la demande depuis les réglages). */
export async function check(): Promise<void> {
  if (!app.isPackaged) return;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // Déjà dit par l'événement « error » (hors ligne, release introuvable) : l'app continue, on réessaie plus tard.
  }
}
