import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

// ---------------------------------------------------------------------------
// La fenêtre (R119 à R123, séance n°18) : ce que la personne en règle, hors de la route. Le volet en pleine largeur, sa
// largeur à la poignée, la zone de droite et l'endroit où elle a laissé chaque espace se retiennent pour elle, dans le
// navigateur (le motif de l'app : `persist`) ; les lignes de la zone de droite repartent repliées, son tiroir des écrans
// étroits et la recherche fermés. La route, elle, dit quel volet est ouvert.
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
  /**
   * Là où la personne a laissé chaque espace (R123) : l'adresse de la fenêtre (le volet, la conversation, l'issue), par
   * personne et par espace (`placeKey`). La fenêtre s'y rouvre au démarrage.
   */
  places: Record<string, string>
  /** Le dernier espace de chaque personne, que le démarrage rouvre. */
  lastSpaces: Record<string, string>
  /** L'onglet du volet « Progress » de chaque personne (R130) : le contrôle segmenté se rouvre où elle l'a laissé. */
  progressTabs: Record<string, string>

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
  /** Retient l'adresse de la fenêtre pour cette personne dans cet espace, et cet espace comme son dernier. */
  rememberPlace: (person: string, slug: string, address: string) => void
  /** Retient l'onglet de « Progress » pour cette personne. */
  setProgressTab: (person: string, tab: string) => void
}

/** Les adresses retenues au plus : les plus anciennes partent. */
const MAX_PLACES = 20

/** La clé d'un endroit : la personne et l'espace. */
export const placeKey = (person: string, slug: string): string => `${person}:${slug}`

export const useWindowStore = create<WindowState>()(
  persist(
    (set) => ({
      paneFull: false,
      paneWidth: null,
      rightOpen: true,
      rightDrawer: false,
      rows: {},
      searchOpen: false,
      places: {},
      lastSpaces: {},
      progressTabs: {},

      togglePaneFull: () => set((s) => ({ paneFull: !s.paneFull })),
      setPaneWidth: (width) => set({ paneWidth: width === null ? null : Math.round(width) }),
      setRightOpen: (open) => set({ rightOpen: open }),
      setRightDrawer: (open) => set({ rightDrawer: open }),
      toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
      toggleRow: (row) => set((s) => ({ rows: { ...s.rows, [row]: !s.rows[row] } })),
      showRow: (row) => set((s) => ({ rightOpen: true, rows: { ...s.rows, [row]: true } })),
      setSearchOpen: (open) => set({ searchOpen: open }),
      rememberPlace: (person, slug, address) => set((s) => {
        const key = placeKey(person, slug)
        if (s.places[key] === address && s.lastSpaces[person] === slug) return s
        // La dernière retenue en dernier : au-delà du plafond, les plus anciennes partent.
        const rest = Object.entries(s.places).filter(([other]) => other !== key).slice(-(MAX_PLACES - 1))
        return {
          places: Object.fromEntries([...rest, [key, address]]),
          lastSpaces: { ...s.lastSpaces, [person]: slug },
        }
      }),
      setProgressTab: (person, tab) => set((s) => ({ progressTabs: { ...s.progressTabs, [person]: tab } })),
    }),
    {
      name: "tf-window",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        paneFull: s.paneFull, paneWidth: s.paneWidth, rightOpen: s.rightOpen, places: s.places, lastSpaces: s.lastSpaces,
        progressTabs: s.progressTabs,
      }),
    },
  ),
)
