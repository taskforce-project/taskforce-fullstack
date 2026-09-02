import { create } from "zustand";
import axios from "axios";
import {
  type Cycle,
  type CreateCyclePayload,
  type UpdateCyclePayload,
  listCycles,
  createCycle as createCycleApi,
  getCycle as getCycleApi,
  updateCycle as updateCycleApi,
  deleteCycle as deleteCycleApi,
  listCycleIssues,
  addIssueToCycle as addIssueToCycleApi,
  removeIssueFromCycle as removeIssueFromCycleApi,
} from "../api/cycle-service";
import type { Issue } from "../api/issue-service";

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; error?: string } | undefined;
    return data?.message ?? data?.error ?? err.message;
  }
  return err instanceof Error ? err.message : fallback;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface CycleState {
  cycles: Cycle[];
  activeCycle: Cycle | null;
  cycleIssues: Issue[];
  isLoading: boolean;
  error: string | null;

  fetchCycles: (slug: string, projectId: number) => Promise<Cycle[]>;
  createCycle: (slug: string, projectId: number, payload: CreateCyclePayload) => Promise<Cycle | null>;
  fetchCycle: (slug: string, projectId: number, cycleId: number) => Promise<Cycle | null>;
  updateCycle: (slug: string, projectId: number, cycleId: number, payload: UpdateCyclePayload) => Promise<Cycle | null>;
  deleteCycle: (slug: string, projectId: number, cycleId: number) => Promise<boolean>;

  fetchCycleIssues: (slug: string, projectId: number, cycleId: number) => Promise<Issue[]>;
  addIssueToCycle: (slug: string, projectId: number, cycleId: number, issueId: number) => Promise<boolean>;
  removeIssueFromCycle: (slug: string, projectId: number, cycleId: number, issueId: number) => Promise<boolean>;

  setActiveCycle: (cycle: Cycle | null) => void;
  clearCycles: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCycleStore = create<CycleState>((set, get) => ({
  cycles: [],
  activeCycle: null,
  cycleIssues: [],
  isLoading: false,
  error: null,

  clearCycles: () => set({ cycles: [], activeCycle: null, cycleIssues: [], error: null }),
  setActiveCycle: (cycle) => set({ activeCycle: cycle }),

  fetchCycles: async (slug, projectId) => {
    set({ isLoading: true, error: null });
    try {
      const cycles = await listCycles(slug, projectId);
      set({ cycles, isLoading: false });
      return cycles;
    } catch (err) {
      set({ isLoading: false, error: extractError(err, "Erreur lors du chargement des cycles") });
      return [];
    }
  },

  createCycle: async (slug, projectId, payload) => {
    try {
      const cycle = await createCycleApi(slug, projectId, payload);
      set((state) => ({ cycles: [cycle, ...state.cycles] }));
      return cycle;
    } catch (err) {
      set({ error: extractError(err, "Erreur lors de la création du cycle") });
      return null;
    }
  },

  fetchCycle: async (slug, projectId, cycleId) => {
    set({ isLoading: true, error: null });
    try {
      const cycle = await getCycleApi(slug, projectId, cycleId);
      set({ activeCycle: cycle, isLoading: false });
      return cycle;
    } catch (err) {
      set({ isLoading: false, error: extractError(err, "Erreur lors du chargement du cycle") });
      return null;
    }
  },

  updateCycle: async (slug, projectId, cycleId, payload) => {
    try {
      const cycle = await updateCycleApi(slug, projectId, cycleId, payload);
      set((state) => ({
        cycles: state.cycles.map((c) => (c.id === cycleId ? cycle : c)),
        activeCycle: state.activeCycle?.id === cycleId ? cycle : state.activeCycle,
      }));
      return cycle;
    } catch (err) {
      set({ error: extractError(err, "Erreur lors de la mise à jour du cycle") });
      return null;
    }
  },

  deleteCycle: async (slug, projectId, cycleId) => {
    try {
      await deleteCycleApi(slug, projectId, cycleId);
      set((state) => ({
        cycles: state.cycles.filter((c) => c.id !== cycleId),
        activeCycle: state.activeCycle?.id === cycleId ? null : state.activeCycle,
      }));
      return true;
    } catch (err) {
      set({ error: extractError(err, "Erreur lors de la suppression du cycle") });
      return false;
    }
  },

  fetchCycleIssues: async (slug, projectId, cycleId) => {
    set({ isLoading: true, error: null });
    try {
      const issues = await listCycleIssues(slug, projectId, cycleId);
      set({ cycleIssues: issues, isLoading: false });
      return issues;
    } catch (err) {
      set({ isLoading: false, error: extractError(err, "Erreur lors du chargement des issues du cycle") });
      return [];
    }
  },

  addIssueToCycle: async (slug, projectId, cycleId, issueId) => {
    try {
      await addIssueToCycleApi(slug, projectId, cycleId, issueId);
      // Recharge les issues du cycle pour avoir la liste à jour
      await get().fetchCycleIssues(slug, projectId, cycleId);
      return true;
    } catch (err) {
      set({ error: extractError(err, "Erreur lors de l'ajout de l'issue au cycle") });
      return false;
    }
  },

  removeIssueFromCycle: async (slug, projectId, cycleId, issueId) => {
    try {
      await removeIssueFromCycleApi(slug, projectId, cycleId, issueId);
      set((state) => ({ cycleIssues: state.cycleIssues.filter((i) => i.id !== issueId) }));
      return true;
    } catch (err) {
      set({ error: extractError(err, "Erreur lors du retrait de l'issue du cycle") });
      return false;
    }
  },
}));
