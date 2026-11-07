import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

// ---------------------------------------------------------------------------
// La fenêtre (R119 à R122, séance n°18) : ce que la personne en règle, hors de la route. Le volet en pleine largeur, sa
// largeur à la poignée et la zone de droite se retiennent pour elle, dans le navigateur (le motif de l'app : `persist`) ;
// les lignes de la zone de droite repartent repliées, son tiroir des écrans étroits et la recherche fermés. La route,
// elle, dit quel volet est ouvert.
// ---------------------------------------------------------------------------

/** Les six lignes de la zone de droite (R122), dans leur ordre. */
export const WINDOW_ROWS = ["environment", "context", "connectors", "results", "changes", "missions"] as const
export type WindowRow = (typeof WINDOW_ROWS)[number]

interface WindowState {
  /** Le volet prend toute la largeur ; la conversation se replie dans le compositeur (R120). */
  paneFull: boolean
  /** La largeur du volet à côté de la conversation, réglée à la poignée (px) ; null : la moitié de la place. */
  paneWidth: number | null
  /** La zone de droite est ouverte (R122). */
  rightOpen: boolean
  /** Sous `lg`, la zone de droite est un tiroir : il est ouvert. */
  rightDrawer: boolean
  /** Les lignes dépliées de la zone de droite, repliées par défaut. */
  rows: Partial<Record<WindowRow, boolean>>
  /** La recherche (Ctrl+K) est ouverte. */
  searchOpen: boolean

  togglePaneFull: () => void
  /** Retient la largeur du volet ; null la ramène à la moitié de la place (double-clic sur la poignée). */
  setPaneWidth: (width: number | null) => void
  setRightOpen: (open: boolean) => void
  setRightDrawer: (open: boolean) => void
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
      paneWidth: null,
      rightOpen: true,
      rightDrawer: false,
      rows: {},
      searchOpen: false,

      togglePaneFull: () => set((s) => ({ paneFull: !s.paneFull })),
      setPaneWidth: (width) => set({ paneWidth: width === null ? null : Math.round(width) }),
      setRightOpen: (open) => set({ rightOpen: open }),
      setRightDrawer: (open) => set({ rightDrawer: open }),
      toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
      toggleRow: (row) => set((s) => ({ rows: { ...s.rows, [row]: !s.rows[row] } })),
      showRow: (row) => set((s) => ({ rightOpen: true, rows: { ...s.rows, [row]: true } })),
      setSearchOpen: (open) => set({ searchOpen: open }),
    }),
    {
      name: "tf-window",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ paneFull: s.paneFull, paneWidth: s.paneWidth, rightOpen: s.rightOpen }),
    },
  ),
)
