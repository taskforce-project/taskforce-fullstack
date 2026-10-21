import { contextBridge, ipcRenderer } from "electron";

/**
 * Pont de la fenêtre principale : l'interface y lit le jeton de lancement de l'API locale (à la place d'une connexion)
 * et y demande les actions de la coque. Rien d'autre de la coque n'est exposé à la page.
 */
interface Bootstrap {
  launchToken: string;
  version: string;
  platform: string;
  email: string;
  onboardedOnline: boolean;
  updates: "app" | "store";
}

const bootstrap = ipcRenderer.sendSync("desktop:bootstrap") as Bootstrap;

contextBridge.exposeInMainWorld("taskforceDesktop", {
  launchToken: bootstrap.launchToken,
  version: bootstrap.version,
  platform: bootstrap.platform,
  email: bootstrap.email,
  onboardedOnline: bootstrap.onboardedOnline === true,
  updates: bootstrap.updates === "store" ? "store" : "app",
  signOut: (): Promise<void> => ipcRenderer.invoke("desktop:sign-out"),
  openAccountPage: (): Promise<void> => ipcRenderer.invoke("desktop:account-page"),
  checkForUpdates: (): Promise<unknown> => ipcRenderer.invoke("desktop:check-updates"),
  openLogs: (): Promise<void> => ipcRenderer.invoke("desktop:open-logs"),
  openBackups: (): Promise<void> => ipcRenderer.invoke("desktop:open-backups"),
  // Événement reçu pendant que la fenêtre n'est pas au premier plan : notification du système, qui ramène sur sa page.
  notify: (input: { title: string; body?: string; path?: string }): void => ipcRenderer.send("desktop:notify", input),
  onNavigate: (callback: (path: string) => void): (() => void) => {
    const listener = (_event: unknown, path: unknown) => {
      if (typeof path === "string") callback(path);
    };
    ipcRenderer.on("desktop:navigate", listener);
    return () => {
      ipcRenderer.removeListener("desktop:navigate", listener);
    };
  },
  // Le haut de la fenêtre est dessiné par l'interface : les boutons du système prennent les couleurs de son thème.
  setTitleBarTheme: (dark: boolean, height?: number): void => ipcRenderer.send("desktop:title-bar-theme", { dark, height }),
  // IA : fournisseur choisi et état ; la clé d'API part vers le trousseau et ne revient jamais à la page.
  ai: {
    get: (): Promise<unknown> => ipcRenderer.invoke("desktop:ai-get"),
    save: (input: unknown): Promise<unknown> => ipcRenderer.invoke("desktop:ai-save", input),
  },
  // Outils de la personne pour les tâches de Claude Code (Claude Code, git, GitHub CLI).
  tools: {
    status: (): Promise<unknown> => ipcRenderer.invoke("desktop:tools-status"),
  },
  // GitHub par le `gh` de la personne : son jeton ne passe jamais par la page.
  github: {
    repos: (): Promise<unknown> => ipcRenderer.invoke("desktop:github-repos"),
    repo: (fullName: string): Promise<unknown> => ipcRenderer.invoke("desktop:github-repo", fullName),
    createRepo: (input: { name: string; private: boolean }): Promise<unknown> =>
      ipcRenderer.invoke("desktop:github-create-repo", input),
    signIn: (): Promise<unknown> => ipcRenderer.invoke("desktop:github-sign-in"),
    openSignInPage: (): Promise<void> => ipcRenderer.invoke("desktop:github-sign-in-page"),
    waitForSignIn: (): Promise<unknown> => ipcRenderer.invoke("desktop:github-sign-in-wait"),
    cancelSignIn: (): Promise<void> => ipcRenderer.invoke("desktop:github-sign-in-cancel"),
  },
  // Projets entre la webapp et cet ordinateur : la session de l'app reste dans la coque.
  projects: {
    web: (): Promise<unknown> => ipcRenderer.invoke("desktop:web-projects"),
    bring: (input: { workspace: string; projectId: number; target: string }): Promise<unknown> =>
      ipcRenderer.invoke("desktop:bring-project", input),
    send: (input: { workspace: string; projectId: number; target: string }): Promise<unknown> =>
      ipcRenderer.invoke("desktop:send-project", input),
    bringWorkspace: (input: { workspace: string }): Promise<unknown> => ipcRenderer.invoke("desktop:bring-workspace", input),
    sendWorkspace: (input: { workspace: string }): Promise<unknown> => ipcRenderer.invoke("desktop:send-workspace", input),
    openWeb: (url: string): Promise<void> => ipcRenderer.invoke("desktop:open-web", url),
  },
  // Claude Code de la personne branché sur TaskForce (serveur MCP de l'espace) : le jeton va de la page à `claude`.
  claude: {
    mcpStatus: (slug: string): Promise<unknown> => ipcRenderer.invoke("desktop:claude-mcp-status", slug),
    connectMcp: (input: { slug: string; token: string }): Promise<unknown> => ipcRenderer.invoke("desktop:claude-mcp-connect", input),
    disconnectMcp: (slug: string): Promise<unknown> => ipcRenderer.invoke("desktop:claude-mcp-disconnect", slug),
  },
});
