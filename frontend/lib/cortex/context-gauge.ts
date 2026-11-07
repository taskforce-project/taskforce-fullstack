import type { AssistantUsage } from "@/lib/api/assistant-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"

// ---------------------------------------------------------------------------
// La jauge de contexte de la conversation (test du CEO du 05/11/2026 : « Context window 45k / 33k (100%) » en rouge, le
// cumul des tokens de la conversation contre une fenêtre écrite en dur). Elle montre ce qui compte : ce que Cortex a
// envoyé au modèle pour sa dernière réponse, contre la fenêtre que la passerelle a donnée à cette requête, et le dit en
// une ligne. Du texte seulement, pour que le composant reste un rendu et que la règle se teste.
// ---------------------------------------------------------------------------

type CortexTexts = (typeof CONSTANTS_EN)["cortex"]

/** Ce que le modèle a lu à la dernière demande : son prompt, et la fenêtre que la passerelle lui a donnée. */
export interface CortexContext {
  tokens: number
  /** null quand le fournisseur tient lui-même la fenêtre (une API hébergée). */
  window: number | null
}

export type GaugeTone = "blue" | "amber" | "rose"

export interface ContextGauge {
  /** À droite du titre : « 3.4k / 8.2k (42%) », « 3.4k tokens », ou null avant la première réponse. */
  value: string | null
  /** De 0 à 100 ; 0 sans fenêtre connue. */
  pct: number
  tone: GaugeTone
  /** Ce que c'est, en une ligne. */
  line: string
}

/** Presque pleine : au-delà, une conversation plus longue perd son début. */
const FULL = 90
const HIGH = 70

const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? values[key] : all))

/** « 950 », « 3.4k », « 16k ». */
export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n)
}

export function toneOf(pct: number): GaugeTone {
  return pct >= FULL ? "rose" : pct >= HIGH ? "amber" : "blue"
}

/** Ce qu'a lu le dernier appel d'une réponse ; null quand aucun modèle n'a été appelé (un repli). */
export function contextFrom(usage: AssistantUsage | null | undefined): CortexContext | null {
  const tokens = usage?.lastPromptTokens ?? 0
  if (tokens <= 0) return null
  const window = usage?.contextWindow ?? null
  return { tokens, window: window && window > 0 ? window : null }
}

/**
 * La jauge : le prompt de la dernière demande contre sa fenêtre, en pourcentage, et sa ligne. {@code maximum} est la plus
 * grande fenêtre que la passerelle donne (l'état de l'IA, Ollama seulement) : la ligne dit jusqu'où elle grandit.
 */
export function contextGauge(context: CortexContext | null, maximum: number | null, t: CortexTexts): ContextGauge {
  if (!context) return { value: null, pct: 0, tone: "blue", line: t.contextNone }
  if (!context.window) {
    return { value: fill(t.contextTokens, { tokens: formatTokens(context.tokens) }), pct: 0, tone: "blue", line: t.contextProvider }
  }
  const pct = Math.min(100, Math.round((context.tokens / context.window) * 100))
  const value = `${formatTokens(context.tokens)} / ${formatTokens(context.window)} (${pct}%)`
  const line = pct >= FULL ? t.contextFull
    : maximum && maximum > context.window ? fill(t.contextLineUpTo, { max: formatTokens(maximum) })
    : t.contextLine
  return { value, pct, tone: toneOf(pct), line }
}
