import { contextBridge, ipcRenderer } from "electron";

/** Pont de l'écran de connexion : lancer la connexion (ou la création du compte) dans le navigateur. */
contextBridge.exposeInMainWorld("taskforceSignIn", {
  signIn: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("signin:start", false),
  signUp: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("signin:start", true),
});
