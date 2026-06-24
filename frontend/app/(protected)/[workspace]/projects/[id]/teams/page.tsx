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
    <div className="flex w-full flex-col gap-4">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold text-foreground">Équipes</h2>
        <p className="text-xs text-muted-foreground">
          Créez des équipes, gérez leurs membres et associez-les à cette opération.
        </p>
      </div>
      <ProjectTeamsSection workspace={workspace} projectId={projectId} />
    </div>
  )
}
