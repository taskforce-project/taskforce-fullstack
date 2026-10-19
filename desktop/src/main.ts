import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { join } from "node:path";

import { accountPageUrl, ISSUER, refresh, revoke, signIn, signInError } from "./account";
import { initLog, log } from "./log";
import { appLogDir } from "./paths";
import { settings, type Account } from "./settings";
import { startStack, type Stack } from "./stack";
import { check, startUpdater } from "./updater";

/**
 * Coque de l'app desktop : connexion au compte TaskForce, puis base, backend et interface sur la machine, dans une
 * fenêtre. Une seule instance : relancer l'app ramène la fenêtre ouverte.
 */

let stack: Stack | null = null;
let mainWindow: BrowserWindow | null = null;
let quitting = false;

const staticPage = (name: string): string => join(__dirname, "..", "static", name);

// Développement : `TF_DESKTOP_USER_DATA` isole les réglages et les données d'essai de ceux de l'app installée.
if (!app.isPackaged && process.env.TF_DESKTOP_USER_DATA) app.setPath("userData", process.env.TF_DESKTOP_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(main).catch(fatal);
}

async function main(): Promise<void> {
  initLog(appLogDir());
  log.info(`TaskForce ${app.getVersion()} starting (${process.platform}, Electron ${process.versions.electron})`);
  Menu.setApplicationMenu(buildMenu());
  registerIpc();

  // Un compte connecté par un autre service de comptes (développement, changement d'adresse) demande une reconnexion.
  let account = settings.account();
  if (account?.issuer !== ISSUER) account = undefined;
  let signInWin: BrowserWindow | null = null;
  if (!account) {
    ({ account, window: signInWin } = await signInWindow());
  } else {
    void refreshAccount(account);
  }
  await openApp(account, signInWin);
  startUpdater();
}

/** Renouvelle la session en ligne et relit le compte ; hors ligne, l'app continue avec le compte connu. */
async function refreshAccount(account: Account): Promise<void> {
  const refreshToken = settings.secret(account.subject, "refreshToken");
  if (!refreshToken) return;
  try {
    const result = await refresh(refreshToken);
    if (result.account.subject !== account.subject) return;
    settings.setAccount(result.account);
    settings.setSecret(account.subject, "refreshToken", result.refreshToken);
  } catch (error) {
    log.warn(`Session not refreshed (offline or expired): ${(error as Error).message}`);
  }
}

/** Écran de connexion : se résout une fois le compte connecté, la fenêtre encore ouverte (cf. `openApp`). */
function signInWindow(): Promise<{ account: Account; window: BrowserWindow }> {
  return new Promise((resolve) => {
    const window = new BrowserWindow({
      width: 460,
      height: 520,
      resizable: false,
      title: "Sign in to TaskForce",
      backgroundColor: "#fbfbfc",
      webPreferences: { preload: join(__dirname, "signin-preload.js"), contextIsolation: true, sandbox: true },
    });
    lockNavigation(window, null);
    void window.loadFile(staticPage("signin.html"));

    ipcMain.removeHandler("signin:start");
    ipcMain.handle("signin:start", async (_event, signUp: boolean) => {
      try {
        const result = await signIn(openBrowser, signUp);
        settings.setAccount(result.account);
        settings.setSecret(result.account.subject, "refreshToken", result.refreshToken);
        log.info("Signed in");
        resolve({ account: result.account, window });
        return { ok: true };
      } catch (error) {
        log.warn(`Sign-in failed: ${(error as Error).message}`);
        return { ok: false, error: signInError((error as Error).message) };
      }
    });
    window.on("closed", () => {
      if (!settings.account()) app.quit();
    });
  });
}

/**
 * Ouvre la page de connexion dans le navigateur par défaut. En développement, `TF_DESKTOP_SIGNIN_IN_LOG=1` l'écrit
 * seulement dans le journal, pour la suivre dans un autre navigateur (tests de bout en bout).
 */
function openBrowser(url: string): Promise<void> {
  if (!app.isPackaged && process.env.TF_DESKTOP_SIGNIN_IN_LOG === "1") {
    log.info(`Sign-in page: ${url}`);
    return Promise.resolve();
  }
  return shell.openExternal(url);
}

function splashWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: "#fbfbfc",
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  void window.loadFile(staticPage("splash.html"));
  window.once("ready-to-show", () => window.show());
  return window;
}

/**
 * Démarre la pile du compte derrière l'écran d'attente, puis ouvre la fenêtre de l'app. La fenêtre précédente (connexion)
 * se ferme une fois l'écran d'attente affiché : l'app n'a jamais zéro fenêtre, ce qui la ferait quitter.
 */
async function openApp(account: Account, previous: BrowserWindow | null): Promise<void> {
  const splash = splashWindow();
  if (previous) splash.once("show", () => previous.close());
  const step = (text: string) => {
    if (!splash.isDestroyed()) void splash.loadFile(staticPage("splash.html"), { hash: "step=" + encodeURIComponent(text) });
  };
  try {
    stack = await startStack(account, step);
  } catch (error) {
    log.error(`Start failed: ${(error as Error).stack ?? error}`);
    // Le message d'abord : fermer l'écran d'attente avant lui laisserait l'app sans fenêtre, et elle quitterait.
    quitting = true;
    if (!splash.isDestroyed()) splash.hide();
    const { response } = await dialog.showMessageBox({
      type: "error",
      buttons: ["Open logs", "Quit"],
      defaultId: 1,
      message: "TaskForce could not start",
      detail: (error as Error).message,
    });
    if (response === 0) await shell.openPath(appLogDir());
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "TaskForce",
    backgroundColor: "#fbfbfc",
    webPreferences: { preload: join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  lockNavigation(mainWindow, stack.origin);
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (!splash.isDestroyed()) splash.close();
  });
  mainWindow.on("closed", () => (mainWindow = null));
  await mainWindow.loadURL(stack.origin);
}

/**
 * La fenêtre ne quitte jamais l'app : un lien interne ouvert « dans un nouvel onglet » s'ouvre dans la fenêtre, les
 * liens externes (http, https, mailto) et les fichiers (téléchargements, aperçus) dans le navigateur ; le reste est
 * refusé.
 */
function lockNavigation(window: BrowserWindow, origin: string | null): void {
  const external = (url: string) => {
    if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
  };
  const internal = (url: string) => origin !== null && (url === origin || url.startsWith(origin + "/"));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (internal(url) && !url.startsWith(origin + "/api/")) void window.loadURL(url);
    else external(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (internal(url)) return;
    event.preventDefault();
    external(url);
  });
}

function registerIpc(): void {
  ipcMain.on("desktop:bootstrap", (event) => {
    event.returnValue = {
      launchToken: stack?.launchToken ?? "",
      version: app.getVersion(),
      platform: process.platform,
      email: stack?.account.email ?? "",
    };
  });
  ipcMain.handle("desktop:account-page", () => shell.openExternal(accountPageUrl()));
  ipcMain.handle("desktop:check-updates", () => check());
  ipcMain.handle("desktop:sign-out", async () => {
    const account = stack?.account ?? settings.account();
    if (account) {
      const refreshToken = settings.secret(account.subject, "refreshToken");
      if (refreshToken) await revoke(refreshToken).catch((error: Error) => log.warn(`Revoke failed: ${error.message}`));
    }
    settings.clearAccount();
    log.info("Signed out");
    app.relaunch();
    app.quit();
  });
}

function buildMenu(): Menu {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "togglefullscreen" },
        { type: "separator" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" as const }]),
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "Documentation", click: () => void shell.openExternal("https://docs.taskforce-project.fr") },
        { label: "Report an issue", click: () => void shell.openExternal("https://github.com/taskforce-project/taskforce-fullstack/issues") },
        { label: "Check for updates", click: () => void check() },
        { label: "Open logs folder", click: () => void shell.openPath(appLogDir()) },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

/** Arrêt propre : l'interface, le backend puis la base, avant de rendre la main au système. */
app.on("before-quit", (event) => {
  if (quitting || !stack) return;
  event.preventDefault();
  quitting = true;
  const current = stack;
  stack = null;
  log.info("Stopping");
  void current.stop().finally(() => app.quit());
});

app.on("window-all-closed", () => app.quit());

function fatal(error: unknown): void {
  log.error(`Fatal: ${(error as Error)?.stack ?? String(error)}`);
  dialog.showErrorBox("TaskForce could not start", (error as Error)?.message ?? String(error));
  app.exit(1);
}
