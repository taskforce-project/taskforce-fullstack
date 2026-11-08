"use client"

import { Check, X } from "lucide-react"

import { ProgressSection } from "@/components/progress/progress-section"
import type { EvalHistoryCase, EvalHistoryRun } from "@/lib/api/eval-service"
import { fillText } from "@/lib/delivery/result-card"
import { caseLines, caseOrigin } from "@/lib/progress/bank-history"
import { dayOf } from "@/lib/progress/day"
import { useEvalStore } from "@/lib/store/eval-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

/** Un cas : d'où il vient, quand il est entré, et sa note à chaque rejeu depuis, par modèle. */
function CaseItem({ item, runs }: Readonly<{ item: EvalHistoryCase; runs: readonly EvalHistoryRun[] }>) {
  const tp = usePreferencesStore((s) => s.t.progress)
  const origin = caseOrigin(item, tp)
  const lines = caseLines(item, runs, tp.defaultModel)
  const added = fillText(item.mine ? tp.addedByYou : tp.added, { date: dayOf(item.addedAt) })
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <p className="text-sm text-foreground">{item.title}</p>
      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        <span>{origin.origin}</span>
        <span className="italic">{item.question}</span>
        {(origin.said || origin.shown) && (
          <div className="mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
            {origin.said && <span>{origin.said}</span>}
            {origin.shown && <span>{origin.shown}</span>}
          </div>
        )}
        <span>{added}</span>
      </div>
      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tp.notReplayed}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {lines.map((line) => {
            const last = line.marks[line.marks.length - 1]
            return (
              <li key={line.model} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="font-mono text-[11px] text-foreground">{line.model}</span>
                <span className="flex items-center gap-0.5">
                  {line.marks.map((mark) => {
                    const label = fillText(mark.passed ? tp.gradePassed : tp.gradeFailed, { model: line.model, date: mark.day })
                    const Icon = mark.passed ? Check : X
                    return (
                      <span key={mark.runId} role="img" aria-label={label} title={label}>
                        <Icon aria-hidden className={cn("size-3.5", mark.passed ? "text-ink-green" : "text-ink-red")} />
                      </span>
                    )
                  })}
                </span>
                <span className="text-muted-foreground">
                  {fillText(last.passed ? tp.lastPassed : tp.lastFailed, { date: last.day })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

/**
 * Ce qui a amélioré Cortex (R125, E17) : chaque cas ajouté par « Add to test bank », d'où il vient (l'incident de
 * confiance, la réponse, ou seulement sa question) et sa note depuis. Il lit l'histoire que charge {@link BankHistory}.
 */
export function Improvements() {
  const tp = usePreferencesStore((s) => s.t.progress)
  const history = useEvalStore((s) => s.history)

  if (!history) {
    return (
      <ProgressSection title={tp.improved}>
        <p className="text-xs text-muted-foreground">{tp.reading}</p>
      </ProgressSection>
    )
  }
  return (
    <ProgressSection title={tp.improved} hint={tp.improvedHint}>
      {history.cases.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tp.noCases}</p>
      ) : (
        <ul className="divide-y divide-border/50" aria-label={tp.improved}>
          {history.cases.map((item) => <CaseItem key={item.id} item={item} runs={history.runs} />)}
        </ul>
      )}
    </ProgressSection>
  )
}
