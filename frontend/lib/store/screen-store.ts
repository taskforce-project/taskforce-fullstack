import { create } from "zustand"

import type { OpenIssue } from "@/lib/cortex/screen"

// ---------------------------------------------------------------------------
// Ce que la personne a sous les yeux, au-delà de la route (R114, séance n°17) : l'issue ouverte dans sa fiche, par-dessus
// le tableau, la liste ou la boîte de réception. La barre de Cortex l'envoie avec chaque message ; rien d'autre n'est
// retenu, et rien ne survit au rechargement.
// ---------------------------------------------------------------------------

interface ScreenState {
  openIssue: OpenIssue | null
  /** La fiche d'une issue s'ouvre. */
  showIssue: (projectId: number, issueId: number) => void
  /** La fiche de cette issue se ferme ; celle d'une autre, ouverte entre-temps, reste. */
  hideIssue: (issueId: number) => void
}

export const useScreenStore = create<ScreenState>()((set, get) => ({
  openIssue: null,
  showIssue: (projectId, issueId) => set({ openIssue: { projectId, issueId } }),
  hideIssue: (issueId) => {
    if (get().openIssue?.issueId === issueId) set({ openIssue: null })
  },
}))
