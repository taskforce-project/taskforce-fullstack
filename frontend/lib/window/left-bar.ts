import type { ConversationSummary } from "@/lib/api/ai-conversation-service"
import type { Project } from "@/lib/api/project-service"

/**
 * Ce que la barre de gauche range (R121, séance n°18) : le travail d'abord, chaque projet avec ses conversations, puis
 * les conversations sans projet. Une conversation se range sous le projet où elle a commencé ; celle d'un projet que la
 * barre ne montre pas (archivé, ou hors de vue) va avec les conversations sans projet.
 */
export interface ConversationGroups {
  readonly byProject: ReadonlyMap<number, ConversationSummary[]>
  readonly loose: ConversationSummary[]
}

/** Les projets de la barre : ceux qui vivent (actifs ou en pause), les favoris d'abord, sinon l'ordre de l'API. */
export function leftBarProjects(projects: readonly Project[]): Project[] {
  const shown = projects.filter((project) => project.status !== "ARCHIVED")
  return [...shown.filter((project) => project.isFavorite), ...shown.filter((project) => !project.isFavorite)]
}

export function groupConversations(
  conversations: readonly ConversationSummary[],
  projects: readonly Pick<Project, "id">[],
): ConversationGroups {
  const shown = new Set(projects.map((project) => project.id))
  const byProject = new Map<number, ConversationSummary[]>()
  const loose: ConversationSummary[] = []
  for (const conversation of conversations) {
    const projectId = conversation.projectId ?? null
    if (projectId !== null && shown.has(projectId)) {
      byProject.set(projectId, [...(byProject.get(projectId) ?? []), conversation])
    } else {
      loose.push(conversation)
    }
  }
  return { byProject, loose }
}
