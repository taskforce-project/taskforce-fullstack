/**
 * Store Zustand du Brain OS (pages de connaissance d'un workspace).
 * Charge la vue d'ensemble (nodes + edges + comptage par domaine) et gère le CRUD nodes.
 */
import { create } from "zustand"
import {
  getBrainOverview,
  createNode as createNodeApi,
  updateNode as updateNodeApi,
  moveNode as moveNodeApi,
  deleteNode as deleteNodeApi,
  searchBrain as searchBrainApi,
  type BrainOverview,
  type KnowledgeNode,
  type KnowledgeSearchHit,
  type CreateNodeInput,
  type UpdateNodeInput,
} from "../api/brain-service"

interface BrainState {
  overview: BrainOverview | null
  loading: boolean
  error: string | null
  selectedNodeId: number | null

  // Recherche sémantique
  searchQuery: string
  searchResults: KnowledgeSearchHit[] | null
  searching: boolean

  fetchOverview: (slug: string) => Promise<void>
  selectNode: (nodeId: number | null) => void
  addNode: (slug: string, input: CreateNodeInput) => Promise<KnowledgeNode>
  editNode: (slug: string, nodeId: number, input: UpdateNodeInput) => Promise<void>
  /** Déplace une page dans l'arbre (drag-to-nest). parentNodeId null = racine du domaine. Avale l'erreur → null. */
  moveNode: (slug: string, nodeId: number, parentNodeId: number | null, domain?: string) => Promise<KnowledgeNode | null>
  removeNode: (slug: string, nodeId: number) => Promise<void>
  search: (slug: string, query: string) => Promise<void>
  clearSearch: () => void
}

export const useBrainStore = create<BrainState>((set, get) => ({
  overview: null,
  loading: false,
  error: null,
  selectedNodeId: null,
  searchQuery: "",
  searchResults: null,
  searching: false,

  fetchOverview: async (slug) => {
    set({ loading: true, error: null })
    try {
      const overview = await getBrainOverview(slug)
      set({ overview, loading: false })
    } catch {
      set({ error: "Couldn't load Brain OS", loading: false })
    }
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  addNode: async (slug, input) => {
    const node = await createNodeApi(slug, input)
    await get().fetchOverview(slug)
    set({ selectedNodeId: node.id })
    return node
  },

  editNode: async (slug, nodeId, input) => {
    await updateNodeApi(slug, nodeId, input)
    await get().fetchOverview(slug)
  },

  moveNode: async (slug, nodeId, parentNodeId, domain) => {
    try {
      const node = await moveNodeApi(slug, nodeId, parentNodeId, domain)
      await get().fetchOverview(slug)
      return node
    } catch {
      return null
    }
  },

  removeNode: async (slug, nodeId) => {
    await deleteNodeApi(slug, nodeId)
    const { selectedNodeId } = get()
    await get().fetchOverview(slug)
    if (selectedNodeId === nodeId) set({ selectedNodeId: null })
  },

  search: async (slug, query) => {
    const q = query.trim()
    if (!q) {
      set({ searchQuery: "", searchResults: null, searching: false })
      return
    }
    set({ searchQuery: query, searching: true })
    try {
      const results = await searchBrainApi(slug, q)
      set({ searchResults: results, searching: false })
    } catch {
      set({ searchResults: [], searching: false, error: "Search is unavailable" })
    }
  },

  clearSearch: () => set({ searchQuery: "", searchResults: null, searching: false }),
}))
