import { create } from "zustand";
import {
  getDeliveryProviders,
  getIssueRun,
  delegateIssue,
  getDeliveryKey,
  connectDeliveryKey,
  disconnectDeliveryKey,
  type DeliveryKeyProvider,
  type DeliveryKeyStatus,
  type DeliveryProvider,
  type DeliveryRun,
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
  /** État des clés de délégation par provider ("anthropic" | "cursor"). Absent = pas encore chargé. */
  keys: Record<string, DeliveryKeyStatus>;

  fetchProviders: (slug: string) => Promise<DeliveryProvider[]>;
  fetchRun: (slug: string, issueId: number) => Promise<DeliveryRun | null>;
  delegate: (slug: string, issueId: number, providerKey: string, model?: string) => Promise<DeliveryRun | null>;
  fetchKey: (slug: string, provider: DeliveryKeyProvider) => Promise<DeliveryKeyStatus | null>;
  connectKey: (slug: string, provider: DeliveryKeyProvider, apiKey: string) => Promise<DeliveryKeyStatus | null>;
  disconnectKey: (slug: string, provider: DeliveryKeyProvider) => Promise<boolean>;
}

export const useDeliveryStore = create<DeliveryState>((set) => ({
  providers: [],
  providersLoading: false,
  runs: {},
  keys: {},

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

  delegate: async (slug, issueId, providerKey, model) => {
    try {
      const run = await delegateIssue(slug, issueId, providerKey, model);
      set((state) => ({ runs: { ...state.runs, [issueId]: run } }));
      return run;
    } catch {
      return null;
    }
  },

  fetchKey: async (slug, provider) => {
    try {
      const status = await getDeliveryKey(slug, provider);
      set((state) => ({ keys: { ...state.keys, [provider]: status } }));
      return status;
    } catch {
      return null;
    }
  },

  connectKey: async (slug, provider, apiKey) => {
    try {
      const status = await connectDeliveryKey(slug, provider, apiKey);
      set((state) => ({ keys: { ...state.keys, [provider]: status } }));
      return status;
    } catch {
      return null;
    }
  },

  disconnectKey: async (slug, provider) => {
    try {
      await disconnectDeliveryKey(slug, provider);
      set((state) => ({ keys: { ...state.keys, [provider]: { connected: false, keyHint: null } } }));
      return true;
    } catch {
      return false;
    }
  },
}));
