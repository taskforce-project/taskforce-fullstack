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
}

const bootstrap = ipcRenderer.sendSync("desktop:bootstrap") as Bootstrap;

contextBridge.exposeInMainWorld("taskforceDesktop", {
  launchToken: bootstrap.launchToken,
  version: bootstrap.version,
  platform: bootstrap.platform,
  email: bootstrap.email,
  signOut: (): Promise<void> => ipcRenderer.invoke("desktop:sign-out"),
  openAccountPage: (): Promise<void> => ipcRenderer.invoke("desktop:account-page"),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke("desktop:check-updates"),
  // IA : fournisseur choisi et état ; la clé d'API part vers le trousseau et ne revient jamais à la page.
  ai: {
    get: (): Promise<unknown> => ipcRenderer.invoke("desktop:ai-get"),
    save: (input: unknown): Promise<unknown> => ipcRenderer.invoke("desktop:ai-save", input),
  },
});
