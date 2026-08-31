import { create } from "zustand";
import type {
  DashboardCard,
  CreateDashboardCardPayload,
  UpdateDashboardCardPayload,
} from "../api/dashboard-card-service";
import {
  listDashboardCards,
  createDashboardCard,
  updateDashboardCard,
  reorderDashboardCards,
  deleteDashboardCard,
} from "../api/dashboard-card-service";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface DashboardCardsState {
  /** Cartes de l'utilisateur pour le workspace actif, triées par position */
  cards: DashboardCard[];
  isLoading: boolean;
  error: string | null;

  /** Charge les cartes (le backend bootstrape les 4 par défaut au premier appel) */
  fetchCards: (slug: string) => Promise<void>;

  /** Ajoute une carte en fin de grille */
  addCard: (slug: string, payload: CreateDashboardCardPayload) => Promise<DashboardCard | null>;

  /** Met à jour titre / config / période d'une carte (optimiste, revert si échec) */
  patchCard: (slug: string, id: number, payload: UpdateDashboardCardPayload) => Promise<DashboardCard | null>;

  /** Retire une carte (optimiste : la carte réapparaît si le serveur refuse) */
  removeCard: (slug: string, id: number) => Promise<boolean>;

  /** Réordonne les cartes par glisser-déposer (optimiste, revert si échec) */
  reorderCards: (slug: string, orderedIds: number[]) => Promise<boolean>;

  /** Réinitialise le store (ex : changement de workspace) */
  clearCards: () => void;
}

const byPosition = (a: DashboardCard, b: DashboardCard) => a.position - b.position;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDashboardCardsStore = create<DashboardCardsState>((set, get) => ({
  cards: [],
  isLoading: false,
  error: null,

  clearCards: () => set({ cards: [], error: null }),

  fetchCards: async (slug) => {
    set({ isLoading: true, error: null });
    try {
      const cards = await listDashboardCards(slug);
      set({ cards: [...cards].sort(byPosition), isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors du chargement des cartes";
      set({ isLoading: false, error: message });
    }
  },

  addCard: async (slug, payload) => {
    try {
      const card = await createDashboardCard(slug, payload);
      set((state) => ({ cards: [...state.cards, card].sort(byPosition) }));
      return card;
    } catch {
      return null;
    }
  },

  patchCard: async (slug, id, payload) => {
    const previous = get().cards;
    // Optimiste : champs absents ou null = inchangés (sémantique du contrat PATCH).
    set((state) => ({
      cards: state.cards.map((c) =>
        c.id === id
          ? {
              ...c,
              title: payload.title ?? c.title,
              config: payload.config ?? c.config,
              timeRange: payload.timeRange ?? c.timeRange,
            }
          : c,
      ),
    }));
    try {
      const updated = await updateDashboardCard(slug, id, payload);
      set((state) => ({ cards: state.cards.map((c) => (c.id === id ? updated : c)) }));
      return updated;
    } catch {
      set({ cards: previous });
      return null;
    }
  },

  removeCard: async (slug, id) => {
    const previous = get().cards;
    // Retrait optimiste - revert visuel si le serveur refuse.
    set((state) => ({ cards: state.cards.filter((c) => c.id !== id) }));
    try {
      await deleteDashboardCard(slug, id);
      return true;
    } catch {
      set({ cards: previous });
      return false;
    }
  },

  reorderCards: async (slug, orderedIds) => {
    const previous = get().cards;
    // Réordonnancement optimiste : positions 0..n dans l'ordre fourni.
    const byId = new Map(previous.map((c) => [c.id, c]));
    const next = orderedIds
      .map((id, index) => {
        const card = byId.get(id);
        return card ? { ...card, position: index } : null;
      })
      .filter((c): c is DashboardCard => c !== null);
    set({ cards: next });
    try {
      await reorderDashboardCards(slug, orderedIds);
      return true;
    } catch {
      set({ cards: previous });
      return false;
    }
  },
}));
