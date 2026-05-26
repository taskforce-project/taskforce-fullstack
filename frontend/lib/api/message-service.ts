/**
 * Service REST pour les channels et messages de chat.
 */
import { apiClient } from "./client"
import { MESSAGE_ROUTES } from "../config/api-routes"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChannelKind = "CHANNEL" | "DM" | "GROUP_DM" | "PROJECT_CHANNEL"

export interface ChannelSummary {
  id:           number
  kind:         ChannelKind
  name:         string | null
  description:  string | null
  isPrivate:    boolean
  projectId:    number | null
  projectName:  string | null
  memberCount:  number
}

export interface ApiChatMessage {
  id:             number
  channelId:      number
  authorId:       number | null
  authorName:     string
  authorInitials: string
  content:        string
  isEdited:       boolean
  createdAt:      string
  updatedAt:      string
}

export interface CreateChannelPayload {
  kind:       ChannelKind
  name?:      string
  description?: string
  isPrivate?: boolean
  memberIds?: number[]
  projectId?: number
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function listChannels(slug: string): Promise<ChannelSummary[]> {
  const res = await apiClient.get<{ data: ChannelSummary[] }>(MESSAGE_ROUTES.CHANNELS(slug))
  return res.data.data
}

export async function createChannel(slug: string, payload: CreateChannelPayload): Promise<ChannelSummary> {
  const res = await apiClient.post<{ data: ChannelSummary }>(MESSAGE_ROUTES.CHANNELS(slug), payload)
  return res.data.data
}

export async function listMessages(slug: string, channelId: number): Promise<ApiChatMessage[]> {
  const res = await apiClient.get<{ data: ApiChatMessage[] }>(MESSAGE_ROUTES.MESSAGES(slug, channelId))
  return res.data.data
}

export async function editMessage(
  slug: string,
  channelId: number,
  messageId: number,
  content: string
): Promise<ApiChatMessage> {
  const res = await apiClient.patch<{ data: ApiChatMessage }>(
    MESSAGE_ROUTES.EDIT_MSG(slug, channelId, messageId),
    { content }
  )
  return res.data.data
}

export async function deleteMessage(
  slug: string,
  channelId: number,
  messageId: number
): Promise<void> {
  await apiClient.delete(MESSAGE_ROUTES.DELETE_MSG(slug, channelId, messageId))
}
