import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, Notification, screen, session, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { ACCOUNT_SERVER, accountPageUrl, refresh, revoke, SessionEndedError, signIn, signInError } from "./account";
import { aiEnvironment, keySlot, parseAiInput, type AiState } from "./ai";
import { BACKUPS } from "./backup";
import { connectMcp, disconnectMcp, isPersonalToken, isWorkspaceSlug, mcpConnection } from "./claude";
import { createRepo, DEVICE_PAGE, findRepo, GitHubSignIn, isNewRepoName, isRepoFullName, listRepos } from "./github";
import { initLog, log } from "./log";
import { APP_ID, readNotice } from "./notify";
import { appLogDir, fromStore, storeDataDir } from "./paths";
import { applyPermissions } from "./permissions";
import { settings, type Account } from "./settings";
import { startStack, type Stack } from "./stack";
import { toolsStatus } from "./tools";
import {
  centeredIn,
  firstScreen,
  isScreenAction,
  placeFromArgs,
  relaunchArgs,
  SCREEN_SIZE,
  screenHash,
  SCREENS,
  withNote,
  type Point,
  type ScreenState,
} from "./screen";
import { readMove, readWorkspaceMove, Transfer, type LocalApi } from "./transfer";
import { pendingOutcome, readPending, updateScreenRect } from "./update-pending";
import {
  announceInstalled,
  check,
  installNow,
  releaseUpdateScreenOnFirstWindow,
  restartApp,
  SETTLE_MS,
  startUpdater,
  updateState,
  type RestartScreen,
} from "./updater";
import { prepareVoiceInBackground, registerVoice, voiceAvailable } from "./voice";
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
/** L'écran de la coque ouvert, s'il y en a un : démarrage, mise à jour, déconnexion, ou leur échec. */
let screenWin: BrowserWindow | null = null;
let quitting = false;
const githubSignIn = new GitHubSignIn();

const staticPage = (name: string): string => join(__dirname, "..", "static", name);

// Développement : `TF_DESKTOP_USER_DATA` isole les réglages et les données d'essai de ceux de l'app installée.
if (!app.isPackaged && process.env.TF_DESKTOP_USER_DATA) app.setPath("userData", process.env.TF_DESKTOP_USER_DATA);
// Version du Microsoft Store : réglages et données dans le dossier du paquet (cf. storeDataDir), avant le verrou
// d'instance unique, qui en dépend.
const storeData = fromStore() ? storeDataDir(process.execPath, process.env.LOCALAPPDATA) : null;
if (storeData) app.setPath("userData", storeData);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", bringToFront);
  app.whenReady().then(main).catch(fatal);
}

/** La fenêtre de l'app, ou l'écran de la coque tant qu'elle n'est pas là, au premier plan. */
function bringToFront(): void {
  const window = mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
}

async function main(): Promise<void> {
  initLog(appLogDir());
  log.info(`TaskForce ${app.getVersion()} starting (${process.platform}, Electron ${process.versions.electron})`);
  // Le paquet du Store porte déjà l'identité de l'app : la remplacer enverrait les notifications au nom d'une app sans
  // raccourci dans le menu Démarrer, et Windows les ignorerait.
  if (process.platform === "win32" && !fromStore()) app.setAppUserModelId(APP_ID);
  Menu.setApplicationMenu(buildMenu());
  registerIpc();
  registerVoice(() => mainWindow);
  releaseUpdateScreenOnFirstWindow();
  // Micro pour la seule origine de la fenêtre ; ce que l'interface n'utilise pas est refusé (cf. permissions.ts).
  applyPermissions(session.defaultSession, () => stack?.origin ?? null, voiceAvailable());

  // La première fenêtre s'ouvre là où était l'écran d'avant, et dit d'abord ce qu'il disait : celui de l'installeur qui
  // passe la main après une mise à jour, ou celui de l'instance qui s'est relancée.
  const place = initialPlace();
  const pending = readPending(app.getPath("userData"));
  const first = firstScreen(pending && { outcome: pendingOutcome(pending, app.getVersion()), version: pending.version });

  // Un compte connecté par un autre service de comptes (développement, changement d'adresse) demande une reconnexion.
  let account = settings.account();
  if (account?.issuer !== ACCOUNT_SERVER) account = undefined;
  let signInWin: BrowserWindow | null = null;
  let refreshed: Promise<"valid" | "ended" | "offline"> = Promise.resolve("valid");
  if (!account) {
    ({ account, window: signInWin } = await signInWindow(place));
  } else if (!account.profile || account.avatarUrl === undefined) {
    // Compte connecté par une version qui ne gardait pas les réglages ou la photo du compte en ligne : on les relit
    // avant de démarrer, pour que l'app les reprenne dès ce lancement (hors ligne, elle démarre sans).
    const state = await refreshAccount(account);
    if (state === "ended") {
      sessionEnded(place);
      return;
    }
    account = settings.account() ?? account;
  } else {
    refreshed = refreshAccount(account);
  }
  if (!(await openApp(account, signInWin, first, place))) return;
  // Session fermée en ligne : traitée une fois la pile démarrée, pour qu'elle s'arrête proprement. Les mises à jour
  // attendent l'app relancée : démarrées pendant l'arrêt, elles pourraient retrouver une version téléchargée lors d'un
  // lancement précédent, qui s'installerait en quittant et fermerait l'app relancée.
  if ((await refreshed) === "ended") {
    sessionEnded(place);
    return;
  }
  startUpdater();
  prepareVoiceInBackground();
}

