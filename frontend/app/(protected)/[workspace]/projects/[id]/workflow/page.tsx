"use client"

import { useParams } from "next/navigation"

import { WorkflowView } from "@/components/workflow/workflow-view"

function extractParam(p: string | string[] | undefined): string {
  if (typeof p === "string") return p
  if (Array.isArray(p)) return p[0] ?? ""
  return ""
}

/**
 * Le workflow d'un projet (séance n°25, W1), dans le volet comme le tableau (ADR-026) : `/{slug}/projects/{id}/workflow`,
 * le nœud choisi dans l'adresse (`?node=`), la densité (`?view=`) et le filtre (`?filter=`) aussi ; l'issue s'ouvre
 * par-dessus (`?issue=`), la vue reste montée dessous.
 */
export default function ProjectWorkflowPage() {
  const params = useParams()
  const workspace = extractParam(params.workspace)
  const projectId = Number(extractParam(params.id))
  if (!workspace || !projectId) return null
  return <WorkflowView slug={workspace} projectId={projectId} />
}
