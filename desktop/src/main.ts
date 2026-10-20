import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from "electron";
import { join } from "node:path";

import { ACCOUNT_SERVER, accountPageUrl, refresh, revoke, SessionEndedError, signIn, signInError } from "./account";
import { parseAiInput } from "./ai";
import { connectMcp, disconnectMcp, isPersonalToken, isWorkspaceSlug, mcpConnection } from "./claude";
import { createRepo, DEVICE_PAGE, findRepo, GitHubSignIn, isNewRepoName, isRepoFullName, listRepos } from "./github";
import { initLog, log } from "./log";
import { appLogDir } from "./paths";
import { settings, type Account } from "./settings";
import { startStack, type Stack } from "./stack";
import { toolsStatus } from "./tools";
import { check, startUpdater } from "./updater";
import {
  integratedTitleBar,
  MAIN_TITLE_BAR_HEIGHT,
  SIGNIN_TITLE_BAR_HEIGHT,
  titleBarHeight,
  titleBarOptions,
  titleBarOverlay,
} from "./window-chrome";

/**
 * Coque de l'app desktop : connexion au compte TaskForce, puis base, backend et interface sur la machine, dans une
 * fenêtre. Une seule instance : relancer l'app ramène la fenêtre ouverte.
 */

let stack: Stack | null = null;
let mainWindow: BrowserWindow | null = null;
let quitting = false;
const githubSignIn = new GitHubSignIn();

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
  if (account?.issuer !== ACCOUNT_SERVER) account = undefined;
  let signInWin: BrowserWindow | null = null;
  let refreshed: Promise<"valid" | "ended" | "offline"> = Promise.resolve("valid");
  if (!account) {
    ({ account, window: signInWin } = await signInWindow());
  } else if (!account.profile) {
    // Compte connecté par une version qui ne gardait pas les réglages du compte en ligne : on les relit avant de
    // démarrer, pour que l'app les reprenne dès ce lancement (hors ligne, elle démarre sans).
    const state = await refreshAccount(account);
    if (state === "ended") {
      await sessionEnded();
      return;
    }
    account = settings.account() ?? account;
  } else {
    refreshed = refreshAccount(account);
  }
  await openApp(account, signInWin);
  // Session fermée en ligne : traitée une fois la pile démarrée, pour qu'elle s'arrête proprement.
  if ((await refreshed) === "ended") await sessionEnded();
  startUpdater();
}

/**
 * Relit le compte en ligne et prolonge sa session ; hors ligne, l'app continue avec le compte connu. `ended` : la
 * session a été fermée en ligne (réglages de la webapp), l'app doit demander de se reconnecter.
 */
async function refreshAccount(account: Account): Promise<"valid" | "ended" | "offline"> {
  const sessionToken = settings.secret(account.subject, "sessionToken");
  if (!sessionToken) return "ended";
  try {
    const fresh = await refresh(sessionToken);
    if (fresh.subject === account.subject) settings.setAccount(fresh);
    return "valid";
  } catch (error) {
    if (error instanceof SessionEndedError) return "ended";
    log.warn(`Session not refreshed (offline): ${(error as Error).message}`);
    return "offline";
  }
}

/** Session fermée en ligne : l'app le dit, oublie le compte sur ce poste et revient à l'écran de connexion. */
async function sessionEnded(): Promise<void> {
  log.info("Session ended online: signing out of this computer");
  settings.clearAccount();
  await dialog.showMessageBox({
    type: "info",
    buttons: ["Sign in"],
    message: "You're signed out of this computer",
    detail: "Your session ended, or this computer was signed out from your account settings. Sign in again to keep using TaskForce here. Your projects stay on this computer.",
  });
  app.relaunch();
  app.quit();
}

