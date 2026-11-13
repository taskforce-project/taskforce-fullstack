import { create } from "zustand";
import {
  getDeliveryProviders,
  getIssueRun,
  listOpenApprovals,
  listWorkspaceRuns,
  delegateIssue,
  getRunnerStatus,
  getRunActivity,
  applyRun as applyRunApi,
  decideApproval as decideApprovalApi,
  discardRun as discardRunApi,
  markRunDone as markRunDoneApi,
  retryRun as retryRunApi,
  stopRun as stopRunApi,
  downloadEvidence as downloadEvidenceApi,
  getEvidence,
  provisionRunner as provisionRunnerApi,
  getMissionChanges,
  getMissionFileDiff,
  revertMissionFile,
  askForChanges as askForChangesApi,
  sendCorrection as sendCorrectionApi,
  listProjectRuns,
  getProjectRun,
  type ChangeComment,
  type DeliveryProvider,
  type DeliveryRun,
  type DeliveryRunActivity,
  type MissionChanges,
  type MissionEvidence,
  type MissionFileDiff,
  type OpenApproval,
  type ProjectRun,
  type ProjectRunStep,
  type RunnerProvision,
  type RunnerStatus,
} from "../api/delivery-service";
import { getErrorMessage, getErrorStatus } from "../api/client";
import { parseServerDate } from "../utils/server-date";

// ---------------------------------------------------------------------------
// Store de délégation à un agent (TF-AGENT-DELIVERY). Un domaine = un store.
// Erreurs avalées (renvoie null/[]), l'appelant branche sur le retour.
// ---------------------------------------------------------------------------

interface DeliveryState {
  /** Agents de la délégation pour le workspace (chargés à la demande). */
  providers: DeliveryProvider[];
  /** Agents par projet : prêts ou non selon le projet (dépôt lié pour Copilot). */
  projectProviders: Record<number, DeliveryProvider[]>;
  providersLoading: boolean;
  /** Dernier run par issueId (`null` = chargé mais aucune délégation). */
  runs: Record<number, DeliveryRun | null>;
  /** Runs de délégation du workspace (vue « workflow »), les plus récents d'abord. */
  workspaceRuns: DeliveryRun[];
  /**
   * Les missions de chaque projet lu (R166), avec leur étape en cours, leurs liens et leurs demandes ouvertes : les pages
   * lues, les plus récentes d'abord. Le topic des missions du projet les tient à jour (`useProjectLive`).
   */
  projectRuns: Record<number, ProjectRunsState>;
  /**
   * Ce qui attend la personne (R128, séance n°19) : ses demandes encore ouvertes, une ligne par mission. La liste de
   * l'arrivée, le nombre de la barre de gauche et le volet « Waiting for you » lisent ceci, jamais les notifications.
   */
  openApprovals: OpenApproval[];
  /** Runner local de l'utilisateur (ADR-013). `null` = pas encore chargé. Jamais de secret ici. */
  runner: RunnerStatus | null;
  /** Activité par runId : chronologie cumulée (dans l'ordre) et demandes de validation du run (lot 5). */
  activity: Record<number, DeliveryRunActivity>;
  /** Par runId : pourquoi le dernier geste sur la carte de résultat n'a pas abouti (GitHub refuse, conflits...). */
  resultErrors: Record<number, string>;
  /** Le dossier de preuve par runId, tel que la vue du travail l'a lu ; `null` : pas (encore) de dossier. */
  evidence: Record<number, MissionEvidence | null>;
  /** Par runId : les fichiers changés et ce que la personne peut en faire (R139). */
  missionChanges: Record<number, MissionChanges>;
  /** Par runId puis par fichier : le diff lu ; `null` : il n'a pas pu se lire. */
  fileDiffs: Record<number, Record<string, MissionFileDiff | null>>;
  /** Par runId : les commentaires de relecture en cours, pas encore envoyés (ils survivent à un changement de volet). */
  changeComments: Record<number, DraftChangeComment[]>;
  /**
   * Par runId puis par fichier (`""` : la relecture) : pourquoi le dernier geste a été refusé. Une raison vide : il a échoué
   * sans raison à montrer, l'écran le dit avec ses mots.
   */
  changeErrors: Record<number, Record<string, string>>;

