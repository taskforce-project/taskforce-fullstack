import { app, BrowserWindow, Notification } from "electron";
import { autoUpdater, BaseUpdater } from "electron-updater";

import { launchInstaller, waitUntil } from "./installer-launch";
import { log } from "./log";
import { fromStore } from "./paths";
import { pendingOutcome, releaseUpdateScreen, savePending, takePending, updateScreenIsUp } from "./update-pending";
import { IDLE, reduceUpdate, restartBy, type UpdateEvent, type UpdateState } from "./update-state";

/** Fréquence des vérifications pendant que l'app reste ouverte. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** Les arguments de l'installeur pour « Restart now » : mise à jour, sans fenêtre système, l'app rouverte à la fin. */
const INSTALLER_ARGS = ["--updated", "/S", "--force-run"] as const;

/** L'installeur met quelques secondes à montrer sa fenêtre ; passé ce délai, l'app part quand même. */
const HANDOVER_MS = 20_000;

let started = false;
let state: UpdateState = IDLE;
/** L'installeur téléchargé, connu à la fin du téléchargement. */
let installerFile: string | null = null;
/** Une installation est partie (« Restart now ») : un second clic ne la relance pas. */
let installing = false;
/** La version qui n'a pas pris au dernier arrêt (cf. update-pending.ts) : son toast le dit. */
let notInstalled: string | null = null;

/** L'état de la mise à jour, que l'interface lit à son ouverture puis reçoit à chaque changement. */
export function updateState(): UpdateState {
  if (state.status !== "installed") return state;
  // Une nouvelle version ne se dit qu'une fois, même si la fenêtre se recharge.
  const installed = state;
  state = IDLE;
  return installed;
}

/** Premier lancement d'une nouvelle version : la fenêtre le dira à son ouverture. */
export function announceInstalled(notice: { version: string; from: string }): void {
  state = { status: "installed", version: notice.version, from: notice.from };
}

/** La fenêtre de l'installeur ne part qu'une fois celle de l'app à l'écran (cf. update-pending.ts, installer.nsh). */
export function releaseUpdateScreenOnFirstWindow(): void {
  if (process.platform !== "win32" || fromStore()) return;
  const release = () => releaseUpdateScreen(app.getPath("userData"));
  app.once("browser-window-created", (_event, window) => {
    if (window.isVisible()) release();
    else window.once("show", release);
  });
}

/** Note la mise à jour qui s'installe en quittant ; une note impossible n'empêche pas l'installation. */
function notePending(version: string): void {
  try {
    savePending(app.getPath("userData"), { version, from: app.getVersion() });
  } catch (error) {
    log.warn(`Update note not written: ${(error as Error).message}`);
  }
}

/**
 * Windows : l'installeur part d'un fil à part, sans fenêtre système, et l'écran de la mise à jour reste jusqu'à ce que la
 * fenêtre de l'installeur l'ait remplacé, au même endroit et aux mêmes couleurs (cf. installer.nsh). electron-updater ne
 * le lance pas lui-même : il le ferait du fil principal (cf. installer-launch.ts). Il ne faut donc plus qu'il en lance un
 * autre à la fermeture.
 */
async function installWithScreen(version: string): Promise<void> {
  const userData = app.getPath("userData");
  try {
    if (!installerFile) throw new Error("no installer downloaded");
    releaseUpdateScreen(userData);
    autoUpdater.autoInstallOnAppQuit = false;
    await launchInstaller(installerFile, INSTALLER_ARGS);
  } catch (error) {
    log.warn(`Update ${version} did not start (${(error as Error).message}): TaskForce opens again on ${app.getVersion()}`);
    app.relaunch();
    return;
  }
  if (!(await waitUntil(() => updateScreenIsUp(userData), HANDOVER_MS))) {
    log.warn(`The installer of ${version} did not show its window in time`);
  }
}

