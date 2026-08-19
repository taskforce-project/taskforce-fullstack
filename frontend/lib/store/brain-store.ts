/**
 * Store Zustand du Brain OS (knowledge graph d'un workspace).
 * Charge la vue d'ensemble (nodes + edges + comptage par domaine) et gère le CRUD nodes.
 */
import { create } from "zustand"
import {
  getBrainOverview,
  createNode as createNodeApi,
  updateNode as updateNodeApi,
  deleteNode as deleteNodeApi,
  searchBrain as searchBrainApi,
  createEdge as createEdgeApi,
  deleteEdge as deleteEdgeApi,
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
  removeNode: (slug: string, nodeId: number) => Promise<void>
  search: (slug: string, query: string) => Promise<void>
  clearSearch: () => void
  linkNodes: (slug: string, fromNodeId: number, toNodeId: number, relationType: string) => Promise<void>
  unlink: (slug: string, edgeId: number) => Promise<void>
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
      set({ error: "Impossible de charger le Brain OS", loading: false })
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
      set({ searchResults: [], searching: false, error: "Recherche indisponible" })
    }
  },

  clearSearch: () => set({ searchQuery: "", searchResults: null, searching: false }),

  linkNodes: async (slug, fromNodeId, toNodeId, relationType) => {
    await createEdgeApi(slug, fromNodeId, toNodeId, relationType)
    await get().fetchOverview(slug)
  },

  unlink: async (slug, edgeId) => {
    await deleteEdgeApi(slug, edgeId)
    await get().fetchOverview(slug)
  },
}))
