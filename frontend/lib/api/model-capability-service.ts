/**
 * Ce que sait faire chaque modèle que la passerelle joint (R113, séance n°16) : `/api/workspaces/{slug}/ai/models`.
 * La table de l'instance, une mesure qui rejoue les cas fixes un par un, et le modèle que la personne prend pour Cortex
 * dans la webapp. Aucune adresse ni clé n'est exposée, seulement les noms de modèles et leurs notes.
 */
import { apiClient, AI_TIMEOUT_MS } from "./client"
import { AI_MODEL_ROUTES } from "../config/api-routes"

/** Une capacité de la table : tools, context, code, french, english. */
export interface ModelCapabilityInfo {
  key: string
  label: string
  description: string
  cases: number
}

/** Un cas fixe de la suite : il se rejoue par sa clé. */
export interface ModelCapabilityCase {
  key: string
  capability: string
  title: string
}

/**
 * Une cellule : la dernière note de chaque cas de la capacité. `capable` quand tous ses cas sont mesurés et réussis ;
 * `heldWords`, pour le contexte, le plus long document tenu (0 si aucun, null sans mesure).
 */
export interface ModelCapabilityScore {
  capability: string
  passed: number
  measured: number
  total: number
  capable: boolean
  heldWords: number | null
  measuredAt: string | null
}

export interface ModelCapabilityRow {
  model: string
  /** Cortex répond avec ce modèle à la personne. */
  current: boolean
  measuredAt: string | null
  scores: ModelCapabilityScore[]
}

export interface ModelCapabilityProposal {
  capability: string
  model: string
}

export interface ModelCapabilityTable {
  /** OLLAMA, OPENAI (toute API compatible) ou ANTHROPIC ; null quand l'IA est coupée. */
  provider: string | null
  instanceModel: string | null
  /** Le modèle choisi par la personne pour Cortex dans la webapp, ou null. */
  choice: string | null
  current: string | null
  suiteVersion: number
  capabilities: ModelCapabilityInfo[]
  cases: ModelCapabilityCase[]
  models: ModelCapabilityRow[]
  proposals: ModelCapabilityProposal[]
  /** Le premier modèle capable de tout ce qui se mesure, ou null. */
  proposed: string | null
}

export interface ModelCapabilityRunStarted {
  runId: number
  model: string
  startedAt: string
  cases: string[]
}

export interface ModelCapabilityCheck {
  criterion: string
  passed: boolean
  detail: string
}

export interface ModelCapabilityResult {
  caseKey: string
  capability: string
  passed: boolean
  checks: ModelCapabilityCheck[]
  answer: string
  model: string | null
  promptTokens: number
}

/** La table, lue en arrière-plan : sans message d'erreur, l'écran dit lui-même ce qui manque. */
export async function getModelCapabilities(slug: string): Promise<ModelCapabilityTable> {
  const res = await apiClient.get<{ data: ModelCapabilityTable }>(AI_MODEL_ROUTES.TABLE(slug), { silentError: true })
  return res.data.data
}

export async function startModelMeasure(slug: string, model: string): Promise<ModelCapabilityRunStarted> {
  const res = await apiClient.post<{ data: ModelCapabilityRunStarted }>(AI_MODEL_ROUTES.RUNS(slug), { model })
  return res.data.data
}

/** Rejoue un cas sur le modèle de la mesure : une réponse du modèle, donc le délai de l'IA. */
export async function measureModelCase(slug: string, runId: number, caseKey: string): Promise<ModelCapabilityResult> {
  const res = await apiClient.post<{ data: ModelCapabilityResult }>(
    AI_MODEL_ROUTES.RUN_CASE(slug, runId, caseKey), undefined, { timeout: AI_TIMEOUT_MS },
  )
  return res.data.data
}

/** Le modèle de Cortex pour la personne ; null la ramène à celui de l'instance. */
export async function chooseModel(slug: string, model: string | null): Promise<ModelCapabilityTable> {
  const res = await apiClient.put<{ data: ModelCapabilityTable }>(AI_MODEL_ROUTES.CHOICE(slug), { model })
  return res.data.data
}