/** Linux : l'installeur remplace le paquet sans rien montrer, une notification le dit. */
function installWithNotice(version: string): void {
  if (Notification.isSupported()) {
    new Notification({ title: `Installing TaskForce ${version}`, body: "TaskForce opens again by itself when it's done." }).show();
  }
  // `install(isSilent, isForceRunAfter)` lance l'installeur et rend la main sans quitter. Il marque d'abord l'installation
  // comme partie (`quitAndInstallCalled`), même si l'installeur ne part pas : à la fermeture, electron-updater n'en lance
  // pas une autre, qui fermerait l'app relancée ci-dessous ; sans installeur téléchargé, il n'aurait rien à lancer.
  if (!(autoUpdater instanceof BaseUpdater && autoUpdater.install(true, true))) {
    log.warn(`Update ${version} did not start: TaskForce opens again on ${app.getVersion()}`);
    app.relaunch();
  }
}

/**
 * « Restart now » : installe la version téléchargée sans fenêtre système, puis rouvre l'app. Le CEO, le 05/11/2026, devant
 * « TaskForce Setup, Installing, please wait... » : « c'est une fenêtre système Windows, c'est naze ». `prepare` montre
 * l'écran de la mise à jour, aux couleurs de l'app, et arrête la pile proprement : l'installeur, lui, ferme de force tout
 * ce qui tourne encore depuis le dossier de l'app. Puis l'installeur part avec `--force-run`, qui rouvre l'app à la fin,
 * et l'app quitte. Un échec se dit à l'écran quand il y en a un, sinon la note du lancement suivant le dit (cf.
 * update-pending.ts).
 */
export async function installNow(prepare: (version: string) => Promise<void>): Promise<void> {
  if (state.status !== "ready" || installing) return;
  installing = true;
  const { version } = state;
  log.info(`Installing ${version}`);
  await prepare(version).catch((error: Error) => log.warn(`Update screen or stop failed: ${error.message}`));
  notePending(version);
  if (process.platform === "win32") await installWithScreen(version);
  else installWithNotice(version);
  app.quit();
}

/**
 * Redémarre l'app (déconnexion, session fermée en ligne) : par la mise à jour quand une version est prête, l'installeur
 * rouvrant l'app à la fin, sinon par une simple relance (cf. `restartBy`).
 */
export async function restartApp(prepare: (version: string) => Promise<void>): Promise<void> {
  if (restartBy(state) === "update") return installNow(prepare);
  app.relaunch();
  app.quit();
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
 * de dialogue du système. La notification du système ne sert que si la fenêtre n'est pas au premier plan. À la fermeture,
 * l'installeur tourne sans fenêtre, c'est ce que fait `autoInstallOnAppQuit` (sans rouvrir l'app) ; au redémarrage, cf.
 * `installNow`.
 */
export function startUpdater(): void {
  // Version du Microsoft Store : le Store installe ses mises à jour, l'app ne les cherche pas elle-même (ses règles
  // l'interdisent, et l'installeur de `desktop-latest` ne remplacerait pas un paquet).
  if (started || !app.isPackaged || fromStore()) return;
  started = true;
  // L'installation partie au dernier arrêt a-t-elle pris ? L'installeur ne le dit plus : l'app le note dans son journal,
  // et le toast de la version prête le dit si elle n'a pas pris.
  const pending = takePending(app.getPath("userData"));
  const outcome = pendingOutcome(pending, app.getVersion());
  if (pending && outcome === "installed") log.info(`Update ${pending.version} installed`);
  if (pending && outcome === "not-installed") {
    log.warn(`Update ${pending.version} did not install: TaskForce is still on ${pending.from}`);
    notInstalled = pending.version;
  }
  // Une version prête s'installe aussi quand la personne quitte : notée de même. electron-updater écoute « quit » après
  // nous (il s'y inscrit au premier téléchargement), et n'installe qu'en sortie normale.
  app.on("quit", (_event, exitCode) => {
    if (state.status === "ready" && !installing && exitCode === 0) notePending(state.version);
  });
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
    installerFile = info.downloadedFile;
    apply({ kind: "downloaded", version: info.version, retry: info.version === notInstalled });
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