  fetchProviders: (slug: string) => Promise<DeliveryProvider[]>;
  fetchProjectProviders: (slug: string, projectId: number) => Promise<DeliveryProvider[]>;
  fetchRun: (slug: string, issueId: number) => Promise<DeliveryRun | null>;
  fetchWorkspaceRuns: (slug: string) => Promise<DeliveryRun[]>;
  /**
   * Lit une page des missions du projet : la première remplace ce qui était lu, les suivantes s'ajoutent. Rend les lignes
   * du projet ; `null` en cas d'échec, où celles d'avant restent.
   */
  fetchProjectRuns: (slug: string, projectId: number, page?: number) => Promise<ProjectRun[] | null>;
  /**
   * Relit une mission du projet (le topic l'a annoncée) : sa ligne est remplacée, ou une mission nouvelle prend sa place
   * dans l'ordre du serveur. `null` en cas d'échec ; une mission que la personne ne voit plus quitte la liste.
   */
  fetchProjectRun: (slug: string, projectId: number, runId: number) => Promise<ProjectRun | null>;
  /** Pose la nouvelle étape en cours d'une mission lue (le topic l'a annoncée) ; `false` si elle n'est pas lue ou déjà plus loin. */
  applyProjectRunStep: (projectId: number, runId: number, step: ProjectRunStep) => boolean;
  /** Relit ce qui attend la personne ; `null` en cas d'échec, où la liste d'avant reste. */
  fetchOpenApprovals: (slug: string) => Promise<OpenApproval[] | null>;
  delegate: (slug: string, issueId: number, providerKey: string, model?: string) => Promise<DeliveryRun | null>;
  fetchRunner: () => Promise<RunnerStatus | null>;
  /** Renvoie les identifiants (secret compris) à l'appelant SANS les garder : le secret ne vit pas dans l'état global. */
  provisionRunner: () => Promise<RunnerProvision | null>;
  /** Lit la suite de la chronologie d'un run (après le dernier événement connu) et ses demandes. */
  fetchActivity: (slug: string, runId: number) => Promise<DeliveryRunActivity | null>;
  /** Autorise une fois, ou pour le reste de la mission (`forMission`, R46), ou refuse ; `true` si la décision est enregistrée. */
  decideApproval: (slug: string, runId: number, approvalId: number, allow: boolean, forMission?: boolean) => Promise<boolean>;
  /** Télécharge le dossier de preuve d'un run ; `false` si le run n'en a pas (run de la v1) ou en cas d'erreur. */
  downloadEvidence: (slug: string, runId: number, format: "json" | "md") => Promise<boolean>;
  /**
   * Relit le dossier de preuve d'un run, pour le montrer pendant qu'il se construit ; `null` sans dossier (rien d'écrit
   * encore, run de la v1) ou en cas d'erreur, où le dossier lu d'avant reste.
   */
  fetchEvidence: (slug: string, runId: number) => Promise<MissionEvidence | null>;
  /** Les gestes de la carte de résultat (R78) ; `false` (ou `null`) en cas d'échec, la raison dans `resultErrors`. */
  applyRun: (slug: string, issueId: number, runId: number, reason?: string) => Promise<boolean>;
  discardRun: (slug: string, issueId: number, runId: number) => Promise<boolean>;
  /** Une mission qui n'a rien changé : l'issue se termine (rejeu de la 1.8.0). */
  markRunDone: (slug: string, issueId: number, runId: number) => Promise<boolean>;
  retryRun: (slug: string, issueId: number, runId: number, note: string) => Promise<DeliveryRun | null>;
  /** Relit les fichiers de la mission ; `null` en cas d'échec, où la liste d'avant reste. */
  fetchMissionChanges: (slug: string, runId: number) => Promise<MissionChanges | null>;
  /** Lit le diff d'un fichier ; `null` en cas d'échec. */
  fetchFileDiff: (slug: string, runId: number, path: string) => Promise<MissionFileDiff | null>;
  /** Demande de remettre un fichier comme avant ; `false` en cas de refus, la raison dans `changeErrors`. */
  revertFile: (slug: string, runId: number, path: string) => Promise<boolean>;
  addChangeComment: (runId: number, comment: ChangeComment) => void;
  removeChangeComment: (runId: number, id: string) => void;
  /** Envoie les commentaires ; rend la mission qui repart, `null` en cas d'échec, la raison dans `changeErrors`. */
  askForChanges: (slug: string, issueId: number, runId: number) => Promise<DeliveryRun | null>;
  /** Passe une correction à l'agent ; `false` en cas de refus, la raison dans `changeErrors`. */
  sendCorrection: (slug: string, runId: number, text: string) => Promise<boolean>;
  /** « Stop » pendant le travail (R138) : `false` en cas d'échec, l'écran le dit. */
  stopRun: (slug: string, issueId: number, runId: number) => Promise<boolean>;
}

