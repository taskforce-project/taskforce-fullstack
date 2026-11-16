import { create } from "zustand";
import axios from "axios";
import { toast } from "sonner";

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
  type IssueSummary,
  type ProjectIssueRelation,
  type ProjectIssueRelations,
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
  listProjectRelations,
  listIssuesPage,
  ISSUES_PAGE_MAX,
} from "../api/issue-service";
import { listAttachmentCounts } from "../api/attachment-service";

/** Les pages d'issues lues en même temps, au plus, quand le workflow lit toutes celles d'un projet. */
export const WORKFLOW_PAGE_CONCURRENCY = 4;

/** Les issues du workflow d'un projet, sous-issues comprises (séance n°25, W1). */
export interface WorkflowIssues {
  projectId: number;
  issues: Issue[];
}

/** Le nombre de documents de chaque issue d'un projet. */
export interface DocumentCounts {
  projectId: number;
  counts: Record<number, number>;
}

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
  /** Projet dont les issues sont en cache (évite le refetch au changement d'onglet - PROD-2.7). */
  loadedProjectId: number | null;
  /**
   * Les liens entre les issues de chaque projet lu, par projet (R166) : ses relations, et ses sous-issues avec leur parent,
   * que `issues` ne porte pas (le premier niveau seul). Un projet absent n'est pas encore lu ; le temps réel du projet
   * tient les siens à jour. Une réponse en retard d'un projet quitté ne range que les liens de ce projet-là.
   */
  projectRelations: Record<number, ProjectIssueRelations>;
  /**
   * Toutes les issues du projet ouvert dans le workflow (séance n°25, W1), sous-issues comprises, sans les archivées : lues
   * page par page, jamais en un seul appel, puis tenues à jour comme `issues` (le temps réel et les gestes). `null` tant
   * qu'elles ne sont pas lues. `issues`, celles du tableau, ne portent que le premier niveau.
   */
  workflowIssues: WorkflowIssues | null;
  /** Le nombre de documents (pièces jointes) de chaque issue du projet du workflow. */
  documentCounts: DocumentCounts | null;
  /** L'activité de chaque issue lue pour l'inspecteur du workflow, à part de celle de la fiche ouverte (`activity`). */
  issueActivity: Record<number, IssueActivity[]>;

  // Issues
  fetchIssues: (slug: string, projectId: number) => Promise<Issue[]>;
  fetchIssue: (slug: string, projectId: number, issueId: number) => Promise<Issue | null>;
  createIssue: (slug: string, projectId: number, payload: CreateIssuePayload) => Promise<Issue | null>;
  updateIssue: (slug: string, projectId: number, issueId: number, payload: UpdateIssuePayload) => Promise<Issue | null>;
  deleteIssue: (slug: string, projectId: number, issueId: number) => Promise<boolean>;
  /** Suppression DIFFÉRÉE annulable : retrait optimiste + toast « Undo » (~6 s) ; l'appel API ne part
   *  qu'à l'expiration de la fenêtre. Le minuteur vit dans le store → survit à la navigation. */
  deleteIssueWithUndo: (slug: string, projectId: number, issueId: number) => void;
  /** Archive (true) / désarchive (false) - une issue archivée quitte les vues par défaut. */
  archiveIssue: (slug: string, projectId: number, issueId: number, archived: boolean) => Promise<Issue | null>;
  /** Épingle (true) / dépingle (false) - remonte en tête de board/liste. */
  pinIssue: (slug: string, projectId: number, issueId: number, pinned: boolean) => Promise<Issue | null>;
  setActiveIssue: (issue: Issue | null) => void;
  /** Patch local (événement temps réel STOMP) - insère ou met à jour sans appel API. */
  upsertIssueLocal: (issue: Issue) => void;
  /** Retrait local (événement temps réel STOMP). */
  removeIssueLocal: (issueId: number) => void;

  // Liens entre issues (R166)
  /** Lit les liens entre les issues du projet ; `null` en cas d'échec, où les liens d'avant restent. */
  fetchProjectRelations: (slug: string, projectId: number) => Promise<ProjectIssueRelations | null>;
  /** Un lien posé (événement temps réel STOMP) : ajouté, ou mis à jour s'il est déjà là ; rien pour un autre projet. */
  upsertRelationLocal: (projectId: number, relation: ProjectIssueRelation) => void;
  /** Un lien retiré (événement temps réel STOMP) ; rien pour un autre projet. */
  removeRelationLocal: (projectId: number, relationId: number) => void;

  // Le workflow (séance n°25, W1)
  /**
   * Lit toutes les issues du projet pour le workflow : la première page, puis les autres, quatre à la fois ; elles ne se
   * posent qu'une fois toutes lues (rien ne saute à l'écran). `null` en cas d'échec, où celles d'avant restent.
   */
  fetchWorkflowIssues: (slug: string, projectId: number) => Promise<Issue[] | null>;
  /** Lit le nombre de documents de chaque issue du projet ; `null` en cas d'échec, où celui d'avant reste. */
  fetchDocumentCounts: (slug: string, projectId: number) => Promise<Record<number, number> | null>;
  /** Lit l'activité d'une issue pour l'inspecteur ; `null` en cas d'échec, où celle d'avant reste. */
  fetchIssueActivity: (slug: string, projectId: number, issueId: number) => Promise<IssueActivity[] | null>;

  // Statuts & types
  fetchStatuses: (slug: string, projectId: number) => Promise<IssueStatus[]>;
  createStatus: (slug: string, projectId: number, payload: CreateIssueStatusPayload) => Promise<IssueStatus | null>;
  updateStatus: (slug: string, projectId: number, statusId: number, payload: UpdateIssueStatusPayload) => Promise<IssueStatus | null>;
  deleteStatus: (slug: string, projectId: number, statusId: number) => Promise<boolean>;
  fetchTypes: (slug: string, projectId: number) => Promise<IssueType[]>;

  // Commentaires
  fetchComments: (slug: string, projectId: number, issueId: number) => Promise<IssueComment[]>;
  addComment: (slug: string, projectId: number, issueId: number, content: string) => Promise<IssueComment | null>;
  updateComment: (slug: string, projectId: number, issueId: number, commentId: number, content: string) => Promise<IssueComment | null>;
  deleteComment: (slug: string, projectId: number, issueId: number, commentId: number) => Promise<boolean>;

  // Activité
  fetchActivity: (slug: string, projectId: number, issueId: number) => Promise<IssueActivity[]>;

  clearIssues: () => void;
}

