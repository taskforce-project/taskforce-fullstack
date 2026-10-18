import { create } from "zustand";
import {
  getDeliveryProviders,
  getIssueRun,
  listWorkspaceRuns,
  delegateIssue,
  getRunnerStatus,
  getRunActivity,
  decideApproval as decideApprovalApi,
  provisionRunner as provisionRunnerApi,
  type DeliveryProvider,
  type DeliveryRun,
  type DeliveryRunActivity,
  type RunnerProvision,
  type RunnerStatus,
} from "../api/delivery-service";

// ---------------------------------------------------------------------------
// Store de délégation à un agent (TF-AGENT-DELIVERY). Un domaine = un store.
// Erreurs avalées (renvoie null/[]), l'appelant branche sur le retour.
// ---------------------------------------------------------------------------

interface DeliveryState {
  /** Providers délégables du workspace (chargés à la demande). */
  providers: DeliveryProvider[];
  providersLoading: boolean;
  /** Dernier run par issueId (`null` = chargé mais aucune délégation). */
  runs: Record<number, DeliveryRun | null>;
  /** Runs de délégation du workspace (vue « workflow »), les plus récents d'abord. */
  workspaceRuns: DeliveryRun[];
  /** Runner local de l'utilisateur (ADR-013). `null` = pas encore chargé. Jamais de secret ici. */
  runner: RunnerStatus | null;
  /** Activité par runId : chronologie cumulée (dans l'ordre) et demandes de validation du run (lot 5). */
  activity: Record<number, DeliveryRunActivity>;

  fetchProviders: (slug: string) => Promise<DeliveryProvider[]>;
  fetchRun: (slug: string, issueId: number) => Promise<DeliveryRun | null>;
  fetchWorkspaceRuns: (slug: string) => Promise<DeliveryRun[]>;
  delegate: (slug: string, issueId: number, providerKey: string, model?: string) => Promise<DeliveryRun | null>;
  fetchRunner: () => Promise<RunnerStatus | null>;
  /** Renvoie les identifiants (secret compris) à l'appelant SANS les garder : le secret ne vit pas dans l'état global. */
  provisionRunner: () => Promise<RunnerProvision | null>;
  /** Lit la suite de la chronologie d'un run (après le dernier événement connu) et ses demandes. */
  fetchActivity: (slug: string, runId: number) => Promise<DeliveryRunActivity | null>;
  /** Autorise ou refuse une action de l'agent ; `true` si la décision est enregistrée. */
  decideApproval: (slug: string, runId: number, approvalId: number, allow: boolean) => Promise<boolean>;
}

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  providers: [],
  providersLoading: false,
  runs: {},
  workspaceRuns: [],
  runner: null,
  activity: {},

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

  decideApproval: async (slug, runId, approvalId, allow) => {
    try {
      await decideApprovalApi(slug, runId, approvalId, allow);
      await get().fetchActivity(slug, runId);
      return true;
    } catch {
      return false;
    }
  },
}));
