import type { ConversationSummary } from "@/lib/api/ai-conversation-service"
import type { AiStatus } from "@/lib/api/ai-status-service"
import type { Project } from "@/lib/api/project-service"
import { paneOf } from "@/lib/window/pane"

/**
 * Où tourne le modèle de Cortex (R122, « Environment ») : sur cet ordinateur (l'app desktop et son Ollama), chez
 * TaskForce (la webapp, et l'IA de l'instance), chez le fournisseur d'une API (l'app desktop branchée sur une API), ou
 * nulle part tant que rien n'est réglé. `GET /api/ai/status` ne donne la fenêtre de contexte que sur Ollama.
 */
export type ModelPlace = "here" | "taskforce" | "provider" | "none"

export function modelPlace(status: AiStatus | null, desktop: boolean): ModelPlace {
  if (!status?.configured) return "none"
  if (!desktop) return "taskforce"
  return status.contextWindow === null ? "provider" : "here"
}

/** Le modèle qui répond par défaut : le palier rapide de l'instance, celui de Cortex, sinon son modèle de conversation. */
export function cortexModel(status: AiStatus | null): string | null {
  return status?.fastModel ?? status?.chatModel ?? null
}

/** Le projet en vue : celui du volet, sinon celui où la conversation a commencé ; null sans l'un ni l'autre. */
export function projectInView(
  pathname: string | null | undefined,
  conversation: Pick<ConversationSummary, "projectId"> | undefined,
  projects: readonly Project[],
): Project | null {
  const projectId = paneOf(pathname)?.projectId ?? conversation?.projectId ?? null
  return projectId === null ? null : (projects.find((project) => project.id === projectId) ?? null)
}
