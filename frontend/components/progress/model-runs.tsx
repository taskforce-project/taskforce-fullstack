"use client"

import { Named } from "@/components/progress/named"
import { ProgressSection } from "@/components/progress/progress-section"
import type { BenchmarkRunLine } from "@/lib/api/model-benchmark-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"
import { dayOf } from "@/lib/progress/day"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

/** Ce qu'une ligne dit au survol : « 19 of 22 passed, 3 too slow ». */
function runText(run: BenchmarkRunLine, t: (typeof CONSTANTS_EN)["benchmark"]): string {
  const text = run.tooSlow > 0 ? t.runLineTooSlow : t.runLine
  return fillText(text, { passed: run.passed, total: run.total, tooSlow: run.tooSlow })
}

/**
 * « History » commence par ce que la personne a déjà fait (R142, s29 : « history je vois que dalle ») : chaque passage des modèles
 * ici, une ligne chacun, le plus récent d'abord. Il ne dépend pas de la banque de tests, qui peut être vide. L'ordre est celui du
 * temps, jamais un classement (R57).
 */
export function ModelRuns() {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const runs = useModelBenchmarkStore((s) => s.history)
  if (!runs || runs.length === 0) return null
  return (
    <ProgressSection title={t.runsTitle} hint={t.runsHint}>
      <ul className="flex flex-col" aria-label={t.runsTitle}>
        {runs.map((run) => {
          const text = runText(run, t)
          const finished = run.measured >= run.total
          return (
            <li key={run.runId} className="flex h-7 items-center gap-3 text-xs">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{run.model}</span>
              <span className="shrink-0 text-muted-foreground">{dayOf(run.startedAt)}</span>
              <Named name={text}>
                <span aria-label={text} className={cn("w-10 shrink-0 text-right tabular-nums", finished ? "text-foreground" : "text-muted-foreground")}>
                  {`${run.passed}/${run.total}`}
                </span>
              </Named>
            </li>
          )
        })}
      </ul>
    </ProgressSection>
  )
}
