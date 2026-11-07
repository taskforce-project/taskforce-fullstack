import { formatTokens, type CortexContext } from "@/lib/cortex/context-gauge"
import { fillText } from "@/lib/delivery/result-card"

/**
 * « Context » (R122) : ce que Cortex voit (le volet ouvert, R114) et la place que sa dernière réponse a prise dans la
 * fenêtre du modèle, en une phrase. Les chiffres sont ceux de la jauge de contexte (`lib/cortex/context-gauge.ts`) : le
 * prompt de la dernière demande contre la fenêtre que la passerelle lui a donnée.
 */
export interface ContextTexts {
  readonly seesBoard: string
  readonly seesIssue: string
  readonly seesNothing: string
  readonly room: string
  readonly roomTokens: string
  readonly theModel: string
  /** La phrase : ce que Cortex voit, seul ou suivi de la place prise. */
  readonly alone: string
  readonly joined: string
}

export interface ContextInput {
  /** Le projet du volet, par son nom ; null sans projet à l'écran. */
  readonly project: string | null
  /** L'issue ouverte, par sa clé ; null sans issue ouverte. */
  readonly issue: string | null
  /** Ce que le modèle a lu à la dernière demande ; null avant la première réponse d'un modèle. */
  readonly context: CortexContext | null
  readonly model: string | null
}

/** La part de la fenêtre que la dernière demande a prise, de 0 à 100 ; null quand la fenêtre n'est pas connue. */
export function windowShare(context: CortexContext | null): number | null {
  if (!context?.window) return null
  return Math.min(100, Math.round((Math.max(0, context.tokens) / context.window) * 100))
}

export function contextSentence(input: ContextInput, t: ContextTexts): string {
  const sees = input.project === null
    ? t.seesNothing
    : input.issue
      ? fillText(t.seesIssue, { issue: input.issue, project: input.project })
      : fillText(t.seesBoard, { project: input.project })
  if (!input.context) return fillText(t.alone, { sees })
  const share = windowShare(input.context)
  const tokens = formatTokens(input.context.tokens)
  const room = share === null
    ? fillText(t.roomTokens, { tokens })
    : fillText(t.room, { percent: share, model: input.model ?? t.theModel, tokens })
  return fillText(t.joined, { sees, room })
}
