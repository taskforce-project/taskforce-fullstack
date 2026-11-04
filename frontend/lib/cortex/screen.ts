import type { AssistantScreen } from "@/lib/api/assistant-service"

/**
 * Ce que la personne voit quand elle écrit à Cortex (R114, séance n°17) : le projet de la route, et l'issue ouverte,
 * celle de la route (`/projects/12/issues/34`) ou celle de la fiche ouverte par-dessus le tableau. Seulement des ids :
 * le serveur relit ce qu'ils montrent avec les droits de la personne. Null quand aucun projet n'est à l'écran.
 */
export interface OpenIssue {
  projectId: number
  issueId: number
}

const PROJECT_ROUTE = /\/projects\/(\d+)(?:\/issues\/(\d+))?(?:[/?#]|$)/

export function screenFrom(pathname: string | null | undefined, openIssue: OpenIssue | null): AssistantScreen | null {
  const route = PROJECT_ROUTE.exec(pathname ?? "")
  if (openIssue) return { projectId: openIssue.projectId, issueId: openIssue.issueId }
  if (!route) return null
  const projectId = Number(route[1])
  const issueId = route[2] ? Number(route[2]) : null
  return issueId ? { projectId, issueId } : { projectId }
}
