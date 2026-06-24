/**
 * Service Assistant IA (QA2-16).
 * Appelle l'endpoint backend `POST /api/workspaces/{slug}/assistant` (variante JSON).
 * Le backend délègue à Groq (ou fallback Java si la clé n'est pas configurée).
 */
import { apiClient } from "./client"
import { ASSISTANT_ROUTES } from "../config/api-routes"

interface AssistantTextResponse {
  content: string
}

/** Envoie un message à l'assistant et renvoie sa réponse texte. */
export async function sendAssistantMessage(slug: string, message: string): Promise<string> {
  const res = await apiClient.post<{ data: AssistantTextResponse }>(
    ASSISTANT_ROUTES.CHAT(slug),
    { message },
  )
  return res.data.data.content
}
