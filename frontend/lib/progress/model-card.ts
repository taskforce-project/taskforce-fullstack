import type { ModelCard } from "@/lib/api/model-capability-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"

type ProgressTexts = (typeof CONSTANTS_EN)["progress"]

/**
 * Ce que dit la fiche d'un modèle pas encore mesuré, en une ligne (R113, R125) : « 8.2B parameters · a context window
 * of 40,960 tokens · takes tools ». Seulement ce que la fiche dit ; null quand elle ne dit rien. La ligne se montre
 * comme une description (« Its description says »), jamais comme une note.
 */
export function cardLine(card: ModelCard | null | undefined, t: ProgressTexts): string | null {
  if (!card) return null
  const parts = [
    card.parameters ? fillText(t.cardParameters, { parameters: card.parameters }) : null,
    card.contextWindow ? fillText(t.cardWindow, { tokens: card.contextWindow.toLocaleString("en-US") }) : null,
    card.tools === true ? t.cardTools : card.tools === false ? t.cardNoTools : null,
  ].filter((part): part is string => part !== null)
  return parts.length === 0 ? null : fillText(t.fromDescription, { card: parts.join(" · ") })
}
