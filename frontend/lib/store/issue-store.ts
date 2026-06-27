import { create } from "zustand";
import axios from "axios";

/** Extrait le message lisible depuis une erreur Axios ou générique */
function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; error?: string } | undefined;
    return data?.message ?? data?.error ?? err.message;
  }
  return err instanceof Error ? err.message : fallback;
}
import {
  type Issue,
  type IssueStatus,
  type IssueType,
  type IssueComment,
  type IssueActivity,
  type CreateIssuePayload,
  type UpdateIssuePayload,
  type CreateIssueStatusPayload,
  type UpdateIssueStatusPayload,
  listIssues,
  getIssue,
  createIssue as createIssueApi,
  updateIssue as updateIssueApi,
  deleteIssue as deleteIssueApi,
  setIssueArchived as setIssueArchivedApi,
  setIssuePinned as setIssuePinnedApi,
  listStatuses,
  createStatus as createStatusApi,
  updateStatus as updateStatusApi,
  deleteStatus as deleteStatusApi,
  listTypes,
  listComments,
  addComment as addCommentApi,
  updateComment as updateCommentApi,
  deleteComment as deleteCommentApi,
  listActivity,
} from "../api/issue-service";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface IssueState {
  issues: Issue[];
  activeIssue: Issue | null;
  statuses: IssueStatus[];
  types: IssueType[];
  comments: IssueComment[];
  activity: IssueActivity[];
  isLoading: boolean;
  error: string | null;
  /** Projet dont les issues sont en cache (évite le refetch au changement d'onglet — PROD-2.7). */
  loadedProjectId: number | null;

  // Issues
  fetchIssues: (slug: string, projectId: number) => Promise<Issue[]>;
  fetchIssue: (slug: string, projectId: number, issueId: number) => Promise<Issue | null>;
  createIssue: (slug: string, projectId: number, payload: CreateIssuePayload) => Promise<Issue | null>;
  updateIssue: (slug: string, projectId: number, issueId: number, payload: UpdateIssuePayload) => Promise<Issue | null>;
  deleteIssue: (slug: string, projectId: number, issueId: number) => Promise<void>;
  /** Archive (true) / désarchive (false) — une issue archivée quitte les vues par défaut. */
  archiveIssue: (slug: string, projectId: number, issueId: number, archived: boolean) => Promise<Issue | null>;
  /** Épingle (true) / dépingle (false) — remonte en tête de board/liste. */
  pinIssue: (slug: string, projectId: number, issueId: number, pinned: boolean) => Promise<Issue | null>;
  setActiveIssue: (issue: Issue | null) => void;
  /** Patch local (événement temps réel STOMP) — insère ou met à jour sans appel API. */
  upsertIssueLocal: (issue: Issue) => void;
  /** Retrait local (événement temps réel STOMP). */
  removeIssueLocal: (issueId: number) => void;

  // Statuts & types
  fetchStatuses: (slug: string, projectId: number) => Promise<IssueStatus[]>;
  createStatus: (slug: string, projectId: number, payload: CreateIssueStatusPayload) => Promise<IssueStatus | null>;
  updateStatus: (slug: string, projectId: number, statusId: number, payload: UpdateIssueStatusPayload) => Promise<IssueStatus | null>;
  deleteStatus: (slug: string, projectId: number, statusId: number) => Promise<void>;
  fetchTypes: (slug: string, projectId: number) => Promise<IssueType[]>;

  // Commentaires
  fetchComments: (slug: string, projectId: number, issueId: number) => Promise<IssueComment[]>;
  addComment: (slug: string, projectId: number, issueId: number, content: string) => Promise<IssueComment | null>;
  updateComment: (slug: string, projectId: number, issueId: number, commentId: number, content: string) => Promise<IssueComment | null>;
  deleteComment: (slug: string, projectId: number, issueId: number, commentId: number) => Promise<void>;

  // Activité
  fetchActivity: (slug: string, projectId: number, issueId: number) => Promise<IssueActivity[]>;

  clearIssues: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useIssueStore = create<IssueState>((set, get) => ({
  issues: [],
  activeIssue: null,
  statuses: [],
  types: [],
  comments: [],
  activity: [],
  isLoading: false,
  error: null,
  loadedProjectId: null,

  clearIssues: () => set({ issues: [], activeIssue: null, statuses: [], types: [], comments: [], activity: [], error: null, loadedProjectId: null }),

  setActiveIssue: (issue) => set({ activeIssue: issue }),

  fetchIssues: async (slug, projectId) => {
    // Cache-first : si les issues de ce projet sont déjà chargées, on évite le refetch
    // (bascule Board/List/Backlog instantanée). Le temps réel + les mutations gardent le cache à jour.
    const state = get();
    if (state.loadedProjectId === projectId) {
      return state.issues;
    }
    set({ isLoading: true, error: null });
    try {
      const issues = await listIssues(slug, projectId);
      set({ issues, isLoading: false, loadedProjectId: projectId });
      return issues;
    } catch (err) {
      const message = extractError(err, "Erreur lors du chargement des issues");
      set({ isLoading: false, error: message });
      return [];
    }
  },

  fetchIssue: async (slug, projectId, issueId) => {
    try {
      const issue = await getIssue(slug, projectId, issueId);
      set({ activeIssue: issue });
      return issue;
    } catch (err) {
      const message = extractError(err, "Erreur lors du chargement de l'issue");
      set({ error: message });
      return null;
    }
  },

  createIssue: async (slug, projectId, payload) => {
    try {
      const issue = await createIssueApi(slug, projectId, payload);
      set((state) => ({ issues: [issue, ...state.issues] }));
      return issue;
    } catch (err) {
      const message = extractError(err, "Erreur lors de la création de l'issue");
      set({ error: message });
      return null;
    }
  },

  updateIssue: async (slug, projectId, issueId, payload) => {
    try {
      const updated = await updateIssueApi(slug, projectId, issueId, payload);
      set((state) => ({
        issues: state.issues.map((i) => (i.id === updated.id ? updated : i)),
        activeIssue: state.activeIssue?.id === updated.id ? updated : state.activeIssue,
      }));
      return updated;
    } catch (err) {
      const message = extractError(err, "Erreur lors de la mise à jour de l'issue");
      set({ error: message });
      return null;
    }
  },

  deleteIssue: async (slug, projectId, issueId) => {
    try {
      await deleteIssueApi(slug, projectId, issueId);
      set((state) => ({
        issues: state.issues.filter((i) => i.id !== issueId),
        activeIssue: state.activeIssue?.id === issueId ? null : state.activeIssue,
      }));
    } catch (err) {
      const message = extractError(err, "Erreur lors de la suppression de l'issue");
      set({ error: message });
    }
  },

  archiveIssue: async (slug, projectId, issueId, archived) => {
    try {
      const updated = await setIssueArchivedApi(slug, projectId, issueId, archived);
      set((state) => ({
        // Une issue archivée disparaît des vues par défaut (board/list).
        issues: archived
          ? state.issues.filter((i) => i.id !== issueId)
          : state.issues.map((i) => (i.id === updated.id ? updated : i)),
        activeIssue: state.activeIssue?.id === updated.id ? updated : state.activeIssue,
      }));
      return updated;
    } catch (err) {
      const message = extractError(err, "Erreur lors de l'archivage de l'issue");
      set({ error: message });
      return null;
    }
  },

  pinIssue: async (slug, projectId, issueId, pinned) => {
    try {
      const updated = await setIssuePinnedApi(slug, projectId, issueId, pinned);
      set((state) => ({
        issues: state.issues.map((i) => (i.id === updated.id ? updated : i)),
        activeIssue: state.activeIssue?.id === updated.id ? updated : state.activeIssue,
      }));
      return updated;
    } catch (err) {
      const message = extractError(err, "Erreur lors de l'épinglage de l'issue");
      set({ error: message });
      return null;
    }
  },

  upsertIssueLocal: (issue) =>
    set((state) => {
      const exists = state.issues.some((i) => i.id === issue.id);
      return {
        issues: exists
          ? state.issues.map((i) => (i.id === issue.id ? issue : i))
          : [issue, ...state.issues],
        activeIssue: state.activeIssue?.id === issue.id ? issue : state.activeIssue,
      };
    }),

  removeIssueLocal: (issueId) =>
    set((state) => ({
      issues: state.issues.filter((i) => i.id !== issueId),
      activeIssue: state.activeIssue?.id === issueId ? null : state.activeIssue,
    })),

  fetchStatuses: async (slug, projectId) => {
    try {
      const statuses = await listStatuses(slug, projectId);
      set({ statuses });
      return statuses;
    } catch (err) {
      const message = extractError(err, "Erreur lors du chargement des statuts");
      set({ error: message });
      return [];
    }
  },

  createStatus: async (slug, projectId, payload) => {
    try {
      const status = await createStatusApi(slug, projectId, payload);
      set((state) => ({ statuses: [...state.statuses, status] }));
      return status;
    } catch (err) {
      const message = extractError(err, "Erreur lors de la création du statut");
      set({ error: message });
      return null;
    }
  },

  updateStatus: async (slug, projectId, statusId, payload) => {
    try {
      const updated = await updateStatusApi(slug, projectId, statusId, payload);
      set((state) => ({ statuses: state.statuses.map((s) => (s.id === updated.id ? updated : s)) }));
      return updated;
    } catch (err) {
      const message = extractError(err, "Erreur lors de la mise à jour du statut");
      set({ error: message });
      return null;
    }
  },

  deleteStatus: async (slug, projectId, statusId) => {
    try {
      await deleteStatusApi(slug, projectId, statusId);
      set((state) => ({ statuses: state.statuses.filter((s) => s.id !== statusId) }));
    } catch (err) {
      const message = extractError(err, "Erreur lors de la suppression du statut");
      set({ error: message });
    }
  },

  fetchTypes: async (slug, projectId) => {
    try {
      const types = await listTypes(slug, projectId);
      set({ types });
      return types;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors du chargement des types";
      set({ error: message });
      return [];
    }
  },

  fetchComments: async (slug, projectId, issueId) => {
    try {
      const comments = await listComments(slug, projectId, issueId);
      set({ comments });
      return comments;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors du chargement des commentaires";
      set({ error: message });
      return [];
    }
  },

  addComment: async (slug, projectId, issueId, content) => {
    try {
      const comment = await addCommentApi(slug, projectId, issueId, content);
      set((state) => ({ comments: [...state.comments, comment] }));
      return comment;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'ajout du commentaire";
      set({ error: message });
      return null;
    }
  },

  updateComment: async (slug, projectId, issueId, commentId, content) => {
    try {
      const updated = await updateCommentApi(slug, projectId, issueId, commentId, content);
      set((state) => ({
        comments: state.comments.map((c) => (c.id === updated.id ? updated : c)),
      }));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de la mise à jour du commentaire";
      set({ error: message });
      return null;
    }
  },

  deleteComment: async (slug, projectId, issueId, commentId) => {
    try {
      await deleteCommentApi(slug, projectId, issueId, commentId);
      set((state) => ({ comments: state.comments.filter((c) => c.id !== commentId) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de la suppression du commentaire";
      set({ error: message });
    }
  },

  fetchActivity: async (slug, projectId, issueId) => {
    try {
      const activity = await listActivity(slug, projectId, issueId);
      set({ activity });
      return activity;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors du chargement de l'activité";
      set({ error: message });
      return [];
    }
  },
}));
