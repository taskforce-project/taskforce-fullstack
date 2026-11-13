/**
 * Le sélecteur de Google Drive (Google Picker), avec la portée `drive.file` (séance n°22, R154) : TaskForce ne voit que
 * ce que la personne choisit ici, et ce qu'il a lui-même rangé. Pas de vérification restreinte chez Google, pas d'accès à
 * tout le Drive. Le jeton est celui de la personne, court, pour sa propre fenêtre ; le sélecteur vit dans une iframe de
 * Google.
 */

/** Ce que le serveur donne pour ouvrir le sélecteur : la clé du navigateur, le projet Google, le jeton de la personne. */
export interface GooglePickerConfig {
  developerKey: string
  appId: string
  accessToken: string
}

/** Un dossier ou un fichier choisi. */
export interface PickedItem {
  id: string
  name: string
  url: string | null
  mimeType: string | null
}

export type PickerMode = "folder" | "files"

export const PICKER_SCRIPT = "https://apis.google.com/js/api.js"
const FOLDER_TYPE = "application/vnd.google-apps.folder"

// Le peu de l'API du sélecteur dont TaskForce se sert (https://developers.google.com/workspace/drive/picker/reference).
interface PickerDoc { id: string; name?: string; url?: string; mimeType?: string }
interface PickerResponse { action: string; docs?: PickerDoc[] }
interface DocsView {
  setIncludeFolders(on: boolean): DocsView
  setSelectFolderEnabled(on: boolean): DocsView
  setMimeTypes(types: string): DocsView
}
interface Picker { setVisible(visible: boolean): void; dispose?(): void }
interface PickerBuilder {
  addView(view: DocsView): PickerBuilder
  enableFeature(feature: string): PickerBuilder
  setOAuthToken(token: string): PickerBuilder
  setDeveloperKey(key: string): PickerBuilder
  setAppId(appId: string): PickerBuilder
  setTitle(title: string): PickerBuilder
  setCallback(callback: (response: PickerResponse) => void): PickerBuilder
  build(): Picker
}
export interface GooglePickerApi {
  DocsView: new (viewId?: string) => DocsView
  PickerBuilder: new () => PickerBuilder
  ViewId: { DOCS: string; FOLDERS: string }
  Feature: { SUPPORT_DRIVES: string; MULTISELECT_ENABLED: string }
  Action: { PICKED: string; CANCEL: string }
}
interface GapiLoader { load(name: string, options: { callback: () => void; onerror?: () => void }): void }
type PickerWindow = Window & { gapi?: GapiLoader; google?: { picker?: GooglePickerApi } }

let loading: Promise<GooglePickerApi> | null = null

/** Charge le script de Google une fois, puis le module du sélecteur. */
export function loadPicker(win: PickerWindow = window): Promise<GooglePickerApi> {
  const ready = win.google?.picker
  if (ready) return Promise.resolve(ready)
  if (loading) return loading
  loading = new Promise<GooglePickerApi>((resolve, reject) => {
    const withGapi = () => {
      const gapi = win.gapi
      if (!gapi) {
        reject(new Error("picker"))
        return
      }
      gapi.load("picker", {
        callback: () => (win.google?.picker ? resolve(win.google.picker) : reject(new Error("picker"))),
        onerror: () => reject(new Error("picker")),
      })
    }
    if (win.gapi) {
      withGapi()
      return
    }
    const script = win.document.createElement("script")
    script.src = PICKER_SCRIPT
    script.async = true
    script.onload = withGapi
    script.onerror = () => reject(new Error("picker"))
    win.document.head.appendChild(script)
  }).catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}

/** Oublie le chargement en cours (essais seulement). */
export function resetPickerForTests(): void {
  loading = null
}

/**
 * Ouvre le sélecteur : un dossier (où ranger), ou des fichiers (que Cortex pourra lire). Rend ce que la personne a
 * choisi, ou null quand elle ferme.
 */
export async function pickFromGoogleDrive(config: GooglePickerConfig, mode: PickerMode, title: string,
                                          win: PickerWindow = window): Promise<PickedItem[] | null> {
  const picker = await loadPicker(win)
  return new Promise((resolve) => {
    const view = mode === "folder"
      ? new picker.DocsView(picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(FOLDER_TYPE)
      : new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true)
    let builder = new picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.developerKey)
      .setAppId(config.appId)
      .setTitle(title)
      .setCallback((response) => {
        if (response.action === picker.Action.PICKED) {
          resolve((response.docs ?? []).map((d) => ({ id: d.id, name: d.name ?? d.id, url: d.url ?? null, mimeType: d.mimeType ?? null })))
        } else if (response.action === picker.Action.CANCEL) {
          resolve(null)
        }
      })
    if (mode === "files") builder = builder.enableFeature(picker.Feature.MULTISELECT_ENABLED)
    builder.build().setVisible(true)
  })
}
