import { create } from "zustand";
import {
  getDeliveryProviders,
  getIssueRun,
  listWorkspaceRuns,
  delegateIssue,
  getRunnerStatus,
  provisionRunner as provisionRunnerApi,
  type DeliveryProvider,
  type DeliveryRun,
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

  fetchProviders: (slug: string) => Promise<DeliveryProvider[]>;
  fetchRun: (slug: string, issueId: number) => Promise<DeliveryRun | null>;
  fetchWorkspaceRuns: (slug: string) => Promise<DeliveryRun[]>;
  delegate: (slug: string, issueId: number, providerKey: string, model?: string) => Promise<DeliveryRun | null>;
  fetchRunner: () => Promise<RunnerStatus | null>;
  /** Renvoie les identifiants (secret compris) à l'appelant SANS les garder : le secret ne vit pas dans l'état global. */
  provisionRunner: () => Promise<RunnerProvision | null>;
}

export const useDeliveryStore = create<DeliveryState>((set) => ({
  providers: [],
  providersLoading: false,
  runs: {},
  workspaceRuns: [],
  runner: null,

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
}));
