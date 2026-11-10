import type { AssistantRead } from "@/lib/api/assistant-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { formatTokens, type CortexContext } from "@/lib/cortex/context-gauge"
import { fillText } from "@/lib/delivery/result-card"

type ContextTexts = (typeof CONSTANTS_EN)["rail"]["context"]

/**
 * La carte « Context » (R122, R141) : d'un regard, ce que Cortex voit (le volet ouvert, R114) ; un clic plus loin, la place
 * que sa dernière réponse a prise et ce qu'elle a lu, sans « window » ni « tokens » (R133). Les chiffres sont ceux de la
 * jauge de contexte (`lib/cortex/context-gauge.ts`).
 */

export interface ContextSees {
  /** Le projet du volet, par son nom ; null sans projet à l'écran. */
  readonly project: string | null
  /** L'issue ouverte, par sa clé ; null sans issue ouverte. */
  readonly issue: string | null
}

/** La part de la fenêtre que la dernière demande a prise, de 0 à 100 ; null quand la fenêtre n'est pas connue. */
export function windowShare(context: CortexContext | null): number | null {
  if (!context?.window) return null
  return Math.min(100, Math.round((Math.max(0, context.tokens) / context.window) * 100))
}

/** Ce que Cortex voit, d'un regard. */
export function contextSees(input: ContextSees, t: ContextTexts): string {
  if (input.project === null) return t.seesNothing
  return input.issue
    ? fillText(t.seesIssue, { issue: input.issue, project: input.project })
    : fillText(t.seesBoard, { project: input.project })
}

/** Un mot pèse environ un jeton et un tiers : un ordre de grandeur, dit « about » (le détail brut reste au survol). */
const WORDS_PER_TOKEN = 0.75

/** La place que la dernière réponse a prise, en mots de tous les jours. */
export function contextRoom(context: CortexContext | null, model: string | null, t: ContextTexts): string {
  if (!context) return t.roomNone
  const share = windowShare(context)
  if (share === null) return fillText(t.roomWords, { words: Math.round(context.tokens * WORDS_PER_TOKEN).toLocaleString("en-US") })
  return fillText(context.estimated ? t.roomEstimated : t.room, { percent: share, model: model ?? t.theModel })
}

/** La taille brute de la dernière demande : au survol, deux gestes plus loin (R133). */
export function contextRaw(context: CortexContext | null): string | undefined {
  return context ? `${formatTokens(context.tokens)} tokens` : undefined
}

const counted = (count: number, one: string, many: string): string | null =>
  count === 0 ? null : count === 1 ? one : fillText(many, { count })

/** Ce que la dernière réponse a lu, par genre (« It read 2 issues, 1 board and 3 notes. ») ; null quand elle n'en dit rien. */
export function contextRead(read: AssistantRead | null | undefined, t: ContextTexts): string | null {
  if (!read) return null
  const parts = [
    counted(read.issues?.length ?? 0, t.issue, t.issues),
    counted(read.boards?.length ?? 0, t.board, t.boards),
    counted(read.notes ?? 0, t.note, t.notes),
  ].filter((part): part is string => part !== null)
  if (parts.length === 0) return null
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}${t.and}${parts[parts.length - 1]}`
  return fillText(t.read, { list })
}
