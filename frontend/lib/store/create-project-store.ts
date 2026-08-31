import { create } from "zustand"

interface CreateProjectUiState {
  /** Le modal global de création de projet est-il ouvert ? */
  open: boolean
  openCreateProject: () => void
  closeCreateProject: () => void
}

/**
 * Pilote le modal GLOBAL de création de projet (monté une seule fois dans l'`AppShell`, comme
 * {@link useSettingsStore} / l'UpgradeDialog).
 *
 * <p>Avant, « New project » naviguait vers `…/projects?new=1` et la page ouvrait le modal au montage.
 * En dev, le double-montage de React Strict Mode rejouait l'animation d'ouverture → le modal
 * clignotait (ouvre / se ferme « parce que la page change » / rouvre). Ouvrir le modal <b>en place</b>
 * (un simple booléen, aucune navigation) supprime le changement de page - donc le clignotement.</p>
 */
export const useCreateProjectStore = create<CreateProjectUiState>((set) => ({
  open: false,
  openCreateProject: () => set({ open: true }),
  closeCreateProject: () => set({ open: false }),
}))
