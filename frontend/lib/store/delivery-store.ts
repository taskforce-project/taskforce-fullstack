import { create } from "zustand";
import {
  getDeliveryProviders,
  getIssueRun,
  delegateIssue,
  getAnthropicStatus,
  connectAnthropicKey,
  disconnectAnthropicKey,
  type AnthropicStatus,
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
  /** État de la clé Anthropic du workspace (`null` = pas encore chargé). */
  anthropic: AnthropicStatus | null;

  fetchProviders: (slug: string) => Promise<DeliveryProvider[]>;
  fetchRun: (slug: string, issueId: number) => Promise<DeliveryRun | null>;
  delegate: (slug: string, issueId: number, providerKey: string, model?: string) => Promise<DeliveryRun | null>;
  fetchAnthropic: (slug: string) => Promise<AnthropicStatus | null>;
  connectAnthropic: (slug: string, apiKey: string) => Promise<AnthropicStatus | null>;
  disconnectAnthropic: (slug: string) => Promise<boolean>;
}

export const useDeliveryStore = create<DeliveryState>((set) => ({
  providers: [],
  providersLoading: false,
  runs: {},
  anthropic: null,

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

  fetchAnthropic: async (slug) => {
    try {
      const status = await getAnthropicStatus(slug);
      set({ anthropic: status });
      return status;
    } catch {
      return null;
    }
  },

  connectAnthropic: async (slug, apiKey) => {
    try {
      const status = await connectAnthropicKey(slug, apiKey);
      set({ anthropic: status });
      return status;
    } catch {
      return null;
    }
  },

  disconnectAnthropic: async (slug) => {
    try {
      await disconnectAnthropicKey(slug);
      set({ anthropic: { connected: false, keyHint: null } });
      return true;
    } catch {
      return false;
    }
  },
}));
