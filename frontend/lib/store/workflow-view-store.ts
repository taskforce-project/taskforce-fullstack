import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { LiveState } from "@/lib/hooks/use-project-live"
import type { Density } from "@/lib/workflow/states"

// ---------------------------------------------------------------------------
// Le workflow d'un projet (séance n°25, W1), ce que la personne en règle hors de l'adresse : la densité qu'elle a choisie
// en dernier et la largeur de l'inspecteur, retenues pour elle dans le navigateur (le motif de la fenêtre : `persist`) ;
// la légende ouverte et l'état du direct, que la ligne du titre montre, ne survivent pas au rechargement. Le nœud choisi,
// la densité demandée et le filtre vivent dans l'adresse.
// ---------------------------------------------------------------------------

/** L'inspecteur : 360 px par défaut, de 320 à 560 px à la poignée (§3). */
export const INSPECTOR_DEFAULT = 360
export const INSPECTOR_MIN = 320
export const INSPECTOR_MAX = 560

export const clampInspector = (width: number): number => Math.round(Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, width)))

interface WorkflowViewState {
  /** La dernière densité choisie, par personne. */
  densities: Record<string, Density>
  /** La largeur de l'inspecteur, par personne. */
  inspectorWidths: Record<string, number>
  /** La légende est ouverte (« ... », puis « Legend », ou la touche `?`). */
  legendOpen: boolean
  /** L'état du direct du workflow ouvert, et l'heure de sa dernière lecture : la ligne du titre le dit. */
  live: { projectId: number; state: LiveState; readAt: number | null } | null
  /**
   * La vue est étroite : le direct, la densité et le filtre sont dans la ligne de son en-tête, et la ligne des onglets du
   * projet ne les montre pas (sans eux, l'onglet « Workflow » reste visible). Jamais gardé d'une visite à l'autre.
   */
  controlsInView: boolean

  setDensity: (person: string, density: Density) => void
  setInspectorWidth: (person: string, width: number) => void
  setLegendOpen: (open: boolean) => void
  setLive: (live: WorkflowViewState["live"]) => void
  setControlsInView: (inView: boolean) => void
}

export const useWorkflowViewStore = create<WorkflowViewState>()(
  persist(
    (set) => ({
      densities: {},
      inspectorWidths: {},
      legendOpen: false,
      live: null,
      controlsInView: false,

      setDensity: (person, density) => set((s) => (s.densities[person] === density ? s : { densities: { ...s.densities, [person]: density } })),
      setInspectorWidth: (person, width) => set((s) => ({ inspectorWidths: { ...s.inspectorWidths, [person]: clampInspector(width) } })),
      setLegendOpen: (open) => set({ legendOpen: open }),
      setLive: (live) => set((s) => {
        const was = s.live
        if (was && live && was.projectId === live.projectId && was.state === live.state && was.readAt === live.readAt) return s
        return { live }
      }),
      setControlsInView: (inView) => set((s) => (s.controlsInView === inView ? s : { controlsInView: inView })),
    }),
    {
      name: "tf-workflow-view",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ densities: s.densities, inspectorWidths: s.inspectorWidths }),
    },
  ),
)
