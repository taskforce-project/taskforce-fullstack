import { create } from "zustand"
import {
  discussionService,
  type Discussion,
  type DiscussionCategory,
  type CreateDiscussionPayload,
  type UpdateDiscussionPayload,
} from "@/lib/api/discussion-service"

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

interface DiscussionStore {
  discussions: Discussion[]
  loading: boolean
  error: string | null

  fetchDiscussions: (slug: string, category?: DiscussionCategory) => Promise<void>
  createDiscussion: (slug: string, payload: CreateDiscussionPayload) => Promise<Discussion>
  updateDiscussion: (slug: string, id: number, payload: UpdateDiscussionPayload) => Promise<void>
  deleteDiscussion: (slug: string, id: number) => Promise<void>
  togglePin: (slug: string, id: number) => Promise<void>
  toggleLock: (slug: string, id: number) => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useDiscussionStore = create<DiscussionStore>((set) => ({
  discussions: [],
  loading: false,
  error: null,

  fetchDiscussions: async (slug, category) => {
    set({ loading: true, error: null })
    try {
      const discussions = await discussionService.list(slug, category)
      set({ discussions, loading: false })
    } catch {
      set({ loading: false, error: "Impossible de charger les discussions" })
    }
  },

  createDiscussion: async (slug, payload) => {
    const discussion = await discussionService.create(slug, payload)
    set((state) => ({ discussions: [discussion, ...state.discussions] }))
    return discussion
  },

  updateDiscussion: async (slug, id, payload) => {
    const updated = await discussionService.update(slug, id, payload)
    set((state) => ({
      discussions: state.discussions.map((d) => (d.id === id ? updated : d)),
    }))
  },

  deleteDiscussion: async (slug, id) => {
    await discussionService.delete(slug, id)
    set((state) => ({ discussions: state.discussions.filter((d) => d.id !== id) }))
  },

  togglePin: async (slug, id) => {
    const updated = await discussionService.togglePin(slug, id)
    set((state) => ({
      discussions: state.discussions.map((d) => (d.id === id ? updated : d)),
    }))
  },

  toggleLock: async (slug, id) => {
    const updated = await discussionService.toggleLock(slug, id)
    set((state) => ({
      discussions: state.discussions.map((d) => (d.id === id ? updated : d)),
    }))
  },
}))
