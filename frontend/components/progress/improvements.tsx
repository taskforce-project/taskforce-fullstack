"use client"

import { useId, useState } from "react"
import { Check, Minus, X } from "lucide-react"

import { Named } from "@/components/progress/named"
import { ProgressSection } from "@/components/progress/progress-section"
import type { EvalHistoryCase, EvalHistoryRun } from "@/lib/api/eval-service"
import { fillText } from "@/lib/delivery/result-card"
import { caseLines, caseOrigin, lastMark, type CaseLine } from "@/lib/progress/bank-history"
import { dayOf } from "@/lib/progress/day"
import { useEvalStore } from "@/lib/store/eval-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

/** Le détail d'un cas, dans sa ligne (R129) : d'où il vient, quand il est entré, et sa note à chaque rejeu, par modèle. */
function CaseDetail({ id, item, lines }: Readonly<{ id: string; item: EvalHistoryCase; lines: readonly CaseLine[] }>) {
  const tp = usePreferencesStore((s) => s.t.progress)
  const origin = caseOrigin(item, tp)
  const added = fillText(item.mine ? tp.addedByYou : tp.added, { date: dayOf(item.addedAt) })
  return (
    <div id={id} className="flex flex-col gap-1.5 pb-3 pl-1 text-xs text-muted-foreground">
      <div className="flex flex-col gap-0.5">
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
        <p>{tp.notReplayed}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {lines.map((line) => {
            const last = line.marks[line.marks.length - 1]
            return (
              <li key={line.model} className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
                <span>{fillText(last.passed ? tp.lastPassed : tp.lastFailed, { date: last.day })}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Une ligne, un cas : son titre et sa dernière note ; un clic ouvre tout ce qu'on sait de lui. */
function CaseItem({ item, runs, open, onToggle }: Readonly<{
  item: EvalHistoryCase
  runs: readonly EvalHistoryRun[]
  open: boolean
  onToggle: () => void
}>) {
  const tp = usePreferencesStore((s) => s.t.progress)
  const detailId = useId()
  const lines = caseLines(item, runs, tp.defaultModel)
  const last = lastMark(lines)
  const name = last
    ? fillText(last.passed ? tp.gradePassed : tp.gradeFailed, { model: last.model, date: last.day })
    : tp.notReplayed
  const Icon = last === null ? Minus : last.passed ? Check : X
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        onClick={onToggle}
        className={cn(
          "-mx-1 flex h-8 w-[calc(100%+0.5rem)] items-center gap-2 rounded-md px-1 text-left transition-colors duration-150 hover:bg-muted motion-reduce:transition-none",
          open && "bg-muted",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">{item.title}</span>
        <Named name={name}>
          <span role="img" aria-label={name} className="shrink-0">
            <Icon
              aria-hidden
              className={cn("size-3.5", last === null ? "text-muted-foreground/60" : last.passed ? "text-ink-green" : "text-ink-red")}
            />
          </span>
        </Named>
      </button>
      {open && <CaseDetail id={detailId} item={item} lines={lines} />}
    </li>
  )
}

/**
 * Ce qui a amélioré Cortex (R125, E17 ; R129, séance n°19) : une ligne par cas ajouté avec « Add to test bank » et sa
 * dernière note ; un clic dit d'où il vient (l'incident de confiance, la réponse, ou seulement sa question) et sa note
 * depuis. Il lit l'histoire que charge {@link BankHistory}.
 */
export function Improvements() {
  const tp = usePreferencesStore((s) => s.t.progress)
  const history = useEvalStore((s) => s.history)
  const [opened, setOpened] = useState<number | null>(null)

  // Rien à dire tant que l'histoire n'est pas lue, ou sans cas : BankHistory, au-dessus, le dit déjà en une ligne.
  if (!history || history.cases.length === 0) return null
  return (
    <ProgressSection title={tp.improved} hint={tp.improvedHint}>
      <ul className="flex flex-col" aria-label={tp.improved}>
        {history.cases.map((item) => (
          <CaseItem
            key={item.id}
            item={item}
            runs={history.runs}
            open={opened === item.id}
            onToggle={() => setOpened(opened === item.id ? null : item.id)}
          />
        ))}
      </ul>
    </ProgressSection>
  )
}