/** Un commentaire de relecture pas encore envoyé. */
export interface DraftChangeComment extends ChangeComment {
  id: string;
}

/** Les missions lues d'un projet : les lignes des pages lues, la dernière page lue, s'il en reste, et combien il y en a. */
export interface ProjectRunsState {
  rows: ProjectRun[];
  page: number;
  last: boolean;
  total: number;
}

/** Les lignes d'une page ajoutées à celles déjà lues, une fois chacune (une mission a pu glisser d'une page à l'autre). */
function appendRows(rows: ProjectRun[], next: ProjectRun[]): ProjectRun[] {
  const fresh = new Map(next.map((row) => [row.run.id, row]));
  return [...rows.filter((row) => !fresh.has(row.run.id)), ...next];
}

/** L'ordre de la liste du serveur : la mission créée la plus récemment d'abord, puis le plus grand numéro. */
function newerFirst(a: ProjectRun, b: ProjectRun): number {
  const created = (row: ProjectRun): number => (row.run.createdAt ? parseServerDate(row.run.createdAt).getTime() : 0);
  return created(b) - created(a) || b.run.id - a.run.id;
}

/**
 * La mission relue, à sa place parmi les lignes du projet. Une mission nouvelle prend sa place dans l'ordre du serveur ;
 * une mission plus ancienne que les pages lues y reste, elle viendra avec sa page.
 */
function withRow(current: ProjectRunsState, row: ProjectRun): ProjectRunsState {
  if (current.rows.some((r) => r.run.id === row.run.id)) {
    return { ...current, rows: current.rows.map((r) => (r.run.id === row.run.id ? row : r)) };
  }
  const oldest = current.rows.at(-1);
  if (!current.last && oldest && newerFirst(oldest, row) < 0) return current;
  return { ...current, rows: [...current.rows, row].sort(newerFirst), total: current.total + 1 };
}

/** La mission relue, aussi dans la liste de l'espace et comme dernière mission de son issue, là où c'est bien elle. */
function freshRun(state: Pick<DeliveryState, "workspaceRuns" | "runs">, run: DeliveryRun): Pick<DeliveryState, "workspaceRuns" | "runs"> {
  return {
    workspaceRuns: state.workspaceRuns.map((r) => (r.id === run.id ? run : r)),
    runs: state.runs[run.issueId]?.id === run.id ? { ...state.runs, [run.issueId]: run } : state.runs,
  };
}

/** La clé d'une erreur qui ne porte pas sur un fichier : la relecture. */
const REVIEW_ERROR = "";

/**
 * La raison d'un refus, quand le serveur en donne une (4xx) ; sinon vide, et l'écran dit quoi faire avec ses propres mots :
 * un échec du réseau ou une erreur interne n'a pas à s'afficher tel quel (R133).
 */
function refusalOf(e: unknown): string {
  const status = getErrorStatus(e);
  return status !== undefined && status >= 400 && status < 500 ? getErrorMessage(e) : "";
}

/** Les raisons gardées d'une mission, avec ou sans celle de ce fichier. */
function withChangeError(errors: Record<number, Record<string, string>>, runId: number, path: string, reason: string | null): Record<number, Record<string, string>> {
  const rest = { ...(errors[runId] ?? {}) };
  if (reason === null) delete rest[path];
  else rest[path] = reason;
  return { ...errors, [runId]: rest };
}

