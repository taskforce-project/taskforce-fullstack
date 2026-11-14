import { create } from "zustand";

import { getErrorMessage } from "../api/client";
import {
  checkProcess,
  exportDefaultBpmn,
  exportProcessBpmn,
  getProcess,
  getProcessVersion,
  importProcessBpmn,
  listProcessDefaults,
  listProcesses,
  publishProcess,
  type BpmnDownload,
  type ProcessCheck,
  type ProcessDefault,
  type ProcessDetail,
  type ProcessImport,
  type ProcessModel,
  type ProcessOverview,
  type ProcessPublication,
  type ProcessVersion,
} from "../api/process-service";

// ---------------------------------------------------------------------------
// Les processus (ADR-027). Un domaine = un store. Erreurs avalées : chaque action rend null ou false, et la raison dans
// `error`. Une publication refusée par le vérificateur n'est pas une erreur : elle revient avec ses refus.
// ---------------------------------------------------------------------------

/** Le projet dont le store garde les processus : `slug` et `projectId` ensemble. */
const projectKey = (slug: string, projectId: number) => `${slug}:${projectId}`;

interface ProcessState {
  /** Les processus du projet ouvert ; null tant qu'ils ne sont pas lus. */
  overview: ProcessOverview | null;
  /** Le projet dont `overview` donne les processus. */
  project: string | null;
  /** Le processus ouvert, avec sa version en vigueur et toutes ses versions. */
  detail: ProcessDetail | null;
  /** Les workflows par défaut, publiés avec le code. */
  defaults: ProcessDefault[] | null;
  loading: boolean;
  /** La dernière lecture a échoué : l'écran le dit au lieu d'attendre. */
  loadFailed: boolean;
  error: string | null;

  fetchProcesses: (slug: string, projectId: number) => Promise<ProcessOverview | null>;
  fetchProcess: (slug: string, projectId: number, key: string) => Promise<ProcessDetail | null>;
  fetchVersion: (slug: string, projectId: number, key: string, version: number) => Promise<ProcessVersion | null>;
  fetchDefaults: (slug: string) => Promise<ProcessDefault[] | null>;
  /** Le vérificateur sur un modèle ; null si le serveur n'a pas pu le juger. */
  checkProcess: (slug: string, projectId: number, model: ProcessModel) => Promise<ProcessCheck | null>;
  /** Un fichier BPMN 2.0 lu et vérifié ; rien n'est publié. */
  importBpmn: (slug: string, projectId: number, xml: string) => Promise<ProcessImport | null>;
  /** Publie une version et relit le projet ; une version refusée revient avec ses refus (`published` faux). */
  publish: (slug: string, projectId: number, model: ProcessModel) => Promise<ProcessPublication | null>;
  /** L'export BPMN 2.0 d'une version, ou d'un workflow par défaut sans `projectId`. */
  downloadBpmn: (slug: string, key: string, target?: { projectId: number; version: number }) => Promise<BpmnDownload | null>;
}

export const useProcessStore = create<ProcessState>((set, get) => ({
  overview: null,
  project: null,
  detail: null,
  defaults: null,
  loading: false,
  loadFailed: false,
  error: null,

  fetchProcesses: async (slug, projectId) => {
    const key = projectKey(slug, projectId);
    set((state) => ({
      loading: true,
      loadFailed: false,
      ...(state.project === key ? {} : { overview: null, detail: null, project: key }),
    }));
    try {
      const overview = await listProcesses(slug, projectId);
      // Une réponse d'un projet qu'on a quitté entre-temps ne remplace pas celui qu'on regarde.
      if (get().project !== key) return overview;
      set({ overview, loading: false });
      return overview;
    } catch (error) {
      if (get().project === key) set({ loading: false, loadFailed: true, error: getErrorMessage(error) });
      return null;
    }
  },

  fetchProcess: async (slug, projectId, key) => {
    set({ error: null });
    try {
      const detail = await getProcess(slug, projectId, key);
      if (get().project === projectKey(slug, projectId)) set({ detail });
      return detail;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  fetchVersion: async (slug, projectId, key, version) => {
    set({ error: null });
    try {
      return await getProcessVersion(slug, projectId, key, version);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  fetchDefaults: async (slug) => {
    set({ error: null });
    try {
      const defaults = await listProcessDefaults(slug);
      set({ defaults });
      return defaults;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  checkProcess: async (slug, projectId, model) => {
    set({ error: null });
    try {
      return await checkProcess(slug, projectId, model);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  importBpmn: async (slug, projectId, xml) => {
    set({ error: null });
    try {
      return await importProcessBpmn(slug, projectId, xml);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  publish: async (slug, projectId, model) => {
    set({ error: null });
    try {
      const result = await publishProcess(slug, projectId, model);
      if (result.published) {
        await get().fetchProcesses(slug, projectId);
        if (get().detail?.key === model.key) await get().fetchProcess(slug, projectId, model.key);
      }
      return result;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  downloadBpmn: async (slug, key, target) => {
    set({ error: null });
    try {
      return target
        ? await exportProcessBpmn(slug, target.projectId, key, target.version)
        : await exportDefaultBpmn(slug, key);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },
}));
