import { create } from "zustand";
import { getErrorMessage, getErrorStatus } from "../api/client";
import type {
  Project,
  CreateProjectPayload,
  UpdateProjectPayload,
  ProjectObjective,
  ProjectObjectivePayload,
  ProjectRepoLinkPayload,
  ProjectRepoResult,
} from "../api/project-service";
import {
  getProjectObjective,
  setProjectObjective,
  clearProjectObjective,
  listProjects,
  createProject as createProjectApi,
  updateProject as updateProjectApi,
  archiveProject as archiveProjectApi,
  deleteProject as deleteProjectApi,
  favoriteProject as favoriteProjectApi,
  unfavoriteProject as unfavoriteProjectApi,
  setProjectRepo as setProjectRepoApi,
  setProjectTestCommand as setProjectTestCommandApi,
  unsetProjectRepo as unsetProjectRepoApi,
  importProjectBundle as importProjectBundleApi,
} from "../api/project-service";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ProjectState {
  /** Projets du workspace actif */
  projects: Project[];
  /** Projet actuellement consulté */
  activeProject: Project | null;
  isLoading: boolean;
  error: string | null;

  /** Charge la liste des projets pour un workspace */
  fetchProjects: (slug: string) => Promise<Project[]>;

  /** Crée un projet et l'ajoute au store */
  createProject: (slug: string, payload: CreateProjectPayload) => Promise<Project | null>;

  /**
   * Crée un projet depuis un fichier de projet TaskForce et l'ajoute au store. `null` si l'import échoue : le message
   * du serveur (fichier refusé, trop gros) est dans `error`.
   */
  importProject: (slug: string, file: Blob, onProgress?: (pct: number) => void) => Promise<Project | null>;

  /** Met à jour un projet dans le store */
  updateProject: (slug: string, id: number, payload: UpdateProjectPayload) => Promise<Project | null>;

  /** Archive un projet dans le store */
  archiveProject: (slug: string, id: number) => Promise<Project | null>;

  /** Bascule l'état favori d'un projet (optimiste) */
  toggleFavorite: (slug: string, id: number, next: boolean) => Promise<Project | null>;

  /** Supprime un projet du store. `true` si supprimé, `false` si l'appel a échoué (erreur avalée). */
  deleteProject: (slug: string, id: number) => Promise<boolean>;

  /** Lie/crée un dépôt de code sur un projet. Renvoie le résultat, ou `null` si l'appel échoue (erreur avalée). */
  linkRepo: (slug: string, id: number, payload: ProjectRepoLinkPayload) => Promise<ProjectRepoResult | null>;

  /** Délie le dépôt d'un projet. `true` si délié, `false` si l'appel a échoué (erreur avalée). */
  unlinkRepo: (slug: string, id: number) => Promise<boolean>;
  /** Pose la commande de test du projet (S1) ; `true` si elle est enregistrée. */
  setTestCommand: (slug: string, id: number, testCommand: string) => Promise<boolean>;

  /** Définit le projet actif */
  setActiveProject: (project: Project | null) => void;

  /**
   * L'objectif de chaque projet lu (le workflow, séance n°25, W1) : son but, sa date visée, ses critères, et si la personne
   * peut le changer. Un objectif sans `goal` : le projet n'en a pas.
   */
  objectives: Record<number, ProjectObjective>;
  /** Lit l'objectif d'un projet ; `null` en cas d'échec, où celui d'avant reste et `objectiveReadFailed` le dit. */
  fetchObjective: (slug: string, id: number) => Promise<ProjectObjective | null>;
  /** La dernière lecture de l'objectif de ce projet a échoué : l'en-tête dit qu'il n'a pas pu se lire, jamais qu'il n'y en a pas. */
  objectiveReadFailed: Record<number, boolean>;
  /** Pose ou remplace l'objectif ; `null` en cas d'échec, la raison du serveur (4xx) dans `objectiveError`. */
  saveObjective: (slug: string, id: number, payload: ProjectObjectivePayload) => Promise<ProjectObjective | null>;
  /** Retire l'objectif ; `false` en cas d'échec. */
  clearObjective: (slug: string, id: number) => Promise<boolean>;
  /** Pourquoi le dernier enregistrement d'un objectif a été refusé, quand le serveur le dit ; vide sinon. */
  objectiveError: string | null;

  /** Réinitialise le store (ex : changement de workspace) */
  clearProjects: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProject: null,
  isLoading: false,
  error: null,
  objectives: {},
  objectiveError: null,
  objectiveReadFailed: {},

  clearProjects: () => set({ projects: [], activeProject: null, error: null, objectives: {}, objectiveError: null, objectiveReadFailed: {} }),

  setActiveProject: (project) => set({ activeProject: project }),

  fetchObjective: async (slug, id) => {
    try {
      const objective = await getProjectObjective(slug, id);
      set((state) => ({
        objectives: { ...state.objectives, [id]: objective },
        objectiveReadFailed: { ...state.objectiveReadFailed, [id]: false },
      }));
      return objective;
    } catch {
      set((state) => ({ objectiveReadFailed: { ...state.objectiveReadFailed, [id]: true } }));
      return null;
    }
  },

  saveObjective: async (slug, id, payload) => {
    try {
      const objective = await setProjectObjective(slug, id, payload);
      set((state) => ({ objectives: { ...state.objectives, [id]: objective }, objectiveError: null }));
      return objective;
    } catch (err) {
      // Un refus du serveur (4xx) dit quoi faire ; une panne du réseau ou du serveur, l'écran le dit avec ses mots (R133).
      const status = getErrorStatus(err);
      set({ objectiveError: status !== undefined && status >= 400 && status < 500 ? getErrorMessage(err) : null });
      return null;
    }
  },

  clearObjective: async (slug, id) => {
    try {
      const objective = await clearProjectObjective(slug, id);
      set((state) => ({ objectives: { ...state.objectives, [id]: objective } }));
      return true;
    } catch {
      return false;
    }
  },

  fetchProjects: async (slug) => {
    set({ isLoading: true, error: null });
    try {
      const projects = await listProjects(slug);
      set({ projects, isLoading: false });
      return projects;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't load the projects";
      set({ isLoading: false, error: message });
      return [];
    }
  },

  createProject: async (slug, payload) => {
    try {
      const project = await createProjectApi(slug, payload);
      set((state) => ({ projects: [project, ...state.projects] }));
      return project;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't create the project";
      set({ error: message });
      return null;
    }
  },

  importProject: async (slug, file, onProgress) => {
    try {
      const project = await importProjectBundleApi(slug, file, onProgress);
      set((state) => ({ projects: [project, ...state.projects], error: null }));
      return project;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return null;
    }
  },

  linkRepo: async (slug, id, payload) => {
    try {
      const res = await setProjectRepoApi(slug, id, payload);
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, repoProvider: res.repoProvider, repoFullName: res.repoFullName } : p,
        ),
        activeProject: state.activeProject?.id === id
          ? { ...state.activeProject, repoProvider: res.repoProvider, repoFullName: res.repoFullName }
          : state.activeProject,
      }));
      return res;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return null;
    }
  },

  setTestCommand: async (slug, id, testCommand) => {
    try {
      const saved = await setProjectTestCommandApi(slug, id, testCommand);
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, testCommand: saved } : p)),
        activeProject: state.activeProject?.id === id ? { ...state.activeProject, testCommand: saved } : state.activeProject,
      }));
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  unlinkRepo: async (slug, id) => {
    try {
      await unsetProjectRepoApi(slug, id);
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, repoProvider: null, repoFullName: null } : p,
        ),
        activeProject: state.activeProject?.id === id
          ? { ...state.activeProject, repoProvider: null, repoFullName: null }
          : state.activeProject,
      }));
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  updateProject: async (slug, id, payload) => {
    try {
      const updated = await updateProjectApi(slug, id, payload);
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        activeProject: state.activeProject?.id === id ? updated : state.activeProject,
      }));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't update the project";
      set({ error: message });
      return null;
    }
  },

  archiveProject: async (slug, id) => {
    try {
      const updated = await archiveProjectApi(slug, id);
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        activeProject: state.activeProject?.id === id ? updated : state.activeProject,
      }));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't archive the project";
      set({ error: message });
      return null;
    }
  },

  toggleFavorite: async (slug, id, next) => {
    // Mise à jour optimiste
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, isFavorite: next } : p)),
      activeProject: state.activeProject?.id === id ? { ...state.activeProject, isFavorite: next } : state.activeProject,
    }));
    try {
      const updated = next ? await favoriteProjectApi(slug, id) : await unfavoriteProjectApi(slug, id);
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        activeProject: state.activeProject?.id === id ? updated : state.activeProject,
      }));
      return updated;
    } catch (err) {
      // Revert en cas d'échec
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, isFavorite: !next } : p)),
        activeProject: state.activeProject?.id === id ? { ...state.activeProject, isFavorite: !next } : state.activeProject,
      }));
      const message = err instanceof Error ? err.message : "Couldn't update the favorites";
      set({ error: message });
      return null;
    }
  },

  deleteProject: async (slug, id) => {
    try {
      await deleteProjectApi(slug, id);
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        activeProject: state.activeProject?.id === id ? null : state.activeProject,
      }));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't delete the project";
      set({ error: message });
      return false;
    }
  },
}));

// ---------------------------------------------------------------------------
// Selectors (performance - évite les re-renders inutiles)
// ---------------------------------------------------------------------------

export const selectActiveProjects = (state: ProjectState) =>
  state.projects.filter((p) => p.status === "ACTIVE" || p.status === "PAUSED");

export const selectArchivedProjects = (state: ProjectState) =>
  state.projects.filter((p) => p.status === "ARCHIVED");