/**
 * La place de la première fenêtre, en points : celle que l'instance d'avant a donnée en se relançant (déconnexion, nouvel
 * essai), ou celle de la fenêtre de l'installeur encore à l'écran après une mise à jour. Sinon, centrée.
 */
function initialPlace(): Point | null {
  const given = placeFromArgs(process.argv);
  if (given) return given;
  if (process.platform !== "win32") return null;
  const rect = updateScreenRect(app.getPath("userData"));
  if (!rect) return null;
  const { x, y } = screen.screenToDipRect(null, rect);
  return { x, y };
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

/**
 * Session fermée en ligne : l'app oublie le compte sur ce poste et le dit dans l'écran de la coque, à la place de sa
 * fenêtre ; « Sign in » la redémarre sur la connexion (`screen:act`). Le compte s'efface avant : l'app rouverte, par la
 * relance ou par l'installeur d'une mise à jour prête (cf. `restartApp`), montre la connexion.
 */
function sessionEnded(place: Point | null): void {
  log.info("Session ended online: signing out of this computer");
  settings.clearAccount();
  if (mainWindow) void screenOver(mainWindow, SCREENS.signedOut);
  else openScreen(SCREENS.signedOut, place);
}

/** Écran de connexion : se résout une fois le compte connecté, la fenêtre encore ouverte (cf. `openApp`). */
function signInWindow(place: Point | null): Promise<{ account: Account; window: BrowserWindow }> {
  return new Promise((resolve) => {
    // Comme la page de connexion de la webapp : la peinture et l'app à gauche, la connexion à droite.
    const window = shellWindow({ place, title: "Sign in to TaskForce", preload: "signin-preload.js", controls: true });
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

/**
 * Une fenêtre de la coque hors de la fenêtre principale : la taille, le fond et le thème de la connexion, à `place` ou au
 * centre de l'écran principal. Les boutons du système sur la seule connexion (`controls`) : un écran d'attente n'en a
 * pas, comme la fenêtre de l'installeur qui le relaie. Montrée une fois peinte, images décodées : elle s'ouvre par-dessus
 * l'écran d'avant, à l'identique, et seule la droite change.
 */
function shellWindow(options: { place: Point | null; title: string; preload: string; controls: boolean; toFront?: boolean }): BrowserWindow {
  const dark = nativeTheme.shouldUseDarkColors;
  const { x, y } = options.place ?? centeredIn(screen.getPrimaryDisplay().workArea);
  const window = new BrowserWindow({
    ...SCREEN_SIZE,
    x,
    y,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    minimizable: options.controls,
    show: false,
    title: options.title,
    backgroundColor: dark ? "#0b0e19" : "#ffffff",
    // Sans barre de titre, avec le cadre du système : Windows 11 en arrondit les coins.
    ...(options.controls
      ? titleBarOptions(process.platform, dark, SIGNIN_TITLE_BAR_HEIGHT)
      : integratedTitleBar(process.platform) ? { titleBarStyle: "hidden" as const } : { frame: false }),
    webPreferences: { preload: join(__dirname, options.preload), contextIsolation: true, sandbox: true },
  });
  // À 125 %, la taille donnée à la création laisse une page de 1004 x 644 points ; celle du contenu, donnée ensuite, est
  // exacte : la page fait celle de l'écran que l'installeur dessine.
  window.setContentSize(SCREEN_SIZE.width, SCREEN_SIZE.height);
  window.setMenuBarVisibility(false);
  lockNavigation(window, null);
  window.once("ready-to-show", () => {
    void window.webContents
      .executeJavaScript("Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)))")
      .catch(() => undefined)
      .finally(() => {
        if (window.isDestroyed()) return;
        if (options.toFront) {
          // Après la connexion, la personne est dans son navigateur : Windows ne laisse une app revenir au premier plan
          // que si elle passe un instant au-dessus des autres fenêtres.
          window.setAlwaysOnTop(true);
          window.show();
          window.setAlwaysOnTop(false);
          window.focus();
        } else {
          window.show();
        }
      });
  });
  return window;
}

/** L'écran de la coque (static/splash.html) : ce qui fait attendre, ou ce qui a échoué et ses actions (`screen:act`). */
function openScreen(state: ScreenState, place: Point | null, toFront = false): BrowserWindow {
  const window = shellWindow({ place, title: "TaskForce", preload: "screen-preload.js", controls: false, toFront });
  screenWin = window;
  window.on("closed", () => {
    if (screenWin === window) screenWin = null;
  });
  void window.loadFile(staticPage("splash.html"), { hash: screenHash(state) });
  return window;
}

/** Ce que dit l'écran ouvert : seule l'adresse change, la page reste (pas de rechargement, le panneau ne bouge pas). */
function showScreen(window: BrowserWindow, state: ScreenState): void {
  if (!window.isDestroyed()) void window.loadFile(staticPage("splash.html"), { hash: screenHash(state) });
}

/** Les fenêtres qui ont laissé leur place : elles se ferment, aucun écran ne les reprend. */
const leaving = new WeakSet<BrowserWindow>();

/** `next` prend la place de `previous`, qui se ferme une fois `next` entièrement apparue par-dessus. */
function closeWhenShown(next: BrowserWindow, previous: BrowserWindow): void {
  leaving.add(previous);
  const close = () => setTimeout(() => {
    if (!previous.isDestroyed()) previous.close();
  }, SETTLE_MS);
  if (next.isVisible()) close();
  else next.once("show", close);
}

/** L'écran de la coque à l'écran, s'il y en a un qui reste. */
function currentScreen(): BrowserWindow | null {
  return screenWin && !screenWin.isDestroyed() && !leaving.has(screenWin) ? screenWin : null;
}

/** Résolue quand la fenêtre est à l'écran, ou au plus tard après `timeoutMs`. */
function shown(window: BrowserWindow, timeoutMs: number): Promise<void> {
  if (window.isVisible()) return Promise.resolve();
  return new Promise((resolve) => {
    window.once("show", () => setTimeout(resolve, SETTLE_MS));
    setTimeout(resolve, timeoutMs).unref();
  });
}

/**
 * L'écran de la coque à la place de la fenêtre principale (mise à jour, déconnexion), au centre de l'écran où elle était.
 * Elle se ferme une fois l'écran à l'écran : l'app n'a jamais zéro fenêtre, ce qui la ferait quitter.
 */
async function screenOver(previous: BrowserWindow | null, state: ScreenState): Promise<BrowserWindow> {
  let window = currentScreen();
  if (window) {
    showScreen(window, state);
  } else {
    const display = previous && !previous.isDestroyed() ? screen.getDisplayMatching(previous.getBounds()) : screen.getPrimaryDisplay();
    window = openScreen(state, centeredIn(display.workArea));
  }
  await shown(window, 2_000);
  if (previous && !previous.isDestroyed()) previous.close();
  return window;
}

/** La poignée de la fenêtre, pour l'installeur qui la remplace (Windows) ; `null` ailleurs. */
function nativeHandle(window: BrowserWindow): string | null {
  if (process.platform !== "win32" || window.isDestroyed()) return null;
  const handle = window.getNativeWindowHandle();
  return handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : handle.readUInt32LE(0).toString();
}

/**
 * Avant d'installer une mise à jour (« Restart now », cf. `installNow` dans updater.ts) : l'écran de la coque remplace la
 * fenêtre pendant que la pile s'arrête proprement. Il reste jusqu'à ce que la fenêtre de l'installeur, dessinée à
 * l'identique à sa place (installer.nsh, mêmes phrases), prenne le relais : elle la trouve par la poignée rendue ici.
 */
async function prepareUpdate(version: string): Promise<string | null> {
  quitting = true;
  const window = await screenOver(mainWindow, SCREENS.installing(version));
  await stopStack();
  return nativeHandle(window);
}

/**
 * Redémarre l'app sans mise à jour (déconnexion, session fermée, nouvel essai) : si la pile tourne, l'écran de la coque
 * dit `stopping` pendant qu'elle s'arrête (ou garde ce qu'il dit, sans `stopping`) ; l'app se relance ensuite à sa place.
 */
async function relaunchApp(stopping: ScreenState | null): Promise<void> {
  quitting = true;
  if (stack) {
    if (stopping || !currentScreen()) await screenOver(mainWindow, stopping ?? SCREENS.signingOut);
    await stopStack();
  }
  const place = currentScreen()?.getBounds() ?? null;
  app.relaunch({ args: relaunchArgs(process.argv.slice(1), place) });
  app.quit();
}

/** Ce que l'écran fait pour redémarrer, par la mise à jour ou par une relance (cf. updater.ts). */
const restart: RestartScreen = { prepare: prepareUpdate, relaunch: () => relaunchApp(SCREENS.signingOut) };

/**
 * Démarre la pile du compte derrière l'écran de la coque, puis ouvre la fenêtre de l'app. La fenêtre précédente
 * (connexion) laisse sa place à l'écran, qui s'ouvre à l'identique par-dessus : seule la droite change. `false` si la
 * pile n'a pas démarré : l'écran le dit, avec ses actions.
 */
async function openApp(account: Account, previous: BrowserWindow | null, first: ScreenState, place: Point | null): Promise<boolean> {
  const splash = openScreen(first, previous ? previous.getBounds() : place, previous !== null);
  if (previous) closeWhenShown(splash, previous);
  try {
    // Le retour d'une connexion à un outil ramène la fenêtre de l'app : elle y dit « Connected as ... ».
    stack = await startStack(account, (text) => showScreen(splash, withNote(first, text)), bringToFront);
  } catch (error) {
    log.error(`Start failed: ${(error as Error).stack ?? error}`);
    // L'échec se dit dans l'écran, à la place des étapes : essayer encore, ouvrir les journaux, quitter.
    quitting = true;
    showScreen(splash, SCREENS.startFailed((error as Error).message));
    return false;
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
    closeWhenShown(mainWindow, splash);
  });
  mainWindow.on("closed", () => (mainWindow = null));
  // Premier lancement d'une nouvelle version : la fenêtre le dit à son ouverture, plus de notification du système.
  if (stack.updateNotice) announceInstalled(stack.updateNotice);
  await mainWindow.loadURL(stack.origin);
  return true;
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
      // Qui installe les mises à jour : l'app elle-même, ou le Microsoft Store pour sa version Store.
      updates: fromStore() ? "store" : "app",
      // La voix transcrite sur la machine, là où le moteur est embarqué (cf. voice.ts).
      voice: voiceAvailable(),
    };
  });
  ipcMain.handle("desktop:account-page", () => shell.openExternal(accountPageUrl()));
  // Événement reçu pendant que la fenêtre n'est pas au premier plan : notification du système (cf. notify.ts).
  ipcMain.on("desktop:notify", (event, input: unknown) => {
    const notice = readNotice(input);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!notice || !window || window.isFocused() || !Notification.isSupported()) return;
    const shown = new Notification({ title: notice.title, body: notice.body });
    // Gardée jusqu'à sa fermeture : une notification ramassée par le ramasse-miettes ne répond plus au clic.
    notices.add(shown);
    shown.on("close", () => notices.delete(shown));
    shown.on("click", () => {
      notices.delete(shown);
      if (window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      if (notice.path) window.webContents.send("desktop:navigate", notice.path);
    });
    shown.show();
  });
  // Réglages d'IA du compte : fournisseur et modèles dans les réglages, clé dans le trousseau, jamais renvoyée à la page.
  // Le backend les reçoit tout de suite (sans redémarrer) et rend l'état lu chez le nouveau fournisseur.
  ipcMain.handle("desktop:ai-get", () => aiView());
  ipcMain.handle("desktop:ai-save", async (_event, input: unknown) => {
    if (!stack) return { ok: false, error: "TaskForce is still starting" };
    const subject = stack.account.subject;
    try {
      const { settings: next, apiKey } = parseAiInput(input);
      settings.setAiSettings(subject, next);
      // Une clé par fournisseur : celle qu'on tape va au fournisseur choisi, jamais à un autre.
      const slot = keySlot(next.provider);
      if (apiKey !== undefined && slot) settings.setSecret(subject, slot, apiKey || undefined);
      const state = await stack.ai.apply(aiEnvironment(next, settings.aiKey(subject, next.provider)));
      return { ok: true, view: await aiView(state) };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });
  ipcMain.handle("desktop:check-updates", () => check());
  // Le toast de la mise à jour lit l'état à son ouverture, puis le reçoit à chaque changement (cf. updater.ts).
  ipcMain.handle("desktop:update-state", () => updateState());
  ipcMain.handle("desktop:install-update", () => installNow(restart));
  // Les actions d'un écran d'échec de la coque (static/splash.html), de lui seul.
  ipcMain.handle("screen:act", async (event, action: unknown) => {
    const current = currentScreen();
    if (!isScreenAction(action) || !current || BrowserWindow.fromWebContents(event.sender) !== current) return;
    if (action === "quit") app.quit();
    else if (action === "logs") await shell.openPath(appLogDir());
    else if (action === "retry") await relaunchApp(null);
    else await restartApp(restart);
  });
  ipcMain.handle("desktop:open-logs", () => shell.openPath(appLogDir()));
  // Le dossier où TaskForce range ce qu'il écrit (séance n°22, R156) : choisi par la personne, dans la boîte du système.
  ipcMain.handle("desktop:choose-folder", async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: "Where TaskForce saves documents",
      properties: ["openDirectory", "createDirectory"],
    };
    const chosen = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    return chosen.canceled || chosen.filePaths.length === 0 ? null : chosen.filePaths[0];
  });
  // Copies de la base faites avant chaque mise à jour (cf. backup.ts).
  ipcMain.handle("desktop:open-backups", () => {
    if (!stack) return undefined;
    const dir = join(stack.dataDir, BACKUPS);
    mkdirSync(dir, { recursive: true });
    return shell.openPath(dir);
  });
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
  ipcMain.handle("desktop:github-sign-in-wait", async () => {
    const outcome = await githubSignIn.wait();
    // Connecté à GitHub : le backend relit le jeton tout de suite (Copilot, pull requests liées).
    if (outcome.ok) stack?.github.invalidate();
    return outcome;
  });
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
  // Projets entre la webapp et cet ordinateur : la session de l'app reste dans la coque, la page ne voit que le résultat.
  ipcMain.handle("desktop:web-projects", () => withSession((token) => transfer.webProjects(token)));
  ipcMain.handle("desktop:bring-project", (_event, input: unknown) => {
    const move = readMove(input);
    if (!move) return { ok: false, error: "Unknown project or workspace" };
    return withSession((token, local) =>
      transfer.bring(token, { workspace: move.workspace, projectId: move.projectId }, move.target, local));
  });
  ipcMain.handle("desktop:send-project", (_event, input: unknown) => {
    const move = readMove(input);
    if (!move) return { ok: false, error: "Unknown project or workspace" };
    return withSession((token, local) =>
      transfer.send(token, { workspace: move.workspace, projectId: move.projectId }, move.target, local));
  });
  ipcMain.handle("desktop:bring-workspace", (_event, input: unknown) => {
    const move = readWorkspaceMove(input);
    if (!move) return { ok: false, error: "Unknown workspace" };
    return withSession((token, local) => transfer.bringWorkspace(token, move.workspace, local));
  });
  ipcMain.handle("desktop:send-workspace", (_event, input: unknown) => {
    const move = readWorkspaceMove(input);
    if (!move) return { ok: false, error: "Unknown workspace" };
    return withSession((token, local) => transfer.sendWorkspace(token, move.workspace, local));
  });
  ipcMain.handle("desktop:open-web", (_event, url: unknown) =>
    transfer.isWebAddress(url) ? shell.openExternal(url) : undefined);
  ipcMain.handle("desktop:sign-out", async () => {
    const account = stack?.account ?? settings.account();
    if (account) {
      const sessionToken = settings.secret(account.subject, "sessionToken");
      if (sessionToken) await revoke(sessionToken).catch((error: Error) => log.warn(`Revoke failed: ${error.message}`));
    }
    // Le compte s'efface avant le redémarrage : l'app rouverte, par la relance ou par l'installeur d'une mise à jour
    // prête (cf. `restartApp`), montre la connexion.
    settings.clearAccount();
    log.info("Signed out");
    await restartApp(restart);
  });
}