// ---------------------------------------------------------------------------
// Liens entre issues : ce qu'une issue qui change ou disparaît leur fait
// ---------------------------------------------------------------------------

/** L'issue telle qu'un lien la nomme. */
function summaryOf(issue: Issue): IssueSummary {
  return { id: issue.id, sequenceNumber: issue.sequenceNumber, identifier: issue.identifier, title: issue.title, status: issue.status };
}

/**
 * Les liens après qu'une issue a changé (créée, éditée) : son nom et son statut à jour sur ses liens, et son parent tel
 * qu'elle le dit. Une issue archivée quitte les liens, comme la lecture du serveur la laisse de côté.
 */
function linksWithIssue(links: ProjectIssueRelations, issue: Issue): ProjectIssueRelations {
  if (issue.archived) return linksWithout(links, issue.id);
  const named = (end: IssueSummary): IssueSummary => (end.id === issue.id ? summaryOf(issue) : end);
  const subIssues = links.subIssues
    .filter((link) => link.issue.id !== issue.id)
    .map((link) => ({ parent: named(link.parent), issue: link.issue }));
  if (issue.parent) subIssues.push({ parent: issue.parent, issue: summaryOf(issue) });
  return {
    relations: links.relations.map((r) => ({ ...r, source: named(r.source), target: named(r.target) })),
    subIssues,
  };
}

/** Les liens sans ceux d'une issue supprimée (ses relations partent avec elle ; ses sous-issues n'ont plus de parent). */
function linksWithout(links: ProjectIssueRelations, issueId: number): ProjectIssueRelations {
  return {
    relations: links.relations.filter((r) => r.source.id !== issueId && r.target.id !== issueId),
    subIssues: links.subIssues.filter((link) => link.issue.id !== issueId && link.parent.id !== issueId),
  };
}

// ---------------------------------------------------------------------------
// Les issues du workflow : ce qu'une issue qui change ou disparaît leur fait
// ---------------------------------------------------------------------------

/**
 * Les issues du workflow après qu'une issue a changé : remplacée à sa place, ajoutée à la fin si elle est nouvelle dans ce
 * projet, retirée si elle est archivée ; rien pour une issue d'un autre projet.
 */
