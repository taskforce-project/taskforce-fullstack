/**
 * Conversations Cortex (multi-conversation + historique).
 * `/api/workspaces/{slug}/ai/conversations`
 */
import { AI_TIMEOUT_MS, apiClient } from "./client"
import type { AssistantRead } from "./assistant-service"
import { AI_ROUTES } from "../config/api-routes"

export interface ConversationSummary {
  id: number
  title: string
  updatedAt: string | null
  messageCount: number
  totalTokens: number
  /** Le projet où la conversation travaille (R121, R135) ; null sans projet, absent d'un serveur plus ancien. */
  projectId?: number | null
}

export interface ConversationMessage {
  id: number
  role: "user" | "assistant"
  content: string
  mode: string | null
  totalTokens: number
  createdAt: string | null
  /** Le modèle qui a écrit la réponse ; absent d'une demande, d'un repli et des messages d'avant le 05/11/2026. */
  model?: string | null
  /** Ce que TaskForce lui a donné à lire (la ligne grise, R123) ; absent des messages d'avant lot 3 de la fenêtre. */
  read?: AssistantRead | null
  /** Les fichiers joints à cette demande (R134) ; leur contenu reste au serveur. */
  files?: { name: string }[]
}

export interface ConversationDetail {
  id: number
  title: string
  totalTokens: number
  messages: ConversationMessage[]
  /** Le projet où elle travaille (R135) ; null sans projet, absent d'un serveur plus ancien. */
  projectId?: number | null
}

export async function listConversations(slug: string): Promise<ConversationSummary[]> {
  const res = await apiClient.get<{ data: ConversationSummary[] }>(AI_ROUTES.CONVERSATIONS(slug))
  return res.data.data
}

export async function getConversation(slug: string, id: number): Promise<ConversationDetail> {
  const res = await apiClient.get<{ data: ConversationDetail }>(AI_ROUTES.CONVERSATION(slug, id))
  return res.data.data
}

export async function createConversation(slug: string): Promise<ConversationSummary> {
  const res = await apiClient.post<{ data: ConversationSummary }>(AI_ROUTES.CONVERSATIONS(slug))
  return res.data.data
}

/** Le projet où la conversation travaille (R135), choisi dans la rangée sous le compositeur ; null pour aucun. */
export async function setConversationProject(slug: string, id: number, projectId: number | null): Promise<ConversationSummary> {
  const res = await apiClient.put<{ data: ConversationSummary }>(AI_ROUTES.CONVERSATION_PROJECT(slug, id), { projectId }, { silentError: true })
  return res.data.data
}

export async function deleteConversation(slug: string, id: number): Promise<void> {
  await apiClient.delete(AI_ROUTES.CONVERSATION(slug, id))
}

/**
 * Ce que « /compact » a fait : les messages condensés dans le résumé de la conversation (0 sans rien à condenser), ce résumé,
 * et ce qui partirait maintenant au modèle, compté par le serveur contre sa fenêtre (TF-J1-15).
 */
export interface ConversationCompaction {
  summarized: number
  summary?: string | null
  contextTokens?: number
  contextWindow?: number | null
  contextEstimated?: boolean
}

export async function compactConversation(slug: string, id: number): Promise<ConversationCompaction> {
  // Le serveur demande au modèle un résumé : le temps d'une réponse de Cortex, pas celui d'une lecture.
  const res = await apiClient.post<{ data: ConversationCompaction }>(AI_ROUTES.CONVERSATION_COMPACT(slug, id), undefined, { timeout: AI_TIMEOUT_MS, silentError: true })
  return res.data.data
}
