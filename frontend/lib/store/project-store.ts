import { create } from "zustand";
import type {
  Project,
  CreateProjectPayload,
  UpdateProjectPayload,
} from "../api/project-service";
import {
  listProjects,
  createProject as createProjectApi,
  updateProject as updateProjectApi,
  archiveProject as archiveProjectApi,
  deleteProject as deleteProjectApi,
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

  /** Met à jour un projet dans le store */
  updateProject: (slug: string, id: number, payload: UpdateProjectPayload) => Promise<Project | null>;

  /** Archive un projet dans le store */
  archiveProject: (slug: string, id: number) => Promise<Project | null>;

  /** Supprime un projet du store */
  deleteProject: (slug: string, id: number) => Promise<void>;

  /** Définit le projet actif */
  setActiveProject: (project: Project | null) => void;

  /** Réinitialise le store (ex : changement de workspace) */
  clearProjects: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  isLoading: false,
  error: null,

  clearProjects: () => set({ projects: [], activeProject: null, error: null }),

  setActiveProject: (project) => set({ activeProject: project }),

  fetchProjects: async (slug) => {
    set({ isLoading: true, error: null });
    try {
      const projects = await listProjects(slug);
      set({ projects, isLoading: false });
      return projects;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors du chargement des projets";
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
      const message = err instanceof Error ? err.message : "Erreur lors de la création du projet";
      set({ error: message });
      return null;
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
      const message = err instanceof Error ? err.message : "Erreur lors de la mise à jour du projet";
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
      const message = err instanceof Error ? err.message : "Erreur lors de l'archivage du projet";
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de la suppression du projet";
      set({ error: message });
    }
  },
}));

// ---------------------------------------------------------------------------
// Selectors (performance — évite les re-renders inutiles)
// ---------------------------------------------------------------------------

export const selectActiveProjects = (state: ProjectState) =>
  state.projects.filter((p) => p.status === "ACTIVE" || p.status === "PAUSED");

export const selectArchivedProjects = (state: ProjectState) =>
  state.projects.filter((p) => p.status === "ARCHIVED");
