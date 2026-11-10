import { contextBridge, ipcRenderer } from "electron";

/** Pont de l'écran de la coque (static/splash.html) : les actions d'un échec (essayer encore, journaux, quitter...). */
contextBridge.exposeInMainWorld("taskforceScreen", {
  act: (action: string): Promise<void> => ipcRenderer.invoke("screen:act", action),
});
