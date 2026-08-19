/**
 * Service Assistant IA agentique.
 * `POST /api/workspaces/{slug}/assistant` (JSON) renvoie une réponse **structurée**
 * (réponse markdown + sources Brain OS + étapes + tool calls). Le backend délègue à l'agent
 * (Groq tool-calling si une clé est configurée, sinon repli RAG : sources réelles).
 */
import { apiClient, AI_TIMEOUT_MS } from "./client"
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
  status: string
  input: string | null
  output: string | null
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

/** Variante texte (compat) : renvoie seulement la réponse markdown. */
export async function sendAssistantMessage(slug: string, message: string): Promise<string> {
  return (await sendAgentMessage(slug, message)).answer.answer
}
