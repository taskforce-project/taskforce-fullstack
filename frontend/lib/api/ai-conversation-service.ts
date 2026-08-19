/**
 * Conversations Cortex (multi-conversation + historique).
 * `/api/workspaces/{slug}/ai/conversations`
 */
import { apiClient } from "./client"
import { AI_ROUTES } from "../config/api-routes"

export interface ConversationSummary {
  id: number
  title: string
  updatedAt: string | null
  messageCount: number
  totalTokens: number
}

export interface ConversationMessage {
  id: number
  role: "user" | "assistant"
  content: string
  mode: string | null
  totalTokens: number
  createdAt: string | null
}

export interface ConversationDetail {
  id: number
  title: string
  totalTokens: number
  messages: ConversationMessage[]
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

export async function deleteConversation(slug: string, id: number): Promise<void> {
  await apiClient.delete(AI_ROUTES.CONVERSATION(slug, id))
}
