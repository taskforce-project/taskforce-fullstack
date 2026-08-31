"use client"

import { CreateProjectDialog } from "@/components/dialogs/create-project-dialog"
import { useCreateProjectStore } from "@/lib/store/create-project-store"

/**
 * Modal GLOBAL de création de projet - monté une seule fois dans l'`AppShell`, piloté par
 * {@link useCreateProjectStore}. N'importe quel CTA (« New project » sidebar, tuile dashboard,
 * Ctrl+K, bouton de la page Opérations) appelle `openCreateProject()` : le modal s'ouvre en place,
 * sans navigation.
 */
export function CreateProjectModal() {
  const open = useCreateProjectStore((s) => s.open)
  const closeCreateProject = useCreateProjectStore((s) => s.closeCreateProject)

  return <CreateProjectDialog open={open} onOpenChange={(o) => { if (!o) closeCreateProject() }} />
}
