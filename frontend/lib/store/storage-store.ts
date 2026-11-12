import { create } from "zustand";

import { getErrorMessage } from "../api/client";
import {
  chooseStorage,
  getDocumentLink,
  getGooglePicker,
  getMicrosoftFolders,
  getStorage,
  resetStorage,
  type MicrosoftFolder,
  type StorageOverview,
  type StorageTargetRequest,
} from "../api/storage-service";
import { pickFromGoogleDrive, type PickedItem, type PickerMode } from "../storage/google-picker";

// ---------------------------------------------------------------------------
// Où TaskForce range ce qu'il écrit (R156). Un domaine = un store. Erreurs avalées : chaque action rend null, et la
// raison dans `error`.
// ---------------------------------------------------------------------------

interface StorageState {
  /** L'écran « Storage » ouvert (l'espace, ou un projet) ; null tant qu'il n'est pas lu. */
  overview: StorageOverview | null;
  /** L'espace et le projet dont `overview` parle. */
  key: string | null;
  loading: boolean;
  /** La dernière lecture a échoué : l'écran le dit au lieu d'attendre. */
  loadFailed: boolean;
  saving: boolean;
  error: string | null;

  fetchStorage: (slug: string, projectId: number | null) => Promise<StorageOverview | null>;
  /** Choisit la cible ; null si le serveur l'a refusée (la raison est dans `error`). */
  chooseStorage: (slug: string, projectId: number | null, request: StorageTargetRequest) => Promise<StorageOverview | null>;
  /** Revient au choix du dessus : l'espace pour un projet, TaskForce pour l'espace. */
  resetStorage: (slug: string, projectId: number | null) => Promise<StorageOverview | null>;
  /** Le lien d'un document rangé ; null s'il n'y en a pas, ou si le serveur n'a pas pu le donner. */
  documentLink: (slug: string, documentId: number) => Promise<string | null>;
  /**
   * Ouvre le sélecteur de Google Drive : un dossier où ranger, ou des fichiers que Cortex pourra lire. Rend ce que la
   * personne a choisi ; null quand elle ferme, ou quand le sélecteur n'a pas pu s'ouvrir (la raison dans `error`).
   */
  pickGoogle: (slug: string, mode: PickerMode, title: string) => Promise<PickedItem[] | null>;
  /** Les dossiers d'un endroit de Microsoft 365 (sans endroit : OneDrive et SharePoint) ; null si le serveur n'a pas pu. */
  microsoftFolders: (slug: string, driveId?: string, itemId?: string) => Promise<MicrosoftFolder[] | null>;
}

const keyOf = (slug: string, projectId: number | null) => `${slug}:${projectId ?? ""}`;

export const useStorageStore = create<StorageState>((set) => ({
  overview: null,
  key: null,
  loading: false,
  loadFailed: false,
  saving: false,
  error: null,

  fetchStorage: async (slug, projectId) => {
    const key = keyOf(slug, projectId);
    set((state) => ({ loading: true, loadFailed: false, ...(state.key === key ? {} : { overview: null, key }) }));
    try {
      const overview = await getStorage(slug, projectId);
      set({ overview, key, loading: false });
      return overview;
    } catch (error) {
      set({ loading: false, loadFailed: true, error: getErrorMessage(error) });
      return null;
    }
  },

  chooseStorage: async (slug, projectId, request) => {
    set({ saving: true, error: null });
    try {
      const overview = await chooseStorage(slug, projectId, request);
      set({ overview, key: keyOf(slug, projectId), saving: false });
      return overview;
    } catch (error) {
      set({ saving: false, error: getErrorMessage(error) });
      return null;
    }
  },

  resetStorage: async (slug, projectId) => {
    set({ saving: true, error: null });
    try {
      const overview = await resetStorage(slug, projectId);
      set({ overview, key: keyOf(slug, projectId), saving: false });
      return overview;
    } catch (error) {
      set({ saving: false, error: getErrorMessage(error) });
      return null;
    }
  },

  documentLink: async (slug, documentId) => {
    try {
      return await getDocumentLink(slug, documentId);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  microsoftFolders: async (slug, driveId, itemId) => {
    try {
      return await getMicrosoftFolders(slug, driveId, itemId);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  pickGoogle: async (slug, mode, title) => {
    set({ error: null });
    try {
      const config = await getGooglePicker(slug);
      return await pickFromGoogleDrive(config, mode, title);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },
}));
