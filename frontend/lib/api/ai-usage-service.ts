/**
 * Service consommation IA : `GET /api/workspaces/{slug}/ai/usage`.
 * Renvoie la conso du mois courant + le plafond posé par l'instance (illimité par défaut).
 */
import { apiClient } from "./client"
import { AI_ROUTES } from "../config/api-routes"

export interface AiUsage {
  usedTokens: number
  /** -1 = illimité (défaut : l'instance ne pose pas de plafond). */
  limitTokens: number
  promptTokens: number
  completionTokens: number
  requestCount: number
  period: string
  resetAt: string
}

export async function getAiUsage(slug: string): Promise<AiUsage> {
  const res = await apiClient.get<{ data: AiUsage }>(AI_ROUTES.USAGE(slug))
  return res.data.data
}
