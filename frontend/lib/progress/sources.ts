import type { CortexSource, CortexSourceKey } from "@/lib/api/cortex-sources-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"

import { dayOf } from "./day"

type ProgressTexts = (typeof CONSTANTS_EN)["progress"]

/** Une source de Cortex, dans les mots du volet « Progress » : son nom, son nombre, le jour de son dernier changement. */
export interface SourceLine {
  readonly key: CortexSourceKey
  readonly label: string
  readonly count: string
  /** Le jour montré, « 7 Nov » ; null pour une source vide ou sans date. */
  readonly day: string | null
  /** La même date en mots, au survol : « changed 7 Nov ». */
  readonly changed: string | null
}

/**
 * Ce que Cortex lit dans l'espace (R125 ; R129), une ligne par source, dans l'ordre du serveur : « Issues · 267 · 7 Nov ».
 * Une source vide compte 0, sans date. Des contenus comptés, jamais des gestes (R57).
 */
export function sourceLines(sources: readonly CortexSource[], t: ProgressTexts): SourceLine[] {
  const labels: Readonly<Record<string, string>> = t.sources
  return sources.map((source) => {
    const day = source.count > 0 && source.changedAt ? dayOf(source.changedAt) : null
    return {
      key: source.key,
      label: labels[source.key] ?? source.key,
      count: source.count.toLocaleString("en-US"),
      day,
      changed: day === null ? null : fillText(t.changed, { date: day }),
    }
  })
}
