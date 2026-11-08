import type { CortexSource, CortexSourceKey } from "@/lib/api/cortex-sources-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"

import { dayOf } from "./day"

type ProgressTexts = (typeof CONSTANTS_EN)["progress"]

/** Une source de Cortex, dans les mots du volet « Progress » : son nom, son nombre, la date de son dernier changement. */
export interface SourceLine {
  readonly key: CortexSourceKey
  readonly label: string
  readonly count: string
  readonly changed: string | null
}

/**
 * Ce que Cortex lit dans l'espace (R125), une ligne par source, dans l'ordre du serveur : « Issues · 267 · changed
 * 7 Nov ». Une source vide le dit (« None yet »), sans date. Des contenus comptés, jamais des gestes (R57).
 */
export function sourceLines(sources: readonly CortexSource[], t: ProgressTexts): SourceLine[] {
  const labels: Readonly<Record<string, string>> = t.sources
  return sources.map((source) => ({
    key: source.key,
    label: labels[source.key] ?? source.key,
    count: source.count === 0 ? t.none : source.count.toLocaleString("en-US"),
    changed: source.count > 0 && source.changedAt ? fillText(t.changed, { date: dayOf(source.changedAt) }) : null,
  }))
}
