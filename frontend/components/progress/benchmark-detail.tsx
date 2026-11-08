"use client"

import { useEffect, useState } from "react"
import { Check, ChevronRight, FlaskConical, X } from "lucide-react"

import { BenchmarkTrial } from "@/components/progress/benchmark-trial"
import { TASK_ICONS, VerdictMark } from "@/components/progress/benchmark-signs"
import { Button } from "@/components/ui/button"
import { judgeWord, timeText, verdictWord } from "@/lib/ai/benchmark"
import type {
  BenchmarkCaseDetail,
  BenchmarkModelRow,
  BenchmarkTaskDetail,
  BenchmarkTaskInfo,
  BlindTrialResult,
} from "@/lib/api/model-benchmark-service"
import { fillText } from "@/lib/delivery/result-card"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import { parseServerDate } from "@/lib/utils/server-date"

const dayOf = (at: string | null): string =>
  at ? parseServerDate(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""

/**
 * Ce qu'une ligne de la matrice ouvre (R131) : par tâche et par cas, le titre court, la réponse, le temps, les critères et
 * les deux boutons qui retournent la note. Le verdict y dit « indicatif » et le nombre de cas (Duflo). Puis « Try on my
 * work », l'essai à l'aveugle, et les essais déjà tranchés.
 */
export function BenchmarkDetail({ slug, model, tasks, models }: Readonly<{
  slug: string
  model: string
  tasks: BenchmarkTaskInfo[]
  models: BenchmarkModelRow[]
}>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const detail = useModelBenchmarkStore((s) => s.details[model])
  const fetchDetail = useModelBenchmarkStore((s) => s.fetchDetail)
  const blind = useModelBenchmarkStore((s) => s.blind)
  const [trying, setTrying] = useState(false)

  useEffect(() => {
    void fetchDetail(slug, model)
  }, [slug, model, fetchDetail])

  if (!detail) return <p className="px-1 py-2 text-xs text-muted-foreground">{t.reading}</p>

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/30 p-2">
      <p className="text-xs text-muted-foreground">{fillText(t.indicative, { cases: detail.cases })}</p>
      {detail.tasks.map((task) => (
        <TaskBlock
          key={task.task}
          slug={slug}
          model={model}
          task={task}
          info={tasks.find((candidate) => candidate.key === task.task)}
        />
      ))}

      {trying || blind ? (
        <BenchmarkTrial slug={slug} model={model} tasks={tasks} models={models} onClose={() => setTrying(false)} />
      ) : (
        <Button size="sm" variant="outline" className="w-fit gap-1.5" onClick={() => setTrying(true)}>
          <FlaskConical className="size-3.5" aria-hidden="true" />
          {t.trialOpen}
        </Button>
      )}

      {detail.trials.length > 0 && (
        <section aria-label={t.trialsTitle} className="flex flex-col gap-0.5 border-t border-border pt-2">
          {detail.trials.map((trial) => <TrialLine key={trial.trialId} trial={trial} tasks={tasks} model={model} />)}
        </section>
      )}
    </div>
  )
}

