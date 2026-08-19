"use client"

import { useParams } from "next/navigation"
import { ProjectTeamsSection } from "@/components/projects/project-teams-section"

/**
 * Onglet « Teams » d'une opération (QA3-7) : les équipes se gèrent ici (associer
 * une équipe existante ou en créer une). La gestion des membres vit dans les Settings.
 */
export default function ProjectTeamsPage() {
  const params    = useParams()
  const workspace = typeof params.workspace === "string" ? params.workspace : ""
  const projectId = typeof params.id        === "string" ? Number(params.id)  : 0

  return (
    // En-tête retiré : `ProjectTeamsSection` porte déjà le sien (« Membres & équipes » + invitation),
    // on évitait un double en-tête empilé.
    <div className="flex w-full flex-col gap-4">
      <ProjectTeamsSection workspace={workspace} projectId={projectId} />
    </div>
  )
}
