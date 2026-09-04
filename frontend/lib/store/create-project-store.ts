import { create } from "zustand"

interface CreateProjectUiState {
  /** Le modal global de création de projet est-il ouvert ? */
  open: boolean
  /** Si défini à l'ouverture : ouvrir en mode « import », avec cette source (connectorKey) présélectionnée. */
  importSource: string | null
  openCreateProject: (opts?: { importSource?: string }) => void
  closeCreateProject: () => void
}

/**
 * Pilote le modal GLOBAL de création de projet (monté une seule fois dans l'`AppShell`, comme
 * {@link useSettingsStore} / l'UpgradeDialog).
 *
 * <p>Avant, « New project » naviguait vers `…/projects?new=1` et la page ouvrait le modal au montage.
 * En dev, le double-montage de React Strict Mode rejouait l'animation d'ouverture → le modal
 * clignotait. Ouvrir le modal <b>en place</b> (un simple booléen, aucune navigation) supprime le
 * changement de page - donc le clignotement.</p>
 *
 * <p>`importSource` sert au <b>retour OAuth fluide</b> (TF-MCP-04) : après avoir connecté un outil
 * depuis le wizard, le callback renvoie sur `…?import=X` et le modal se rouvre en mode import sur X.</p>
 */
export const useCreateProjectStore = create<CreateProjectUiState>((set) => ({
  open: false,
  importSource: null,
  openCreateProject: (opts) => set({ open: true, importSource: opts?.importSource ?? null }),
  closeCreateProject: () => set({ open: false, importSource: null }),
}))