/** Une tâche : son nom, son verdict en mots, de qui il est, sur combien de cas ; puis ses cas. */
function TaskBlock({ slug, model, task, info }: Readonly<{
  slug: string
  model: string
  task: BenchmarkTaskDetail
  info: BenchmarkTaskInfo | undefined
}>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const label = info?.label ?? task.task
  const Icon = TASK_ICONS[task.task]
  const judge = judgeWord(task.judge, t)
  return (
    <section aria-label={label} className="flex flex-col">
      <div className="flex h-7 items-center gap-1.5" title={info?.description}>
        {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <span className="min-w-0 truncate text-xs font-medium text-foreground">{label}</span>
        <VerdictMark verdict={task.verdict} judge={task.judge} />
        <span className="text-xs text-foreground">{verdictWord(task.verdict, t)}</span>
        {judge && <span className="truncate text-xs text-muted-foreground">{judge}</span>}
        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {task.measured === task.total ? `${task.passed}/${task.total}` : fillText(t.partly, { measured: task.measured, total: task.total })}
        </span>
      </div>
      <ul className="flex flex-col">
        {task.cases.map((item) => <CaseRow key={item.caseKey} slug={slug} model={model} item={item} />)}
      </ul>
    </section>
  )
}

/** Un cas : réussi ou raté, son titre, son temps ; un clic montre la réponse, les critères, et les boutons qui la retournent. */
function CaseRow({ slug, model, item }: Readonly<{ slug: string; model: string; item: BenchmarkCaseDetail }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const overturn = useModelBenchmarkStore((s) => s.overturn)
  const [open, setOpen] = useState(false)
  const played = item.resultId !== null
  const judge = judgeWord(item.judge, t)
  const word = !played ? t.verdicts.none : item.passed ? t.passed : t.failed

  const judgeIt = (passed: boolean) => {
    if (item.resultId === null) return
    // Un second clic sur le même bouton rend la note au code.
    void overturn(slug, model, item.resultId, item.personPassed === passed ? null : passed)
  }

  return (
    <li>
      <button
        type="button"
        disabled={!played}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-7 w-full items-center gap-1.5 rounded-sm px-0.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:hover:bg-transparent"
      >
        {played
          ? item.passed
            ? <Check className="size-3.5 shrink-0 text-ink-green" aria-hidden="true" />
            : <X className="size-3.5 shrink-0 text-ink-yellow" aria-hidden="true" />
          : <span className="mx-[3px] h-px w-2 shrink-0 bg-muted-foreground/50" aria-hidden="true" />}
        <span className="sr-only">{word}</span>
        <span className={cn("min-w-0 flex-1 truncate", played ? "text-foreground" : "text-muted-foreground")} title={item.title}>
          {item.title}
        </span>
        {judge && <span className="shrink-0 text-muted-foreground">{judge}</span>}
        {played && <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{timeText(item.durationMs, t)}</span>}
        {played && <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} aria-hidden="true" />}
      </button>
      {open && played && (
        <div className="flex flex-col gap-2 py-1.5 pl-5">
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-sm bg-background p-2 font-sans text-xs text-foreground">
            {item.answer || t.noAnswer}
          </pre>
          {item.calls.length > 0 && (
            <ul aria-label={t.calls} className="flex flex-col gap-0.5">
              {item.calls.map((call, index) => (
                <li key={`${call.tool}-${index}`} className="truncate font-mono text-[11px] text-muted-foreground" title={call.arguments}>
                  {call.tool} {call.arguments}
                </li>
              ))}
            </ul>
          )}
          <ul aria-label={t.checks} className="flex flex-col gap-0.5">
            {item.checks.map((check, index) => (
              <li key={`${check.criterion}-${index}`} className="flex items-start gap-1.5 text-xs" title={check.detail}>
                {check.passed
                  ? <Check className="mt-0.5 size-3 shrink-0 text-ink-green" aria-hidden="true" />
                  : <X className="mt-0.5 size-3 shrink-0 text-ink-yellow" aria-hidden="true" />}
                <span className="sr-only">{check.passed ? t.passed : t.failed}</span>
                <span className="min-w-0 break-words text-foreground">
                  {check.criterion}
                  {!check.passed && check.detail && <span className="block text-muted-foreground">{check.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-1">
            <Button size="sm" variant={item.personPassed === true ? "secondary" : "ghost"} aria-pressed={item.personPassed === true} onClick={() => judgeIt(true)}>
              {t.pass}
            </Button>
            <Button size="sm" variant={item.personPassed === false ? "secondary" : "ghost"} aria-pressed={item.personPassed === false} onClick={() => judgeIt(false)}>
              {t.fail}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

/** Un essai tranché, sur une ligne : la tâche, l'issue, qui a été choisi ; les réponses à un clic. Vu de sa seule personne. */
function TrialLine({ trial, tasks, model }: Readonly<{ trial: BlindTrialResult; tasks: BenchmarkTaskInfo[]; model: string }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const [open, setOpen] = useState(false)
  const task = tasks.find((candidate) => candidate.key === trial.task)
  const Icon = TASK_ICONS[trial.task]
  const others = trial.answers.map((answer) => answer.model).join(", ")
  const chose = trial.chosenModel
    ? fillText(trial.chosenModel === model ? t.trialChoseThis : t.trialChoseOther, { model: trial.chosenModel })
    : t.trialChoseNone
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title={fillText(t.trialLineTitle, { task: task?.label ?? trial.task, models: others })}
        className="flex h-7 w-full items-center gap-1.5 rounded-sm px-0.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <span className="shrink-0 font-medium text-foreground">{trial.issueKey}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{chose}</span>
        <span className="shrink-0 text-muted-foreground">{dayOf(trial.decidedAt)}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 py-1 pl-5">
          {trial.answers.map((answer) => (
            <div key={answer.letter}>
              <p className="font-mono text-[11px] text-muted-foreground">{answer.letter} · {answer.model}</p>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs text-foreground">{answer.answer}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
