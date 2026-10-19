/**
 * État de l'IA de l'instance : `GET /api/ai/status`. Sert à afficher « IA non configurée » plutôt que
 * d'attendre une réponse qui ne viendra pas. Aucune URL ni clé n'est exposée, seulement les modèles.
 */
import { apiClient } from "./client"
import { AI_ROUTES } from "../config/api-routes"

export interface AiStatus {
  /** L'instance a un fournisseur d'IA (sinon l'IA est coupée). */
  configured: boolean
  /** Le modèle de conversation répond. */
  chatAvailable: boolean
  chatModel: string | null
  fastModel: string | null
  /** Le modèle d'embeddings répond (sinon le Brain OS cherche en plein texte). */
  embeddingsAvailable: boolean
  embeddingModel: string | null
}

export async function getAiStatus(): Promise<AiStatus> {
  const res = await apiClient.get<{ data: AiStatus }>(AI_ROUTES.STATUS, { silentError: true })
  return res.data.data
}
