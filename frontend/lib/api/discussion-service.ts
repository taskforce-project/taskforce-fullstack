import apiClient from "@/lib/api/api-client"
import { DISCUSSION_ROUTES } from "@/lib/config/api-routes"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiscussionCategory = "GENERAL" | "ANNOUNCEMENT" | "IDEA" | "QUESTION" | "SHOW"
export type DiscussionState = "OPEN" | "ANSWERED" | "CLOSED"

export interface Discussion {
  id: number
  title: string
  body: string | null
  category: DiscussionCategory
  state: DiscussionState
  authorId: number | null
  authorName: string
  authorInitials: string
  authorAvatarUrl: string | null
  replyCount: number
  reactionCount: number
  isPinned: boolean
  isLocked: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface CreateDiscussionPayload {
  title: string
  body?: string
  category?: DiscussionCategory
  tags?: string[]
}

export interface UpdateDiscussionPayload {
  title?: string
  body?: string
  category?: DiscussionCategory
  state?: DiscussionState
  tags?: string[]
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const discussionService = {
  list: (slug: string, category?: DiscussionCategory): Promise<Discussion[]> =>
    apiClient
      .get<{ data: Discussion[] }>(DISCUSSION_ROUTES.LIST(slug), {
        params: category ? { category } : undefined,
      })
      .then((r) => r.data.data),

  get: (slug: string, id: number): Promise<Discussion> =>
    apiClient
      .get<{ data: Discussion }>(DISCUSSION_ROUTES.BY_ID(slug, id))
      .then((r) => r.data.data),

  create: (slug: string, payload: CreateDiscussionPayload): Promise<Discussion> =>
    apiClient
      .post<{ data: Discussion }>(DISCUSSION_ROUTES.CREATE(slug), payload)
      .then((r) => r.data.data),

  update: (slug: string, id: number, payload: UpdateDiscussionPayload): Promise<Discussion> =>
    apiClient
      .patch<{ data: Discussion }>(DISCUSSION_ROUTES.UPDATE(slug, id), payload)
      .then((r) => r.data.data),

  delete: (slug: string, id: number): Promise<void> =>
    apiClient.delete(DISCUSSION_ROUTES.DELETE(slug, id)).then(() => undefined),

  togglePin: (slug: string, id: number): Promise<Discussion> =>
    apiClient
      .patch<{ data: Discussion }>(DISCUSSION_ROUTES.PIN(slug, id))
      .then((r) => r.data.data),

  toggleLock: (slug: string, id: number): Promise<Discussion> =>
    apiClient
      .patch<{ data: Discussion }>(DISCUSSION_ROUTES.LOCK(slug, id))
      .then((r) => r.data.data),
}
