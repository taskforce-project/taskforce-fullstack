/**
 * Service Brain OS — couche de connaissance (knowledge graph) du workspace.
 * Backend : /api/workspaces/{slug}/brain (cf. KnowledgeController).
 */
import { apiClient } from "./client"
import { BRAIN_ROUTES } from "../config/api-routes"

export interface KnowledgeNode {
  id: number
  uuid: string
  type: string
  domain: string
  domainCode: string
  title: string
  content: string | null
  contentUrl: string | null
  status: string
  versionLabel: string
  refType: string | null
  refId: number | null
  parentNodeId: number | null
  tags: string[]
  /** Node du noyau (hub règles/AGENTS) — masqué de l'explorateur par défaut. */
  system: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

export interface KnowledgeEdge {
  id: number
  fromNodeId: number
  toNodeId: number
  relationType: string
  weight: number
  auto: boolean
}

export interface BrainOverview {
  brainId: number | null
  workspaceId: number
  templateType: string | null
  versionLabel: string
  totalNodes: number
  nodesByDomain: Record<string, number>
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
}

export interface KnowledgeSearchHit {
  node: KnowledgeNode
  score: number
}

export interface CreateNodeInput {
  type: string
  domain: string
  title: string
  content?: string
  refType?: string
  refId?: number
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface UpdateNodeInput {
  title?: string
  content?: string
  type?: string
  domain?: string
  status?: string
  versionLabel?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

/** Vue d'ensemble du brain (nodes + edges + comptage par domaine). */
export async function getBrainOverview(slug: string): Promise<BrainOverview> {
  const res = await apiClient.get<{ data: BrainOverview }>(BRAIN_ROUTES.OVERVIEW(slug))
  return res.data.data
}

/** Liste les nodes, optionnellement filtrés par domaine. */
export async function listNodes(slug: string, domain?: string): Promise<KnowledgeNode[]> {
  const res = await apiClient.get<{ data: KnowledgeNode[] }>(BRAIN_ROUTES.NODES(slug), {
    params: domain ? { domain } : undefined,
  })
  return res.data.data
}

/** Récupère un node par son id. */
export async function getNode(slug: string, nodeId: number): Promise<KnowledgeNode> {
  const res = await apiClient.get<{ data: KnowledgeNode }>(BRAIN_ROUTES.NODE(slug, nodeId))
  return res.data.data
}

/** Crée un node. */
export async function createNode(slug: string, input: CreateNodeInput): Promise<KnowledgeNode> {
  const res = await apiClient.post<{ data: KnowledgeNode }>(BRAIN_ROUTES.NODES(slug), input)
  return res.data.data
}

/** Met à jour un node (champs omis = inchangés). */
export async function updateNode(slug: string, nodeId: number, input: UpdateNodeInput): Promise<KnowledgeNode> {
  const res = await apiClient.patch<{ data: KnowledgeNode }>(BRAIN_ROUTES.NODE(slug, nodeId), input)
  return res.data.data
}

/** Supprime un node (les relations sont supprimées en cascade côté backend). */
export async function deleteNode(slug: string, nodeId: number): Promise<void> {
  await apiClient.delete(BRAIN_ROUTES.NODE(slug, nodeId))
}

export interface BrainFile {
  /** URL absolue prête à insérer dans le markdown (image ou lien doc). */
  url: string
  filename: string
  contentType: string
  size: number
  image: boolean
}

/** Upload d'une pièce jointe (image/doc) vers MinIO. Renvoie l'URL absolue de service. */
export async function uploadBrainFile(slug: string, file: File): Promise<BrainFile> {
  const form = new FormData()
  form.append("file", file)
  const res = await apiClient.post<{ data: BrainFile }>(
    BRAIN_ROUTES.FILES(slug),
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  )
  const data = res.data.data
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  // Le backend renvoie un chemin relatif (/api/files/brain/…) → on préfixe l'host public.
  return { ...data, url: data.url.startsWith("http") ? data.url : `${base}${data.url}` }
}

/** Crée une relation (arête) orientée entre deux nodes. */
export async function createEdge(
  slug: string,
  fromNodeId: number,
  toNodeId: number,
  relationType: string,
  weight?: number,
): Promise<KnowledgeEdge> {
  const res = await apiClient.post<{ data: KnowledgeEdge }>(BRAIN_ROUTES.EDGES(slug), {
    fromNodeId,
    toNodeId,
    relationType,
    weight,
  })
  return res.data.data
}

/** Supprime une relation. */
export async function deleteEdge(slug: string, edgeId: number): Promise<void> {
  await apiClient.delete(BRAIN_ROUTES.EDGE(slug, edgeId))
}

/** Recherche sémantique (pgvector). Renvoie les nodes classés par similarité. */
export async function searchBrain(
  slug: string,
  query: string,
  topK = 8,
  domain?: string,
): Promise<KnowledgeSearchHit[]> {
  const res = await apiClient.post<{ data: KnowledgeSearchHit[] }>(BRAIN_ROUTES.SEARCH(slug), {
    query,
    topK,
    domain,
  })
  return res.data.data
}
