/**
 * Store du tour produit (onboarding « in-app » façon coach-marks).
 *
 * <p>Pilote un composant maison ({@code components/tour/product-tour.tsx}) qui met en avant les points
 * clés du dashboard. Deux niveaux de « ne plus déclencher » :</p>
 * <ul>
 *   <li>{@code hasSeen} — <b>persisté</b> (localStorage) : posé quand l'utilisateur <b>termine</b> la visite
 *       OU coche « Ne plus afficher ». Bloque le tour définitivement pour ce compte/navigateur.</li>
 *   <li>{@code dismissed} — <b>éphémère</b> (non persisté) : posé à CHAQUE fermeture. Évite la boucle
 *       intra-session (fermer → le déclencheur du dashboard rescheduld → réouverture). Repart à
 *       {@code false} au prochain chargement de l'app → la visite est re-montrée si non « déjà vue ».</li>
 * </ul>
 * <p>{@code isActive}/{@code stepIndex} sont éphémères. Rejouable depuis l'aide ({@code ?tour=1}).</p>
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface TourState {
  /** Tour en cours d'affichage. */
  isActive: boolean;
  /** Index de l'étape courante (0-based). */
  stepIndex: number;
  /** Terminé OU « ne plus afficher » coché (persisté) → plus jamais de déclenchement auto. */
  hasSeen: boolean;
  /** Fermé pour CETTE session (éphémère) → pas de re-déclenchement tant que l'app n'est pas rechargée. */
  dismissed: boolean;
  /** Démarre le tour depuis la première étape (déclenchement auto ou rejeu manuel). */
  start: () => void;
  /** Va à l'étape {@code i}. */
  setStep: (i: number) => void;
  /**
   * Ferme le tour. {@code markSeen=true} (fin normale ou « ne plus afficher ») pose {@code hasSeen}
   * (blocage définitif) ; {@code false} (croix / Échap sans cocher) ne pose que {@code dismissed} —
   * la visite reviendra au prochain chargement de l'app.
   */
  close: (markSeen: boolean) => void;
}

export const useTourStore = create<TourState>()(
  persist(
    (set) => ({
      isActive: false,
      stepIndex: 0,
      hasSeen: false,
      dismissed: false,
      // Un (re)démarrage lève le drapeau de session : le rejeu depuis l'aide doit réellement s'afficher.
      start: () => set({ isActive: true, stepIndex: 0, dismissed: false }),
      setStep: (i) => set({ stepIndex: i }),
      close: (markSeen) =>
        set((s) => ({ isActive: false, stepIndex: 0, dismissed: true, hasSeen: markSeen ? true : s.hasSeen })),
    }),
    {
      name: "tf-product-tour",
      storage: createJSONStorage(() => localStorage),
      // Seul « déjà vu » survit au rechargement : affichage ET « fermé cette session » repartent à zéro.
      partialize: (state) => ({ hasSeen: state.hasSeen }),
    },
  ),
);