/** Écran de connexion : se résout une fois le compte connecté, la fenêtre encore ouverte (cf. `openApp`). */
function signInWindow(): Promise<{ account: Account; window: BrowserWindow }> {
  return new Promise((resolve) => {
    // Comme la page de connexion de la webapp : la peinture et l'app à gauche, la connexion à droite.
    const dark = nativeTheme.shouldUseDarkColors;
    const window = new BrowserWindow({
      width: 1000,
      height: 640,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      title: "Sign in to TaskForce",
      backgroundColor: dark ? "#0b0e19" : "#ffffff",
      ...titleBarOptions(process.platform, dark, SIGNIN_TITLE_BAR_HEIGHT),
      webPreferences: { preload: join(__dirname, "signin-preload.js"), contextIsolation: true, sandbox: true },
    });
    window.setMenuBarVisibility(false);
    lockNavigation(window, null);
    void window.loadFile(staticPage("signin.html"));

    ipcMain.removeHandler("signin:start");
    ipcMain.handle("signin:start", async (_event, signUp: boolean) => {
      try {
        const result = await signIn(openBrowser, signUp);
        settings.setAccount(result.account);
        settings.setSecret(result.account.subject, "sessionToken", result.sessionToken);
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
    // Sans barre de titre ni boutons, mais avec le cadre du système : Windows 11 en arrondit les coins.
    ...(integratedTitleBar(process.platform) ? { titleBarStyle: "hidden" as const } : { frame: false }),
    resizable: false,
    maximizable: false,
    minimizable: false,
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
    backgroundColor: "#fbfaf9",
    // Le thème de l'interface est connu une fois la page chargée : elle l'envoie (desktop:title-bar-theme).
    ...titleBarOptions(process.platform, false, MAIN_TITLE_BAR_HEIGHT),
    webPreferences: { preload: join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  // Le menu reste pour ses raccourcis (copier, zoom, recharger) ; sa barre n'apparaît pas.
  mainWindow.setMenuBarVisibility(false);
  lockNavigation(mainWindow, stack.origin);
  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) return;
    if (previous) {
      // Après la connexion, la personne est dans son navigateur : Windows ne laisse une app revenir au premier plan que
      // si elle passe un instant au-dessus des autres fenêtres.
      mainWindow.setAlwaysOnTop(true);
      mainWindow.show();
      mainWindow.setAlwaysOnTop(false);
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
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
      // Compte déjà configuré sur la webapp : l'interface ne remontre pas l'accueil des nouveaux comptes.
      onboardedOnline: stack?.account.profile?.onboardingCompleted === true,
    };
  });
  ipcMain.handle("desktop:account-page", () => shell.openExternal(accountPageUrl()));
  // Réglages d'IA du compte : fournisseur et modèles dans les réglages, clé dans le trousseau, jamais renvoyée à la page.
  ipcMain.handle("desktop:ai-get", () => aiView());
  ipcMain.handle("desktop:ai-save", async (_event, input: unknown) => {
    if (!stack) return { ok: false, error: "TaskForce is still starting" };
    try {
      const { settings: next, apiKey } = parseAiInput(input);
      settings.setAiSettings(stack.account.subject, next);
      if (apiKey !== undefined) settings.setSecret(stack.account.subject, "aiApiKey", apiKey || undefined);
      stack.ai.invalidate();
      return { ok: true, view: await aiView() };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });
  ipcMain.handle("desktop:check-updates", () => check());
  ipcMain.handle("desktop:open-logs", () => shell.openPath(appLogDir()));
  // Boutons du système aux couleurs du thème de l'interface (clair ou sombre), à la hauteur de la barre qu'elle dessine.
  ipcMain.on("desktop:title-bar-theme", (event, input: unknown) => {
    const { dark, height } = (input ?? {}) as { dark?: unknown; height?: unknown };
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && typeof dark === "boolean" && integratedTitleBar(process.platform)) {
      window.setTitleBarOverlay(titleBarOverlay(dark, titleBarHeight(height)));
    }
  });
  // Outils de la personne pour les tâches de Claude Code : Claude Code, git et GitHub CLI, installés et connectés ?
  ipcMain.handle("desktop:tools-status", () => toolsStatus());
  // GitHub par le `gh` de la personne (dépôts, création, connexion) : son jeton reste dans le trousseau du système.
  ipcMain.handle("desktop:github-repos", () => settle(listRepos()));
  ipcMain.handle("desktop:github-repo", (_event, fullName: unknown) =>
    settle(isRepoFullName(fullName) ? findRepo(fullName) : Promise.resolve(null)));
  ipcMain.handle("desktop:github-create-repo", (_event, input: unknown) => {
    const { name, private: isPrivate } = (input ?? {}) as { name?: unknown; private?: unknown };
    if (!isNewRepoName(name)) return { ok: false, error: "Letters, digits, dots, dashes and underscores only" };
    return settle(createRepo(name, isPrivate !== false));
  });
  ipcMain.handle("desktop:github-sign-in", () => settle(githubSignIn.start()));
  ipcMain.handle("desktop:github-sign-in-page", () => shell.openExternal(DEVICE_PAGE));
  ipcMain.handle("desktop:github-sign-in-wait", () => githubSignIn.wait());
  ipcMain.handle("desktop:github-sign-in-cancel", () => githubSignIn.cancel());
  // Claude Code de la personne branché sur le serveur MCP d'un espace (mode interactif), à l'adresse de la fenêtre.
  ipcMain.handle("desktop:claude-mcp-status", (_event, slug: unknown) => {
    if (!stack || !isWorkspaceSlug(slug)) return { ok: false, error: "Unknown workspace" };
    return settle(mcpConnection(stack.origin, slug));
  });
  ipcMain.handle("desktop:claude-mcp-connect", (_event, input: unknown) => {
    const { slug, token } = (input ?? {}) as { slug?: unknown; token?: unknown };
    if (!stack || !isWorkspaceSlug(slug) || !isPersonalToken(token)) return { ok: false, error: "Invalid workspace or token" };
    return settle(connectMcp(stack.origin, slug, token));
  });
  ipcMain.handle("desktop:claude-mcp-disconnect", (_event, slug: unknown) => {
    if (!isWorkspaceSlug(slug)) return { ok: false, error: "Unknown workspace" };
    return settle(disconnectMcp(slug));
  });
  ipcMain.handle("desktop:sign-out", async () => {
    const account = stack?.account ?? settings.account();
    if (account) {
      const sessionToken = settings.secret(account.subject, "sessionToken");
      if (sessionToken) await revoke(sessionToken).catch((error: Error) => log.warn(`Revoke failed: ${error.message}`));
    }
    settings.clearAccount();
    log.info("Signed out");
    app.relaunch();
    app.quit();
  });
}

/** Réponse d'une action de la coque : la valeur, ou le message à montrer. */
async function settle<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** Réglages d'IA tels que l'écran les montre, avec l'état lu à l'instant chez le fournisseur. */
async function aiView() {
  if (!stack) throw new Error("TaskForce is still starting");
  const subject = stack.account.subject;
  return {
    settings: settings.aiSettings(subject),
    hasApiKey: Boolean(settings.secret(subject, "aiApiKey")),
    state: await stack.ai.state(true),
  };
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
  githubSignIn.cancel();
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
