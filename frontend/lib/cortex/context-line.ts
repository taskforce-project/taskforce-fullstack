import type { ContextRead } from "@/lib/api/assistant-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"

type ContextFitTexts = (typeof CONSTANTS_EN)["contextFit"]

/** Ce qui se dit quand une réponse a dû faire tenir la fenêtre de son modèle : une ligne, et son détail au survol (R129). */
export interface ContextFitLine {
  line: string
  detail: string
}

const count = (n: number, one: string, many: string): string => fillText(n === 1 ? one : many, { count: String(n) })

/**
 * La ligne calme de la conversation quand TaskForce a dû condenser ou couper pour tenir la fenêtre du modèle (TF-J1-13,
 * dans le style de la ligne grise, R123, R129) : ce qui pèse le plus sur la réponse d'abord, le reste au survol. Null
 * quand rien n'a été touché, ou sans modèle (un repli). Elle se relit avec la réponse dans une conversation rouverte.
 */
export function contextFitLine(
  context: ContextRead | null | undefined,
  model: string | null | undefined,
  t: ContextFitTexts,
): ContextFitLine | null {
  const name = model?.trim()
  if (!context || !name) return null
  const { summarized, leftOut, toolResults } = context
  const said = leftOut > 0 ? t.leftOut : summarized > 0 ? t.summarized : toolResults > 0 ? t.toolResults : null
  if (!said) return null
  const detail = [
    summarized > 0 ? count(summarized, t.summarizedOne, t.summarizedMany) : null,
    leftOut > 0 ? count(leftOut, t.leftOutOne, t.leftOutMany) : null,
    toolResults > 0 ? count(toolResults, t.toolResultsOne, t.toolResultsMany) : null,
  ].filter((part): part is string => part !== null).join(" · ")
  return { line: fillText(said, { model: name }), detail }
}

/** Ce que dit « /compact » : la conversation compactée, ou rien à condenser, et le détail au survol (R129). */
export function compactedLine(compacted: number, t: ContextFitTexts): ContextFitLine {
  return compacted > 0
    ? { line: t.compacted, detail: count(compacted, t.summarizedOne, t.summarizedMany) }
    : { line: t.nothingToCompact, detail: t.nothingToCompactDetail }
}
