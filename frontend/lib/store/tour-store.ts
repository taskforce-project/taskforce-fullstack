/**
 * Store du tour produit (onboarding « in-app » façon coach-marks).
 *
 * <p>Pilote un composant maison ({@code components/tour/product-tour.tsx}) qui met en avant les points
 * clés du dashboard après l'onboarding. {@code hasSeen} est <b>persisté</b> (localStorage) pour ne le
 * déclencher qu'une fois ; {@code isActive}/{@code stepIndex} sont éphémères. Rejouable depuis l'aide.</p>
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface TourState {
  /** Tour en cours d'affichage. */
  isActive: boolean;
  /** Index de l'étape courante (0-based). */
  stepIndex: number;
  /** Déjà vu au moins une fois (persisté) → pas de re-déclenchement automatique. */
  hasSeen: boolean;
  /** Démarre le tour depuis la première étape (déclenchement auto ou rejeu manuel). */
  start: () => void;
  /** Va à l'étape {@code i}. */
  setStep: (i: number) => void;
  /** Ferme le tour ; {@code markSeen} pose le drapeau « déjà vu » (fin normale ou skip). */
  close: (markSeen: boolean) => void;
}

export const useTourStore = create<TourState>()(
  persist(
    (set) => ({
      isActive: false,
      stepIndex: 0,
      hasSeen: false,
      start: () => set({ isActive: true, stepIndex: 0 }),
      setStep: (i) => set({ stepIndex: i }),
      close: (markSeen) =>
        set((s) => ({ isActive: false, stepIndex: 0, hasSeen: markSeen ? true : s.hasSeen })),
    }),
    {
      name: "tf-product-tour",
      storage: createJSONStorage(() => localStorage),
      // Seul « déjà vu » survit au rechargement : l'état d'affichage doit repartir fermé.
      partialize: (state) => ({ hasSeen: state.hasSeen }),
    },
  ),
);
