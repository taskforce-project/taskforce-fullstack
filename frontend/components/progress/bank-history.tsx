"use client"

import { useEffect, useMemo } from "react"
import { Loader2, Play, Square } from "lucide-react"

import { BankCurveChart } from "@/components/progress/bank-curve"
import { ProgressSection } from "@/components/progress/progress-section"
import { Button } from "@/components/ui/button"
import { fillText } from "@/lib/delivery/result-card"
import { bankCurve, isFinished, runModel, type CurvePoint } from "@/lib/progress/bank-history"
import { dayOf } from "@/lib/progress/day"
import { useEvalStore } from "@/lib/store/eval-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * Comment Cortex fait dans le temps (R61, R118, R125) : les rejeux de la banque d'évaluations, par modèle et par date,
 * et leur courbe dès deux rejeux finis. On y rejoue la banque sur le modèle de Cortex, d'un clic : un rejeu ne touche
 * jamais l'espace. L'ordre est celui du temps, jamais un classement (R57).
 */
export function BankHistory({ slug }: Readonly<{ slug: string }>) {
  const tp = usePreferencesStore((s) => s.t.progress)
  const history = useEvalStore((s) => s.history)
  const progress = useEvalStore((s) => s.progress)
  const error = useEvalStore((s) => s.error)
  const fetchHistory = useEvalStore((s) => s.fetchHistory)
  const runBank = useEvalStore((s) => s.runBank)
  const stopRun = useEvalStore((s) => s.stopRun)
  // Le modèle avec lequel Cortex répond à la personne : la banque se rejoue sur lui.
  const model = useModelCapabilityStore((s) => s.table?.current ?? null)
  const measuring = useModelCapabilityStore((s) => s.progress !== null)

  useEffect(() => {
    if (slug) void fetchHistory(slug)
  }, [slug, fetchHistory])

  const curve = useMemo(() => (history ? bankCurve(history.runs, tp.defaultModel) : null), [history, tp.defaultModel])

  if (!history) {
    return (
      <ProgressSection title={tp.overTime}>
        <p className="text-xs text-muted-foreground">{tp.reading}</p>
      </ProgressSection>
    )
  }

  const count = history.cases.length
  const target = model ?? tp.cortexModel
  const passedText = (point: CurvePoint) => fillText(tp.passed, { passed: point.passed, total: point.total })
  const replay = count === 0 ? null : progress ? (
    <Button variant="outline" size="sm" onClick={stopRun} disabled={progress.stopping} className="gap-1.5">
      <Square className="size-3" /> {progress.stopping ? tp.stopping : tp.stop}
    </Button>
  ) : (
    <Button variant="outline" size="sm" onClick={() => void runBank(slug, model ?? "")} disabled={measuring} className="gap-1.5">
      <Play className="size-3" /> {fillText(count === 1 ? tp.replayOne : tp.replay, { count, model: target })}
    </Button>
  )
  // Le plus récent d'abord, comme on relit une liste ; la courbe va dans le sens du temps.
  const newestFirst = [...history.runs].reverse()

  return (
    <ProgressSection title={tp.overTime} hint={tp.overTimeHint} actions={replay}>
      {progress ? (
        <p role="status" className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
          {progress.waitSeconds !== null
            ? fillText(tp.replayWaiting, { seconds: progress.waitSeconds })
            : progress.total > 0
              ? fillText(tp.replaying, { done: Math.min(progress.done + 1, progress.total), total: progress.total })
              : tp.replayStarting}
        </p>
      ) : count > 0 && (
        <p className="text-[11px] text-muted-foreground">{tp.replayHint}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {count === 0 ? (
        <p className="text-xs text-muted-foreground">{tp.noCases}</p>
      ) : history.runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tp.noRuns}</p>
      ) : (
        <>
          {curve && <BankCurveChart curve={curve} label={tp.curve} passedText={passedText} />}
          <ul className="divide-y divide-border/50" aria-label={tp.overTime}>
            {newestFirst.map((run) => (
              <li key={run.id} className="flex items-center gap-3 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                  {runModel(run) ?? tp.defaultModel}
                </span>
                <span className="shrink-0 text-muted-foreground">{dayOf(run.startedAt)}</span>
                <span className="w-32 shrink-0 text-right tabular-nums text-foreground">
                  {isFinished(run)
                    ? fillText(tp.passed, { passed: run.passed, total: run.total })
                    : fillText(tp.partial, { graded: run.graded, total: run.total })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ProgressSection>
  )
}
