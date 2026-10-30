import { create } from "zustand";
import {
  getDeliveryProviders,
  getIssueRun,
  listWorkspaceRuns,
  delegateIssue,
  getRunnerStatus,
  getRunActivity,
  applyRun as applyRunApi,
  decideApproval as decideApprovalApi,
  discardRun as discardRunApi,
  retryRun as retryRunApi,
  downloadEvidence as downloadEvidenceApi,
  provisionRunner as provisionRunnerApi,
  type DeliveryProvider,
  type DeliveryRun,
  type DeliveryRunActivity,
  type RunnerProvision,
  type RunnerStatus,
} from "../api/delivery-service";
import { getErrorMessage } from "../api/client";

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
  /** Runner local de l'utilisateur (ADR-013). `null` = pas encore chargé. Jamais de secret ici. */
  runner: RunnerStatus | null;
  /** Activité par runId : chronologie cumulée (dans l'ordre) et demandes de validation du run (lot 5). */
  activity: Record<number, DeliveryRunActivity>;
  /** Par runId : pourquoi le dernier geste sur la carte de résultat n'a pas abouti (GitHub refuse, conflits...). */
  resultErrors: Record<number, string>;

  fetchProviders: (slug: string) => Promise<DeliveryProvider[]>;
  fetchProjectProviders: (slug: string, projectId: number) => Promise<DeliveryProvider[]>;
  fetchRun: (slug: string, issueId: number) => Promise<DeliveryRun | null>;
  fetchWorkspaceRuns: (slug: string) => Promise<DeliveryRun[]>;
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
  /** Les gestes de la carte de résultat (R78) ; `false` (ou `null`) en cas d'échec, la raison dans `resultErrors`. */
  applyRun: (slug: string, issueId: number, runId: number) => Promise<boolean>;
  discardRun: (slug: string, issueId: number, runId: number) => Promise<boolean>;
  retryRun: (slug: string, issueId: number, runId: number, note: string) => Promise<DeliveryRun | null>;
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
  runner: null,
  activity: {},
  resultErrors: {},

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
      await get().fetchActivity(slug, runId);
      return true;
    } catch {
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

  applyRun: async (slug, issueId, runId) => {
    try {
      await applyRunApi(slug, runId);
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
}));
