"use client"

import { useEffect, useMemo } from "react"
import { Play, Square } from "lucide-react"

import { BankCurveChart } from "@/components/progress/bank-curve"
import { BusyMark } from "@/components/progress/busy-mark"
import { Named } from "@/components/progress/named"
import { ProgressSection } from "@/components/progress/progress-section"
import { Button } from "@/components/ui/button"
import { fillText } from "@/lib/delivery/result-card"
import { bankCurve, isFinished, runModel, type CurvePoint } from "@/lib/progress/bank-history"
import { dayOf } from "@/lib/progress/day"
import { useEvalStore } from "@/lib/store/eval-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * Comment Cortex fait dans le temps (R61, R118, R125 ; R129, séance n°19) : les rejeux de la banque d'évaluations, une
 * ligne chacun, et leur courbe dès deux rejeux finis. On y rejoue la banque sur le modèle de Cortex, d'un clic : un rejeu
 * ne touche jamais l'espace. L'ordre est celui du temps, jamais un classement (R57).
 */
export function BankHistory({ slug }: Readonly<{ slug: string }>) {
  const tp = usePreferencesStore((s) => s.t.progress)
  const history = useEvalStore((s) => s.history)
  const failed = useEvalStore((s) => s.historyFailed)
  const progress = useEvalStore((s) => s.progress)
  const error = useEvalStore((s) => s.error)
  const fetchHistory = useEvalStore((s) => s.fetchHistory)
  const runBank = useEvalStore((s) => s.runBank)
  const stopRun = useEvalStore((s) => s.stopRun)
  // Le modèle avec lequel Cortex répond à la personne : la banque se rejoue sur lui. L'onglet peut s'ouvrir le premier.
  const model = useModelCapabilityStore((s) => s.table?.current ?? null)
  const measuring = useModelCapabilityStore((s) => s.progress !== null)
  const fetchTable = useModelCapabilityStore((s) => s.fetchTable)

  useEffect(() => {
    if (!slug) return
    void fetchHistory(slug)
    void fetchTable(slug)
  }, [slug, fetchHistory, fetchTable])

  const curve = useMemo(() => (history ? bankCurve(history.runs, tp.defaultModel) : null), [history, tp.defaultModel])

  if (!history) {
    return <p className="text-xs text-muted-foreground">{failed ? tp.readFailed : tp.reading}</p>
  }

  // Une banque vide : une ligne, et le prochain geste (R129).
  if (history.cases.length === 0) return <p className="text-xs text-muted-foreground">{tp.noCases}</p>
  // Un cas qui attend ses critères n'est pas rejoué (R61).
  const count = history.cases.filter((item) => !item.waiting).length

  const target = model ?? tp.cortexModel
  const passedText = (point: CurvePoint) => fillText(tp.passed, { passed: point.passed, total: point.total })
  const replayName = fillText(count === 1 ? tp.replayOne : tp.replay, { count, model: target })
  const statusText = (running: NonNullable<typeof progress>) =>
    running.waitSeconds !== null
      ? fillText(tp.replayWaiting, { seconds: running.waitSeconds })
      : running.total > 0
        ? fillText(tp.replaying, { done: Math.min(running.done + 1, running.total), total: running.total })
        : tp.replayStarting
  const replay = progress ? (
    <div className="flex items-center gap-2">
      <BusyMark
        short={progress.waitSeconds !== null ? `${progress.waitSeconds} s` : `${Math.min(progress.done + 1, progress.total)}/${progress.total}`}
        text={statusText(progress)}
      />
      <Named name={progress.stopping ? tp.stopping : tp.stop}>
        <span className="inline-flex">
          <Button variant="ghost" size="icon-sm" onClick={stopRun} disabled={progress.stopping} aria-label={progress.stopping ? tp.stopping : tp.stop}>
            <Square className="size-3.5" />
          </Button>
        </span>
      </Named>
    </div>
  ) : (
    <Named name={`${replayName}. ${tp.replayHint}`} wide>
      <span className="inline-flex">
        <Button variant="outline" size="sm" onClick={() => void runBank(slug, model ?? "")} disabled={measuring || count === 0} aria-label={replayName} className="gap-1.5">
          <Play className="size-3" /> {tp.replayShort}
        </Button>
      </span>
    </Named>
  )
  // Le plus récent d'abord, comme on relit une liste ; la courbe va dans le sens du temps.
  const newestFirst = [...history.runs].reverse()

  return (
    <ProgressSection title={tp.overTime} hint={tp.overTimeHint} actions={replay}>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {history.runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tp.noRuns}</p>
      ) : (
        <>
          {curve && <BankCurveChart curve={curve} label={tp.curve} passedText={passedText} />}
          <ul className="flex flex-col" aria-label={tp.overTime}>
            {newestFirst.map((run) => {
              const finished = isFinished(run)
              const full = finished
                ? fillText(tp.passed, { passed: run.passed, total: run.total })
                : fillText(tp.partial, { graded: run.graded, total: run.total })
              return (
                <li key={run.id} className="flex h-7 items-center gap-3 text-xs">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                    {runModel(run) ?? tp.defaultModel}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{dayOf(run.startedAt)}</span>
                  <Named name={full}>
                    <span
                      aria-label={full}
                      className={finished ? "w-8 shrink-0 text-right tabular-nums text-foreground" : "w-8 shrink-0 text-right tabular-nums text-muted-foreground"}
                    >
                      {`${finished ? run.passed : run.graded}/${run.total}`}
                    </span>
                  </Named>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </ProgressSection>
  )
}
