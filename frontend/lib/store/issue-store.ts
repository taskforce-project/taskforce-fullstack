import { create } from "zustand";
import type {
  Issue,
  IssueStatus,
  IssueType,
  IssueComment,
  IssueActivity,
  CreateIssuePayload,
  UpdateIssuePayload,
} from "../api/issue-service";
import {
  listIssues,
  getIssue,
  createIssue as createIssueApi,
  updateIssue as updateIssueApi,
  deleteIssue as deleteIssueApi,
  listStatuses,
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

  // Issues
  fetchIssues: (slug: string, projectId: number) => Promise<Issue[]>;
  fetchIssue: (slug: string, projectId: number, issueId: number) => Promise<Issue | null>;
  createIssue: (slug: string, projectId: number, payload: CreateIssuePayload) => Promise<Issue | null>;
  updateIssue: (slug: string, projectId: number, issueId: number, payload: UpdateIssuePayload) => Promise<Issue | null>;
  deleteIssue: (slug: string, projectId: number, issueId: number) => Promise<void>;
  setActiveIssue: (issue: Issue | null) => void;

  // Statuts & types
  fetchStatuses: (slug: string, projectId: number) => Promise<IssueStatus[]>;
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

  clearIssues: () => set({ issues: [], activeIssue: null, statuses: [], types: [], comments: [], activity: [], error: null }),

  setActiveIssue: (issue) => set({ activeIssue: issue }),

  fetchIssues: async (slug, projectId) => {
    set({ isLoading: true, error: null });
    try {
      const issues = await listIssues(slug, projectId);
      set({ issues, isLoading: false });
      return issues;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors du chargement des issues";
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
      const message = err instanceof Error ? err.message : "Erreur lors du chargement de l'issue";
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
      const message = err instanceof Error ? err.message : "Erreur lors de la création de l'issue";
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
      const message = err instanceof Error ? err.message : "Erreur lors de la mise à jour de l'issue";
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
      const message = err instanceof Error ? err.message : "Erreur lors de la suppression de l'issue";
      set({ error: message });
    }
  },

  fetchStatuses: async (slug, projectId) => {
    try {
      const statuses = await listStatuses(slug, projectId);
      set({ statuses });
      return statuses;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors du chargement des statuts";
      set({ error: message });
      return [];
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