function workflowWith(current: WorkflowIssues | null, issue: Issue): WorkflowIssues | null {
  if (!current || current.projectId !== issue.projectId) return current;
  const index = current.issues.findIndex((i) => i.id === issue.id);
  if (issue.archived) return index < 0 ? current : { ...current, issues: current.issues.filter((i) => i.id !== issue.id) };
  if (index < 0) return { ...current, issues: [...current.issues, issue] };
  const issues = [...current.issues];
  issues[index] = issue;
  return { ...current, issues };
}

/** Les issues du workflow sans une issue supprimée. */
function workflowWithout(current: WorkflowIssues | null, issueId: number): WorkflowIssues | null {
  if (!current || !current.issues.some((i) => i.id === issueId)) return current;
  return { ...current, issues: current.issues.filter((i) => i.id !== issueId) };
}

/**
 * Le projet de la dernière lecture des issues du workflow, et celui de la dernière lecture de ses documents. Une réponse
 * en retard d'un projet quitté (la personne est passée du projet 3 au projet 5) ne se pose pas : elle remettrait le
 * projet ouvert sur son squelette, ou lui donnerait les documents d'un autre. Vider le store les oublie.
 */
let workflowIssuesFor: number | null = null;
let documentCountsFor: number | null = null;

/** Lance `task` sur chaque élément, `limit` à la fois ; rend les résultats dans l'ordre des éléments. */
async function pooled<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
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
  projectRelations: {},
  workflowIssues: null,
  documentCounts: null,
  issueActivity: {},

  clearIssues: () => {
    workflowIssuesFor = null;
    documentCountsFor = null;
    set({
      issues: [], activeIssue: null, statuses: [], types: [], comments: [], activity: [], error: null, loadedProjectId: null,
      projectRelations: {}, workflowIssues: null, documentCounts: null, issueActivity: {},
    });
  },

  fetchWorkflowIssues: async (slug, projectId) => {
    workflowIssuesFor = projectId;
    try {
      const first = await listIssuesPage(slug, projectId, 0, ISSUES_PAGE_MAX);
      const rest = Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, i) => i + 1);
      const pages = await pooled(rest, WORKFLOW_PAGE_CONCURRENCY, (page) => listIssuesPage(slug, projectId, page, ISSUES_PAGE_MAX));
      // Une issue a pu glisser d'une page à l'autre pendant la lecture (une création, une épingle) : une fois chacune.
      const byId = new Map<number, Issue>();
      for (const page of [first, ...pages]) for (const issue of page.content) byId.set(issue.id, issue);
      const issues = [...byId.values()].filter((issue) => !issue.archived);
      // Un autre projet a été demandé depuis : cette lecture ne se pose pas.
      if (workflowIssuesFor !== projectId) return null;
      set({ workflowIssues: { projectId, issues } });
      return issues;
    } catch {
      return null;
    }
  },

  fetchDocumentCounts: async (slug, projectId) => {
    documentCountsFor = projectId;
    try {
      const rows = await listAttachmentCounts(slug, projectId);
      const counts: Record<number, number> = {};
      for (const row of rows) counts[row.issueId] = row.count;
      if (documentCountsFor !== projectId) return null;
      set({ documentCounts: { projectId, counts } });
      return counts;
    } catch {
      return null;
    }
  },

  fetchIssueActivity: async (slug, projectId, issueId) => {
    try {
      const entries = await listActivity(slug, projectId, issueId);
      set((state) => ({ issueActivity: { ...state.issueActivity, [issueId]: entries } }));
      return entries;
    } catch {
      return null;
    }
  },

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
      const message = extractError(err, "Couldn't load the issues");
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
      const message = extractError(err, "Couldn't load the issue");
      set({ error: message });
      return null;
    }
  },

  createIssue: async (slug, projectId, payload) => {
    try {
      const issue = await createIssueApi(slug, projectId, payload);
      // Idempotent : l'événement temps réel STOMP a pu déjà insérer l'issue (upsertIssueLocal)
      // avant la résolution du POST → sans dédup elle s'affichait en double (ISS-01).
      set((state) => ({
        issues: state.issues.some((i) => i.id === issue.id)
          ? state.issues.map((i) => (i.id === issue.id ? issue : i))
          : [issue, ...state.issues],
        workflowIssues: workflowWith(state.workflowIssues, issue),
      }));
      return issue;
    } catch (err) {
      const message = extractError(err, "Couldn't create the issue");
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
        workflowIssues: workflowWith(state.workflowIssues, updated),
      }));
      return updated;
    } catch {
      // On ne pose PLUS store.error ici : un échec d'édition depuis le sheet (ex. refus VIEWER
      // « lecture seule ») polluait la bannière passive du board, invisible sous l'overlay du sheet
      // puis révélée à sa fermeture (WS-10). Le refus est remonté via le retour null ; l'appelant
      // (issue-sheet.callUpdate) affiche un toast au bon moment.
      return null;
    }
  },

  deleteIssue: async (slug, projectId, issueId) => {
    try {
      await deleteIssueApi(slug, projectId, issueId);
      set((state) => ({
        issues: state.issues.filter((i) => i.id !== issueId),
        activeIssue: state.activeIssue?.id === issueId ? null : state.activeIssue,
        workflowIssues: workflowWithout(state.workflowIssues, issueId),
      }));
      return true;
    } catch (err) {
      // On garde le message d'erreur dans le store (bannière/diagnostic) mais on signale l'échec
      // par le retour `false` : l'appelant affiche un toast au bon moment (cf. WS-10 sur updateIssue).
      const message = extractError(err, "Couldn't delete the issue");
      set({ error: message });
      return false;
    }
  },

  deleteIssueWithUndo: (slug, projectId, issueId) => {
    const issues = get().issues;
    const index = issues.findIndex((i) => i.id === issueId);
    if (index < 0) {
      // Issue absente du cache (autre vue) : suppression directe sans undo.
      void get().deleteIssue(slug, projectId, issueId);
      return;
    }
    const issue = issues[index];
    const wasActive = get().activeIssue?.id === issueId;
    // Celle du workflow, qu'elle y soit lue sous une autre forme (une sous-issue) ou pas du tout.
    const inWorkflow = get().workflowIssues?.issues.find((i) => i.id === issueId) ?? null;

    // Ré-insère l'issue à sa place (idempotent : ne double pas si déjà présente).
    const restore = () =>
      set((state) => {
        const workflowIssues = inWorkflow ? workflowWith(state.workflowIssues, inWorkflow) : state.workflowIssues;
        if (state.issues.some((i) => i.id === issueId)) return { workflowIssues };
        const arr = [...state.issues];
        arr.splice(Math.min(index, arr.length), 0, issue);
        return { issues: arr, workflowIssues };
      });

    // 1) Retrait optimiste immédiat.
    set((state) => ({
      issues: state.issues.filter((i) => i.id !== issueId),
      activeIssue: wasActive ? null : state.activeIssue,
      workflowIssues: workflowWithout(state.workflowIssues, issueId),
    }));

    // 2) Le vrai DELETE ne part qu'à l'expiration de la fenêtre. Minuteur porté par le store (module
    //    singleton) → survit au démontage/à la navigation, donc la suppression n'est jamais perdue.
    let undone = false;
    const timer = setTimeout(async () => {
      if (undone) return;
      try {
        await deleteIssueApi(slug, projectId, issueId);
      } catch (err) {
        restore();
        set({ error: extractError(err, "Couldn't delete the issue") });
        toast.error("Couldn't delete issue");
      }
    }, 6000);

    // 3) Toast avec Undo : annule le minuteur + restaure.
    toast.success(`${issue.identifier} deleted`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          clearTimeout(timer);
          restore();
        },
      },
    });
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
        workflowIssues: archived ? workflowWithout(state.workflowIssues, issueId) : workflowWith(state.workflowIssues, updated),
      }));
      return updated;
    } catch (err) {
      const message = extractError(err, "Couldn't archive the issue");
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
        workflowIssues: workflowWith(state.workflowIssues, updated),
      }));
      return updated;
    } catch (err) {
      const message = extractError(err, "Couldn't pin the issue");
      set({ error: message });
      return null;
    }
  },

  upsertIssueLocal: (issue) =>
    set((state) => {
      const exists = state.issues.some((i) => i.id === issue.id);
      const links = state.projectRelations[issue.projectId];
      return {
        issues: exists
          ? state.issues.map((i) => (i.id === issue.id ? issue : i))
          : [issue, ...state.issues],
        activeIssue: state.activeIssue?.id === issue.id ? issue : state.activeIssue,
        ...(links ? { projectRelations: { ...state.projectRelations, [issue.projectId]: linksWithIssue(links, issue) } } : {}),
        workflowIssues: workflowWith(state.workflowIssues, issue),
      };
    }),

  removeIssueLocal: (issueId) =>
    set((state) => {
      // L'événement ne dit pas le projet de l'issue : ses liens partent de chaque projet lu qui en a.
      const touched = Object.entries(state.projectRelations).filter(([, links]) =>
        links.relations.some((r) => r.source.id === issueId || r.target.id === issueId)
          || links.subIssues.some((link) => link.issue.id === issueId || link.parent.id === issueId));
      const projectRelations = { ...state.projectRelations };
      for (const [projectId, links] of touched) projectRelations[Number(projectId)] = linksWithout(links, issueId);
      return {
        issues: state.issues.filter((i) => i.id !== issueId),
        activeIssue: state.activeIssue?.id === issueId ? null : state.activeIssue,
        workflowIssues: workflowWithout(state.workflowIssues, issueId),
        ...(touched.length > 0 ? { projectRelations } : {}),
      };
    }),

  fetchProjectRelations: async (slug, projectId) => {
    try {
      const links = await listProjectRelations(slug, projectId);
      set((state) => ({ projectRelations: { ...state.projectRelations, [projectId]: links } }));
      return links;
    } catch {
      // Une lecture de fond : l'écran garde les liens d'avant de ce projet, l'appelant branche sur `null`.
      return null;
    }
  },

  upsertRelationLocal: (projectId, relation) =>
    set((state) => {
      const links = state.projectRelations[projectId];
      if (!links) return {};
      const known = links.relations.some((r) => r.id === relation.id);
      const relations = known
        ? links.relations.map((r) => (r.id === relation.id ? relation : r))
        : [...links.relations, relation];
      return { projectRelations: { ...state.projectRelations, [projectId]: { relations, subIssues: links.subIssues } } };
    }),

  removeRelationLocal: (projectId, relationId) =>
    set((state) => {
      const links = state.projectRelations[projectId];
      if (!links) return {};
      const relations = links.relations.filter((r) => r.id !== relationId);
      return { projectRelations: { ...state.projectRelations, [projectId]: { relations, subIssues: links.subIssues } } };
    }),

  fetchStatuses: async (slug, projectId) => {
    try {
      const statuses = await listStatuses(slug, projectId);
      set({ statuses });
      return statuses;
    } catch (err) {
      const message = extractError(err, "Couldn't load the statuses");
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
      const message = extractError(err, "Couldn't create the status");
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
      const message = extractError(err, "Couldn't update the status");
      set({ error: message });
      return null;
    }
  },

  deleteStatus: async (slug, projectId, statusId) => {
    try {
      await deleteStatusApi(slug, projectId, statusId);
      set((state) => ({ statuses: state.statuses.filter((s) => s.id !== statusId) }));
      return true;
    } catch (err) {
      // Retour `false` pour que l'appelant toaste l'échec (ex. 409 colonne non vide) au bon moment.
      const message = extractError(err, "Couldn't delete the status");
      set({ error: message });
      return false;
    }
  },

  fetchTypes: async (slug, projectId) => {
    try {
      const types = await listTypes(slug, projectId);
      set({ types });
      return types;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't load the issue types";
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
      const message = err instanceof Error ? err.message : "Couldn't load the comments";
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
      const message = err instanceof Error ? err.message : "Couldn't add the comment";
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
      const message = err instanceof Error ? err.message : "Couldn't update the comment";
      set({ error: message });
      return null;
    }
  },

  deleteComment: async (slug, projectId, issueId, commentId) => {
    try {
      await deleteCommentApi(slug, projectId, issueId, commentId);
      set((state) => ({ comments: state.comments.filter((c) => c.id !== commentId) }));
      return true;
    } catch (err) {
      // Retour false (pas de throw) : l'appelant (issue-sheet) toaste l'echec au bon moment.
      const message = err instanceof Error ? err.message : "Couldn't delete the comment";
      set({ error: message });
      return false;
    }
  },

  fetchActivity: async (slug, projectId, issueId) => {
    try {
      const activity = await listActivity(slug, projectId, issueId);
      set({ activity });
      return activity;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't load the activity";
      set({ error: message });
      return [];
    }
  },
}));
