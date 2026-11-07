import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

// ---------------------------------------------------------------------------
// La fenêtre (R119 à R122, séance n°18) : ce que la personne en règle, hors de la route. Le volet en pleine largeur et
// la zone de droite se retiennent pour elle, dans le navigateur (le motif de l'app : `persist`) ; les lignes de la zone
// de droite repartent repliées, et la recherche fermée. La route, elle, dit quel volet est ouvert.
// ---------------------------------------------------------------------------

/** Les six lignes de la zone de droite (R122), dans leur ordre. */
export const WINDOW_ROWS = ["environment", "context", "connectors", "results", "changes", "missions"] as const
export type WindowRow = (typeof WINDOW_ROWS)[number]

interface WindowState {
  /** Le volet prend toute la largeur ; la conversation se replie dans le compositeur (R120). */
  paneFull: boolean
  /** La zone de droite est ouverte (R122). */
  rightOpen: boolean
  /** Les lignes dépliées de la zone de droite, repliées par défaut. */
  rows: Partial<Record<WindowRow, boolean>>
  /** La recherche (Ctrl+K) est ouverte. */
  searchOpen: boolean

  togglePaneFull: () => void
  setRightOpen: (open: boolean) => void
  toggleRight: () => void
  toggleRow: (row: WindowRow) => void
  /** Ouvre la zone de droite sur une ligne dépliée : une analyse lancée se suit dans « Missions ». */
  showRow: (row: WindowRow) => void
  setSearchOpen: (open: boolean) => void
}

export const useWindowStore = create<WindowState>()(
  persist(
    (set) => ({
      paneFull: false,
      rightOpen: true,
      rows: {},
      searchOpen: false,

      togglePaneFull: () => set((s) => ({ paneFull: !s.paneFull })),
      setRightOpen: (open) => set({ rightOpen: open }),
      toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
      toggleRow: (row) => set((s) => ({ rows: { ...s.rows, [row]: !s.rows[row] } })),
      showRow: (row) => set((s) => ({ rightOpen: true, rows: { ...s.rows, [row]: true } })),
      setSearchOpen: (open) => set({ searchOpen: open }),
    }),
    {
      name: "tf-window",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ paneFull: s.paneFull, rightOpen: s.rightOpen }),
    },
  ),
)
