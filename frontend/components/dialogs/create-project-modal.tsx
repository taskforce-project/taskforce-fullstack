"use client"

import { useEffect } from "react"
import { toast } from "sonner"

import { CreateProjectDialog } from "@/components/dialogs/create-project-dialog"
import { useCreateProjectStore } from "@/lib/store/create-project-store"

/**
 * Modal GLOBAL de création de projet - monté une seule fois dans l'`AppShell`, piloté par
 * {@link useCreateProjectStore}. N'importe quel CTA (« New project » sidebar, tuile dashboard,
 * Ctrl+K, bouton de la page Opérations) appelle `openCreateProject()` : le modal s'ouvre en place,
 * sans navigation.
 *
 * <p>Retour OAuth <b>fluide</b> (TF-MCP-04) : quand on connecte un outil depuis le wizard d'import, le
 * callback renvoie sur `…?import=<connector>&mcp=connected` ; cet effet rouvre alors le modal en mode
 * import avec l'outil présélectionné, puis nettoie l'URL - l'utilisateur ne repasse jamais par Settings.</p>
 */
export function CreateProjectModal() {
  const open = useCreateProjectStore((s) => s.open)
  const openCreateProject = useCreateProjectStore((s) => s.openCreateProject)
  const closeCreateProject = useCreateProjectStore((s) => s.closeCreateProject)

  // Même retour fluide pour GitHub connecté depuis la section « dépôt de code » : le callback renvoie sur
  // `…?newProject=repo&github=connected`, on rouvre la création là où elle en était (brouillon restauré).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("newProject") !== "repo") return
    if (params.get("github") === "connected") {
      openCreateProject({ repoSetup: true })
      toast.success("GitHub connected - create or link the repository")
    }
    params.delete("newProject")
    params.delete("github")
    const q = params.toString()
    window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""))
  }, [openCreateProject])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const src = params.get("import")
    const mcp = params.get("mcp")
    if (!src) return
    if (mcp === "connected") {
      openCreateProject({ importSource: src })
      toast.success("Tool connected - pick it and import")
    } else if (mcp === "error") {
      toast.error("Connection failed - try again")
    }
    params.delete("import")
    params.delete("mcp")
    const q = params.toString()
    window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""))
  }, [openCreateProject])

  return <CreateProjectDialog open={open} onOpenChange={(o) => { if (!o) closeCreateProject() }} />
}
