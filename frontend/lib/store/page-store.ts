import { create } from "zustand"
import {
  pageService,
  type PageSummary,
  type PageDetail,
  type CreatePagePayload,
  type UpdatePagePayload,
} from "@/lib/api/page-service"

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

interface PageStore {
  pages: PageSummary[]
  currentPage: PageDetail | null
  loading: boolean
  error: string | null

  fetchPages: (slug: string, projectId: string) => Promise<void>
  fetchPage: (slug: string, projectId: string, pageId: string) => Promise<void>
  createPage: (slug: string, projectId: string, payload: CreatePagePayload) => Promise<PageDetail>
  updatePage: (slug: string, projectId: string, pageId: string, payload: UpdatePagePayload) => Promise<void>
  deletePage: (slug: string, projectId: string, pageId: string) => Promise<void>
  clearCurrentPage: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const usePageStore = create<PageStore>((set) => ({
  pages: [],
  currentPage: null,
  loading: false,
  error: null,

  fetchPages: async (slug, projectId) => {
    set({ loading: true, error: null })
    try {
      const pages = await pageService.list(slug, projectId)
      set({ pages, loading: false })
    } catch {
      set({ loading: false, error: "Impossible de charger les pages" })
    }
  },

  fetchPage: async (slug, projectId, pageId) => {
    set({ loading: true, error: null })
    try {
      const page = await pageService.get(slug, projectId, pageId)
      set({ currentPage: page, loading: false })
    } catch {
      set({ loading: false, error: "Impossible de charger la page" })
    }
  },

  createPage: async (slug, projectId, payload) => {
    const page = await pageService.create(slug, projectId, payload)
    const summary: PageSummary = {
      id: page.id,
      title: page.title,
      emoji: page.emoji,
      excerpt: page.excerpt,
      createdByName: page.createdByName,
      createdByInitials: page.createdByInitials,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    }
    set((state) => ({ pages: [summary, ...state.pages] }))
    return page
  },

  updatePage: async (slug, projectId, pageId, payload) => {
    const updated = await pageService.update(slug, projectId, pageId, payload)
    set((state) => ({
      pages: state.pages.map((p) =>
        p.id === updated.id
          ? { ...p, title: updated.title, emoji: updated.emoji, excerpt: updated.excerpt, updatedAt: updated.updatedAt }
          : p
      ),
      currentPage: state.currentPage?.id === updated.id ? updated : state.currentPage,
    }))
  },

  deletePage: async (slug, projectId, pageId) => {
    await pageService.delete(slug, projectId, pageId)
    set((state) => ({
      pages: state.pages.filter((p) => String(p.id) !== pageId),
      currentPage: state.currentPage && String(state.currentPage.id) === pageId ? null : state.currentPage,
    }))
  },

  clearCurrentPage: () => set({ currentPage: null }),
}))
