"use client"

import { useEffect } from "react"
import { toast } from "sonner"

import { CreateProjectDialog } from "@/components/dialogs/create-project-dialog"
import { finishMcpReturn } from "@/lib/api/integration-service"
import { useCreateProjectStore } from "@/lib/store/create-project-store"

/**
 * Modal GLOBAL de création de projet - monté une seule fois dans l'`AppShell`, piloté par
 * {@link useCreateProjectStore}. N'importe quel CTA (« New project » sidebar, tuile dashboard,
 * Ctrl+K, bouton de la page Opérations) appelle `openCreateProject()` : le modal s'ouvre en place,
 * sans navigation.
 *
 * <p>Retour OAuth <b>fluide</b> (TF-MCP-04) : quand on connecte un outil depuis le wizard d'import, le
 * callback renvoie sur `…?import=<connector>&mcp=finish` ; cet effet finit la connexion (l'app, connectée), rouvre
 * alors le modal en mode import avec l'outil présélectionné, puis nettoie l'URL - l'utilisateur ne repasse jamais par
 * Settings.</p>
 */
export function CreateProjectModal() {
  const open = useCreateProjectStore((s) => s.open)
  const openCreateProject = useCreateProjectStore((s) => s.openCreateProject)
  const closeCreateProject = useCreateProjectStore((s) => s.closeCreateProject)

  // Même retour fluide pour GitHub connecté depuis la section « dépôt de code » : le callback renvoie sur
  // `…?newProject=repo&github=connected`, on rouvre la création là où elle en était (brouillon restauré).
  // En échec (`github=error` : accès refusé chez GitHub, lien expiré), on la rouvre aussi : le brouillon
  // n'est pas perdu et le bouton « Connect GitHub » est de nouveau là.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("newProject") !== "repo") return
    const github = params.get("github")
    if (github === "connected") {
      openCreateProject({ repoSetup: true })
      toast.success("GitHub connected - create or link the repository")
    } else if (github === "error") {
      openCreateProject({ repoSetup: true })
      toast.error("GitHub wasn't connected. Try again, and accept the access on GitHub.")
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
    const said = (outcome: string | null) => {
      if (outcome === "connected") {
        openCreateProject({ importSource: src })
        toast.success("Tool connected - pick it and import")
      } else if (outcome === "error") {
        toast.error("Connection failed - try again")
      }
    }
    // Le retour du navigateur a gardé le code : l'app, connectée, finit la connexion de la personne qui l'a lancée.
    const finishing = finishMcpReturn(params)
    if (finishing) void finishing.then(({ outcome }) => said(outcome))
    else said(mcp)
    for (const key of ["import", "mcp", "connector", "state", "finish"]) params.delete(key)
    const q = params.toString()
    window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""))
  }, [openCreateProject])

  return <CreateProjectDialog open={open} onOpenChange={(o) => { if (!o) closeCreateProject() }} />
}
