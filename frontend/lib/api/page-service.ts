import { apiClient } from "@/lib/api/client"
import { ISSUE_ROUTES, PAGE_ROUTES } from "@/lib/config/api-routes"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PageSummary {
  id: number
  title: string
  emoji: string
  excerpt: string
  createdByName: string
  createdByInitials: string
  createdAt: string
  updatedAt: string
}

export interface PageDetail extends PageSummary {
  content: string | null
}

export interface CreatePagePayload {
  title: string
  emoji?: string
  content?: string
}

export interface UpdatePagePayload {
  title?: string
  emoji?: string
  content?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

/** Page rendue dans une vue cross-projets : le projet porteur voyage avec la page. */
export interface WorkspacePage {
  projectId: number
  projectName: string
  page: PageSummary
}

export const pageService = {
  async list(slug: string, projectId: string): Promise<PageSummary[]> {
    const res = await apiClient.get<{ data: PageSummary[] }>(PAGE_ROUTES.LIST(slug, projectId))
    return res.data.data
  },

  /**
   * Pages récentes de tous les projets visibles du workspace, en UN appel.
   * Remplace la boucle « un appel par projet » de « Ma file », qui épuisait le rate limit.
   */
  async listWorkspaceRecent(slug: string): Promise<WorkspacePage[]> {
    const res = await apiClient.get<{ data: WorkspacePage[] }>(ISSUE_ROUTES.MY_PAGES(slug))
    return res.data.data
  },

  async get(slug: string, projectId: string, pageId: string): Promise<PageDetail> {
    const res = await apiClient.get<{ data: PageDetail }>(PAGE_ROUTES.GET(slug, projectId, pageId))
    return res.data.data
  },

  async create(slug: string, projectId: string, payload: CreatePagePayload): Promise<PageDetail> {
    const res = await apiClient.post<{ data: PageDetail }>(PAGE_ROUTES.CREATE(slug, projectId), payload)
    return res.data.data
  },

  async update(slug: string, projectId: string, pageId: string, payload: UpdatePagePayload): Promise<PageDetail> {
    const res = await apiClient.patch<{ data: PageDetail }>(PAGE_ROUTES.UPDATE(slug, projectId, pageId), payload)
    return res.data.data
  },

  async delete(slug: string, projectId: string, pageId: string): Promise<void> {
    await apiClient.delete(PAGE_ROUTES.DELETE(slug, projectId, pageId))
  },
}
