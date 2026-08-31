/**
 * Store d'ouverture du modal Settings (façon Claude) - ouvrable depuis n'importe quel CTA
 * (sidebar, popover Cortex, menu utilisateur) sans navigation de page. La section active est
 * conservée pour les deep-links / réouvertures sur la bonne section.
 */
import { create } from "zustand"

interface SettingsState {
  open: boolean
  section: string
  /** Ouvre le modal (optionnellement sur une section précise). */
  openSettings: (section?: string) => void
  closeSettings: () => void
  setSection: (section: string) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  open: false,
  section: "profile",
  openSettings: (section) => set(section ? { open: true, section } : { open: true }),
  closeSettings: () => set({ open: false }),
  setSection: (section) => set({ section }),
}))