/** Une réponse donnée : la mission a une demande ouverte de moins, et quitte la liste à la dernière. */
function answered(open: OpenApproval[], runId: number): OpenApproval[] {
  return open
    .map((row) => (row.runId === runId ? { ...row, requests: row.requests - 1 } : row))
    .filter((row) => row.requests > 0);
}

/** Les raisons gardées, sans celle de cette mission. */
function withoutError(errors: Record<number, string>, runId: number): Record<number, string> {
  const rest = { ...errors };
  delete rest[runId];
  return rest;
}

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  providers: [],
  projectProviders: {},
  providersLoading: false,
  runs: {},
  workspaceRuns: [],
  projectRuns: {},
  openApprovals: [],
  runner: null,
  activity: {},
  resultErrors: {},
  evidence: {},
  missionChanges: {},
  fileDiffs: {},
  changeComments: {},
  changeErrors: {},

  fetchMissionChanges: async (slug, runId) => {
    try {
      const changes = await getMissionChanges(slug, runId);
      set((state) => ({ missionChanges: { ...state.missionChanges, [runId]: changes } }));
      return changes;
    } catch {
      return null;
    }
  },

  fetchFileDiff: async (slug, runId, path) => {
    const remember = (diff: MissionFileDiff | null) => set((state) => ({
      fileDiffs: { ...state.fileDiffs, [runId]: { ...(state.fileDiffs[runId] ?? {}), [path]: diff } },
    }));
    try {
      const diff = await getMissionFileDiff(slug, runId, path);
      remember(diff);
      return diff;
    } catch {
      remember(null);
      return null;
    }
  },

  revertFile: async (slug, runId, path) => {
    try {
      await revertMissionFile(slug, runId, path);
      set((state) => ({ changeErrors: withChangeError(state.changeErrors, runId, path, null) }));
      await get().fetchMissionChanges(slug, runId);
      return true;
    } catch (e) {
      set((state) => ({ changeErrors: withChangeError(state.changeErrors, runId, path, refusalOf(e)) }));
      return false;
    }
  },

  addChangeComment: (runId, comment) => set((state) => ({
    changeComments: {
      ...state.changeComments,
      [runId]: [...(state.changeComments[runId] ?? []), { ...comment, id: `${comment.path}:${comment.side}:${comment.line}:${Date.now()}:${Math.random()}` }],
    },
  })),

  removeChangeComment: (runId, id) => set((state) => ({
    changeComments: { ...state.changeComments, [runId]: (state.changeComments[runId] ?? []).filter((comment) => comment.id !== id) },
  })),

  askForChanges: async (slug, issueId, runId) => {
    const drafts = get().changeComments[runId] ?? [];
    if (drafts.length === 0) return null;
    try {
      const next = await askForChangesApi(slug, runId, drafts.map(({ path, line, side, text }) => ({ path, line, side, text })));
      set((state) => {
        const rest = { ...state.changeComments };
        delete rest[runId];
        return {
          changeComments: rest,
          runs: { ...state.runs, [issueId]: next },
          // La mission reprise a un dernier geste : elle n'attend plus de relecture.
          workspaceRuns: [next, ...state.workspaceRuns.map((run) => (run.id === runId ? { ...run, outcome: "FOLLOWED_UP" as const } : run))],
          changeErrors: withChangeError(state.changeErrors, runId, REVIEW_ERROR, null),
        };
      });
      return next;
    } catch (e) {
      set((state) => ({ changeErrors: withChangeError(state.changeErrors, runId, REVIEW_ERROR, refusalOf(e)) }));
      return null;
    }
  },

  sendCorrection: async (slug, runId, text) => {
    try {
      await sendCorrectionApi(slug, runId, text);
      set((state) => ({ changeErrors: withChangeError(state.changeErrors, runId, REVIEW_ERROR, null) }));
      await get().fetchMissionChanges(slug, runId);
      return true;
    } catch (e) {
      set((state) => ({ changeErrors: withChangeError(state.changeErrors, runId, REVIEW_ERROR, refusalOf(e)) }));
      return false;
    }
  },

  fetchProviders: async (slug) => {
    set({ providersLoading: true });
    try {
      const providers = await getDeliveryProviders(slug);
      set({ providers, providersLoading: false });
      return providers;
    } catch {
      set({ providersLoading: false });
      return [];
    }
  },

  fetchProjectProviders: async (slug, projectId) => {
    try {
      const providers = await getDeliveryProviders(slug, projectId);
      set((state) => ({ projectProviders: { ...state.projectProviders, [projectId]: providers } }));
      return providers;
    } catch {
      return [];
    }
  },

  fetchRun: async (slug, issueId) => {
    try {
      const run = await getIssueRun(slug, issueId);
      set((state) => ({ runs: { ...state.runs, [issueId]: run } }));
      return run;
    } catch {
      return null;
    }
  },

  fetchWorkspaceRuns: async (slug) => {
    try {
      const runs = await listWorkspaceRuns(slug);
      set({ workspaceRuns: runs });
      return runs;
    } catch {
      return [];
    }
  },

  fetchProjectRuns: async (slug, projectId, page = 0) => {
    try {
      const result = await listProjectRuns(slug, projectId, page);
      const rows = page === 0 ? result.content : appendRows(get().projectRuns[projectId]?.rows ?? [], result.content);
      set((state) => ({
        projectRuns: {
          ...state.projectRuns,
          [projectId]: { rows, page: result.pageNumber, last: result.last, total: result.totalElements },
        },
      }));
      return rows;
    } catch {
      return null;
    }
  },

  fetchProjectRun: async (slug, projectId, runId) => {
    try {
      const row = await getProjectRun(slug, projectId, runId);
      set((state) => {
        // Les missions d'un projet pas encore lu ne commencent pas par une ligne seule : la liste se lit d'abord.
        const current = state.projectRuns[projectId];
        return {
          ...(current ? { projectRuns: { ...state.projectRuns, [projectId]: withRow(current, row) } } : {}),
          ...freshRun(state, row.run),
        };
      });
      return row;
    } catch (e) {
      // 404 : la mission n'est plus à lire pour cette personne (projet devenu privé, mission d'ailleurs) ; elle quitte la liste.
      if (getErrorStatus(e) === 404) {
        set((state) => {
          const current = state.projectRuns[projectId];
          if (!current?.rows.some((r) => r.run.id === runId)) return {};
          const rows = current.rows.filter((r) => r.run.id !== runId);
          return { projectRuns: { ...state.projectRuns, [projectId]: { ...current, rows, total: Math.max(0, current.total - 1) } } };
        });
      }
      return null;
    }
  },

  applyProjectRunStep: (projectId, runId, step) => {
    const current = get().projectRuns[projectId];
    const row = current?.rows.find((r) => r.run.id === runId);
    if (!current || !row || (row.step && row.step.seq >= step.seq)) return false;
    set((state) => ({
      projectRuns: {
        ...state.projectRuns,
        [projectId]: { ...current, rows: current.rows.map((r) => (r.run.id === runId ? { ...r, step } : r)) },
      },
    }));
    return true;
  },

  fetchOpenApprovals: async (slug) => {
    try {
      const openApprovals = await listOpenApprovals(slug);
      set({ openApprovals });
      return openApprovals;
    } catch {
      return null;
    }
  },

  delegate: async (slug, issueId, providerKey, model) => {
    try {
      const run = await delegateIssue(slug, issueId, providerKey, model);
      set((state) => ({ runs: { ...state.runs, [issueId]: run } }));
      return run;
    } catch {
      return null;
    }
  },

  fetchRunner: async () => {
    try {
      const runner = await getRunnerStatus();
      set({ runner });
      return runner;
    } catch {
      return null;
    }
  },

  provisionRunner: async () => {
    try {
      const provision = await provisionRunnerApi();
      // Seul l'état public est gardé : le secret repart vers l'appelant, qui l'affiche une fois puis l'oublie.
      set({ runner: { exists: true, clientId: provision.clientId, ownerEmail: provision.ownerEmail } });
      return provision;
    } catch {
      return null;
    }
  },

  fetchActivity: async (slug, runId) => {
    const known = get().activity[runId];
    const after = known?.events.at(-1)?.seq ?? 0;
    try {
      const next = await getRunActivity(slug, runId, after);
      const seen = new Set(known?.events.map((e) => e.seq) ?? []);
      const merged: DeliveryRunActivity = {
        events: [...(known?.events ?? []), ...next.events.filter((e) => !seen.has(e.seq))],
        approvals: next.approvals,
      };
      set((state) => ({ activity: { ...state.activity, [runId]: merged } }));
      return merged;
    } catch {
      return null;
    }
  },

  decideApproval: async (slug, runId, approvalId, allow, forMission = false) => {
    try {
      await decideApprovalApi(slug, runId, approvalId, allow, forMission);
      // Répondre fait baisser le nombre aussitôt (R128) ; la relecture qui suit dit la vérité du serveur.
      set((state) => ({ openApprovals: answered(state.openApprovals, runId) }));
      await Promise.all([get().fetchActivity(slug, runId), get().fetchOpenApprovals(slug)]);
      return true;
    } catch {
      // Refusée parce que la demande a expiré entre-temps : la liste n'était plus vraie.
      await get().fetchOpenApprovals(slug);
      return false;
    }
  },

  downloadEvidence: async (slug, runId, format) => {
    try {
      await downloadEvidenceApi(slug, runId, format);
      return true;
    } catch {
      return false;
    }
  },

  fetchEvidence: async (slug, runId) => {
    try {
      const evidence = await getEvidence(slug, runId);
      set((state) => ({ evidence: { ...state.evidence, [runId]: evidence } }));
      return evidence;
    } catch (e) {
      // 404 : la mission n'a pas encore de dossier (ou n'en aura pas, run de la v1). Une autre erreur garde la lecture d'avant.
      if (getErrorStatus(e) === 404) set((state) => ({ evidence: { ...state.evidence, [runId]: null } }));
      return null;
    }
  },

  applyRun: async (slug, issueId, runId, reason) => {
    try {
      await applyRunApi(slug, runId, reason);
      set((state) => ({ resultErrors: withoutError(state.resultErrors, runId) }));
      await get().fetchRun(slug, issueId);
      return true;
    } catch (e) {
      set((state) => ({ resultErrors: { ...state.resultErrors, [runId]: getErrorMessage(e) } }));
      return false;
    }
  },

  discardRun: async (slug, issueId, runId) => {
    try {
      await discardRunApi(slug, runId);
      set((state) => ({ resultErrors: withoutError(state.resultErrors, runId) }));
      await get().fetchRun(slug, issueId);
      return true;
    } catch (e) {
      set((state) => ({ resultErrors: { ...state.resultErrors, [runId]: getErrorMessage(e) } }));
      return false;
    }
  },

  markRunDone: async (slug, issueId, runId) => {
    try {
      await markRunDoneApi(slug, runId);
      set((state) => ({ resultErrors: withoutError(state.resultErrors, runId) }));
      await get().fetchRun(slug, issueId);
      return true;
    } catch (e) {
      set((state) => ({ resultErrors: { ...state.resultErrors, [runId]: getErrorMessage(e) } }));
      return false;
    }
  },

  retryRun: async (slug, issueId, runId, note) => {
    try {
      const next = await retryRunApi(slug, runId, note);
      set((state) => ({ runs: { ...state.runs, [issueId]: next }, resultErrors: withoutError(state.resultErrors, runId) }));
      return next;
    } catch (e) {
      set((state) => ({ resultErrors: { ...state.resultErrors, [runId]: getErrorMessage(e) } }));
      return null;
    }
  },

  stopRun: async (slug, issueId, runId) => {
    try {
      await stopRunApi(slug, runId);
      await Promise.all([get().fetchRun(slug, issueId), get().fetchActivity(slug, runId), get().fetchOpenApprovals(slug)]);
      return true;
    } catch {
      // Elle a pu finir entre-temps : la relecture dit où elle en est.
      await get().fetchRun(slug, issueId);
      return false;
    }
  },
}));
