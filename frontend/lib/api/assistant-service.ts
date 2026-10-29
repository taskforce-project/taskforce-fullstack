/**
 * Service Assistant IA agentique.
 * `POST /api/workspaces/{slug}/assistant` (JSON) renvoie une réponse **structurée**
 * (réponse markdown + sources Brain OS + étapes + tool calls). Le backend délègue à l'agent
 * (Groq tool-calling si une clé est configurée, sinon repli RAG : sources réelles).
 */
import { apiClient, AI_TIMEOUT_MS } from "./client"
import { executeMcpAction } from "./integration-service"
import { ASSISTANT_ROUTES } from "../config/api-routes"

export interface AssistantSource {
  title: string
  domain: string
  score: number | null
}
export interface AssistantStep {
  label: string
  status: "pending" | "active" | "done" | "error"
  /** Détail optionnel de l'étape (routing, domaines trouvés, outils appelés…). */
  description: string | null
}
export interface AssistantToolCall {
  name: string
  /** success, error, pending (proposé, il attend l'accord de la personne) ou refused (les règles de l'espace le refusent). */
  status: string
  input: string | null
  output: string | null
  /** Le dossier de la réponse, que l'accord prolonge ; absent d'une réponse rendue avant le noyau. */
  record?: string | null
}
/** Ce que devient une action accordée : faite, refusée par les règles de l'espace (elles ont pu changer), ou en échec. */
export interface AssistantActionResult {
  tool: string
  status: "success" | "refused" | "error"
  output: string
}
/** Tokens réellement consommés par le tour (usage LLM cumulé). */
export interface AssistantUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}
export interface AssistantAnswer {
  answer: string
  reasoning: string | null
  mode: "fast" | "deep" | "fallback"
  sources: AssistantSource[]
  steps: AssistantStep[]
  toolCalls: AssistantToolCall[]
  usage: AssistantUsage
}

/** Réponse d'un tour : la réponse de l'agent + la conversation où il est rattaché (créée si absente). */
export interface ChatTurnResponse {
  conversationId: number
  title: string
  answer: AssistantAnswer
}

/**
 * Envoie un message à l'agent (dans une conversation existante ou nouvelle) et renvoie la réponse
 * structurée + l'id/titre de la conversation.
 */
export async function sendAgentMessage(
  slug: string,
  message: string,
  conversationId?: number | null,
): Promise<ChatTurnResponse> {
  const res = await apiClient.post<{ data: ChatTurnResponse }>(
    ASSISTANT_ROUTES.CHAT(slug),
    { message, conversationId: conversationId ?? null },
    { timeout: AI_TIMEOUT_MS },
  )
  return res.data.data
}

/**
 * Une action proposée que la personne peut accorder : celle d'une réponse du noyau, qui porte son dossier, ou une écriture
 * externe d'une réponse plus ancienne.
 */
export function isApprovable(call: AssistantToolCall): boolean {
  return call.status === "pending" && (Boolean(call.record) || call.name.includes("__"))
}

/**
 * Accorde une action proposée par Cortex. Avec le dossier de la réponse, le serveur la rejuge par les règles de l'espace
 * et la garde au dossier (R35) ; sans dossier, une écriture externe passe par la route de la console MCP.
 */
export async function approveAction(slug: string, call: AssistantToolCall): Promise<AssistantActionResult> {
  if (call.record) {
    const res = await apiClient.post<{ data: AssistantActionResult }>(
      ASSISTANT_ROUTES.ACTION_EXECUTE(slug),
      { tool: call.name, input: call.input ?? "{}", record: call.record },
    )
    return res.data.data
  }
  const args = call.input ? (JSON.parse(call.input) as Record<string, unknown>) : {}
  return { tool: call.name, status: "success", output: await executeMcpAction(slug, call.name, args) }
}

/** Variante texte (compat) : renvoie seulement la réponse markdown. */
export async function sendAssistantMessage(slug: string, message: string): Promise<string> {
  return (await sendAgentMessage(slug, message)).answer.answer
}
