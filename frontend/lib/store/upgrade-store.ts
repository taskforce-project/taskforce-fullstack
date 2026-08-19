/**
 * Store d'ouverture du modal d'upgrade (QA2-19).
 * Permet d'ouvrir l'expérience d'upgrade depuis n'importe quel CTA de l'app
 * (profil, switcher workspace, membres, analytics…) sans renvoyer dans les Settings.
 */
import { create } from "zustand"

interface UpgradeState {
  open: boolean
  openUpgrade: () => void
  closeUpgrade: () => void
}

export const useUpgradeStore = create<UpgradeState>((set) => ({
  open: false,
  openUpgrade: () => set({ open: true }),
  closeUpgrade: () => set({ open: false }),
}))