const transfer = new Transfer();

/** Notifications du système encore affichées. */
const notices = new Set<Notification>();

/** Action qui joint la webapp avec la session de l'app, et l'API locale avec le jeton de lancement. */
async function withSession<T>(
  action: (token: string, local: LocalApi) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  if (!stack) return { ok: false, error: "TaskForce is still starting" };
  const token = settings.secret(stack.account.subject, "sessionToken");
  if (!token) return { ok: false, error: "Sign out, then sign in again to reach the web app" };
  const result = await settle(action(token, { origin: stack.origin, launchToken: stack.launchToken }));
  if (!result.ok) {
    log.warn(`Project move failed: ${result.error}`);
    return { ok: false, error: Transfer.errorMessage(result.error) };
  }
  return result;
}

/** Réponse d'une action de la coque : la valeur, ou le message à montrer. */
async function settle<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/**
 * Réglages d'IA tels que l'écran les montre, avec l'état que le backend lit à l'instant chez le fournisseur ; `state`
 * quand il vient d'être lu (après un changement de fournisseur).
 */
async function aiView(state?: AiState) {
  if (!stack) throw new Error("TaskForce is still starting");
  const subject = stack.account.subject;
  const chosen = settings.aiSettings(subject);
  return {
    settings: chosen,
    hasApiKey: Boolean(settings.aiKey(subject, chosen.provider)),
    state: state ?? (await stack.ai.state(true)),
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
        ...(fromStore() ? [] : [{ label: "Check for updates", click: () => void check() }]),
        { label: "Open logs folder", click: () => void shell.openPath(appLogDir()) },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

/** Arrêt propre : l'interface, le backend puis la base, avant de rendre la main au système. */
async function stopStack(): Promise<void> {
  if (!stack) return;
  githubSignIn.cancel();
  const current = stack;
  stack = null;
  log.info("Stopping");
  await current.stop();
}

app.on("before-quit", (event) => {
  if (quitting || !stack) return;
  event.preventDefault();
  quitting = true;
  void stopStack().finally(() => app.quit());
});

app.on("window-all-closed", () => app.quit());

/**
 * Une erreur que rien n'attendait : l'écran de la coque la dit comme un démarrage manqué, avec ses actions ; la pile, si
 * elle tourne, s'arrête en quittant. Sans écran possible, la boîte du système.
 */
function fatal(error: unknown): void {
  log.error(`Fatal: ${(error as Error)?.stack ?? String(error)}`);
  const message = (error as Error)?.message ?? String(error);
  try {
    const state = SCREENS.startFailed(message);
    const current = currentScreen();
    if (current) showScreen(current, state);
    else openScreen(state, mainWindow ? centeredIn(screen.getDisplayMatching(mainWindow.getBounds()).workArea) : null);
    mainWindow?.destroy();
  } catch {
    dialog.showErrorBox("TaskForce could not start", message);
    app.exit(1);
  }
}
