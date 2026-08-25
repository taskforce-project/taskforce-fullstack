import { create } from "zustand";

/**
 * Store d'ouverture du formulaire de feedback (dialog global monté dans l'AppShell).
 * N'importe quel « Give feedback » l'ouvre via `openFeedback(context)`.
 */
interface FeedbackState {
  isOpen: boolean;
  /** Page / fonctionnalité d'origine (ex. « Labs · Intelligence »). */
  context: string | null;
  openFeedback: (context?: string) => void;
  closeFeedback: () => void;
}

export const useFeedbackStore = create<FeedbackState>((set) => ({
  isOpen: false,
  context: null,
  openFeedback: (context) => set({ isOpen: true, context: context ?? null }),
  closeFeedback: () => set({ isOpen: false }),
}));
