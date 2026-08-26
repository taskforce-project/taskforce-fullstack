"use client"

import { useParams } from "next/navigation"

import { ProjectMembersManager } from "@/components/projects/project-members-manager"

/**
 * Route conservée pour les liens profonds. La gestion des membres vit désormais dans
 * « Réglages › Membres » (l'onglet « Members » a été retiré de la nav projet, redondant avec
 * l'onglet « Teams » et la section réglages), mais cette URL reste valide et rend le même écran.
 */
export default function ProjectMembersPage() {
  const params = useParams()
  const workspace = typeof params.workspace === "string" ? params.workspace : ""
  const projectId = typeof params.id === "string" ? Number(params.id) : 0

  return <ProjectMembersManager workspace={workspace} projectId={projectId} />
}
