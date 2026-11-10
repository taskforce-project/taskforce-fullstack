"use client"

import { useEffect, useState } from "react"
import { Check, ChevronRight, FlaskConical, Timer, X } from "lucide-react"

import { TASK_ICONS, VerdictMark } from "@/components/progress/benchmark-signs"
import { BenchmarkTrial } from "@/components/progress/benchmark-trial"
import { CapabilitySign } from "@/components/progress/capability-sign"
import { Named } from "@/components/progress/named"
import { Button } from "@/components/ui/button"
import { BUDGET_MINUTES, judgeWord, timeText, verdictWord } from "@/lib/ai/benchmark"
import { familyLine, fitLine, gigabytes, nameWords } from "@/lib/ai/model-description"
import { failedCaseTitles, fillModelText, proposedFor, scoreSign, scoreText } from "@/lib/ai/model-table"
import type {
  BenchmarkCaseDetail,
  BenchmarkModelRow,
  BenchmarkTaskDetail,
  BenchmarkTaskInfo,
  BlindTrialResult,
} from "@/lib/api/model-benchmark-service"
import type { ModelCapabilityRow, ModelCapabilityTable } from "@/lib/api/model-capability-service"
import { fillText } from "@/lib/delivery/result-card"
import { dayOf } from "@/lib/progress/day"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

/**
 * Ce qu'une ligne ouvre (R131, R142). D'abord ce qu'est le modèle, en mots : sa famille, sa taille, ce que veulent dire les mots
 * de son nom, s'il prend les outils, s'il tient sur la carte graphique. Puis ce qu'il sait faire (les capacités, chacune avec ce
 * qu'elle mesure). Puis ce qu'on peut lui confier : par tâche et par cas, le titre court, la réponse, le temps, les critères et
 * les deux boutons qui retournent la note. Le verdict y dit « indicatif » et le nombre de cas (Duflo). Enfin « Try on my work ».
 */
export function BenchmarkDetail({ slug, row, tasks, models }: Readonly<{
  slug: string
  row: BenchmarkModelRow
  tasks: BenchmarkTaskInfo[]
  models: BenchmarkModelRow[]
}>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const model = row.model
  const detail = useModelBenchmarkStore((s) => s.details[model])
  const fetchDetail = useModelBenchmarkStore((s) => s.fetchDetail)
  const blind = useModelBenchmarkStore((s) => s.blind)
  const table = useModelCapabilityStore((s) => s.table)
  const capabilities = table?.models.find((candidate) => candidate.model === model)
  const bank = row.cells.find((cell) => cell.task === "bank")
  const [trying, setTrying] = useState(false)

  useEffect(() => {
    void fetchDetail(slug, model)
  }, [slug, model, fetchDetail])

  const chats = row.facts.chat !== false

  return (
    <div className="flex flex-col gap-3 pb-3 pl-5 pr-1 text-xs">
      <AboutModel slug={slug} row={row} table={table} />

      {chats && table && capabilities && <CapabilityMeasures table={table} row={capabilities} />}

      {chats && (detail ? (
        <section aria-label={t.canGiveTitle} className="flex flex-col gap-1">
          <div className="flex h-5 items-baseline justify-between gap-2">
            <h4 className="font-medium text-foreground">{t.canGiveTitle}</h4>
            <p className="truncate text-[11px] text-muted-foreground">{fillText(t.indicative, { cases: detail.cases })}</p>
          </div>
          {detail.tasks.map((task) => (
            <TaskBlock
              key={task.task}
              slug={slug}
              model={model}
              task={task}
              info={tasks.find((candidate) => candidate.key === task.task)}
            />
          ))}
          {bank && bank.measured > 0 && (
            <p className="text-muted-foreground">{fillText(t.bankLine, { passed: bank.passed, total: bank.total })}</p>
          )}
        </section>
      ) : (
        <p className="text-muted-foreground">{t.reading}</p>
      ))}

      {chats && (trying || blind ? (
        <BenchmarkTrial slug={slug} model={model} tasks={tasks} models={models} onClose={() => setTrying(false)} />
      ) : (
        <Button size="sm" variant="outline" className="w-fit gap-1.5" onClick={() => setTrying(true)}>
          <FlaskConical className="size-3.5" aria-hidden="true" />
          {t.trialOpen}
        </Button>
      ))}

      {chats && detail && detail.trials.length > 0 && (
        <section aria-label={t.trialsTitle} className="flex flex-col border-t border-border pt-1">
          {detail.trials.map((trial) => <TrialLine key={trial.trialId} trial={trial} tasks={tasks} model={model} />)}
        </section>
      )}
    </div>
  )
}

/** Ce qu'est le modèle, d'après ce qu'Ollama rapporte et le glossaire de son nom (R142) ; et le geste qui le donne à Cortex. */
function AboutModel({ slug, row, table }: Readonly<{ slug: string; row: BenchmarkModelRow; table: ModelCapabilityTable | null }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const tm = usePreferencesStore((s) => s.t.models)
  const choose = useModelCapabilityStore((s) => s.choose)
  const { facts } = row
  const family = familyLine(facts, t.about)
  const onDisk = facts.diskBytes ? fillText(t.about.onDisk, { size: gigabytes(facts.diskBytes) }) : null
  const words = nameWords(row.model, t.about)
  const fit = fitLine(facts, t.about) ?? (facts.diskBytes ? t.about.notLoaded : null)
  const tools = facts.tools === true ? t.about.tools : facts.tools === false ? t.about.noTools : null
  const proposed = table ? proposedFor(table, row.model, tm) : null
  return (
    <section aria-label={t.aboutTitle} className="flex flex-col gap-0.5 text-muted-foreground">
      <h4 className="pb-0.5 font-medium text-foreground">{t.aboutTitle}</h4>
      {(family || onDisk) && <p>{[family, onDisk].filter(Boolean).join(" ")}</p>}
      {words.map((item) => (
        <p key={item.word}>
          <span className="font-mono text-[11px] text-foreground">{item.word}</span>
          {`: ${item.meaning}.`}
        </p>
      ))}
      {facts.chat === false && <p>{t.about.noChat}</p>}
      {tools && facts.chat !== false && <p>{tools}</p>}
      {fit && facts.chat !== false && <p>{fit}</p>}
      {proposed && <p>{proposed}</p>}
      {facts.chat !== false && (
        <div className="pt-1">
          {row.current ? (
            <span className="text-foreground">{t.inUse}</span>
          ) : (
            // Le modèle de l'instance se suit sans être épinglé : le reprendre efface le choix de la personne.
            <Button size="sm" variant="outline" onClick={() => void choose(slug, row.model === table?.instanceModel ? null : row.model)}>
              {t.useForCortex}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

/** Ce que le modèle sait faire, une capacité par ligne : ce qu'elle mesure, en mots, et sa note (R142). Les cas ratés à la suite. */
function CapabilityMeasures({ table, row }: Readonly<{ table: ModelCapabilityTable; row: ModelCapabilityRow }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const tm = usePreferencesStore((s) => s.t.models)
  const tp = usePreferencesStore((s) => s.t.progress)
  const failed = failedCaseTitles(table, row)
  return (
    <section aria-label={t.canDoTitle} className="flex flex-col gap-0.5">
      <div className="flex h-5 items-baseline justify-between gap-2">
        <h4 className="font-medium text-foreground">{t.canDoTitle}</h4>
        <p className="truncate text-[11px] text-muted-foreground">
          {row.measuredAt ? fillModelText(tm.measuredOn, { date: dayOf(row.measuredAt) }) : tp.notMeasuredYet}
        </p>
      </div>
      <ul className="flex flex-col">
        {row.scores.map((score) => {
          const info = table.capabilities.find((candidate) => candidate.key === score.capability)
          const label = info?.label ?? score.capability
          const text = scoreText(score, tm)
          return (
            <li key={score.capability} className="flex items-start gap-1.5 py-1">
              <CapabilitySign sign={scoreSign(score)} name={`${label}: ${text}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="shrink-0 font-medium text-foreground">{label}</span>
                  <span className="min-w-0 text-right text-[11px] tabular-nums text-muted-foreground">{text}</span>
                </div>
                {info && <p className="text-muted-foreground">{info.description}</p>}
              </div>
            </li>
          )
        })}
      </ul>
      {failed.map((title) => <p key={title} className="text-foreground">{fillModelText(tm.caseFailed, { title })}</p>)}
      <p className="pt-0.5 text-muted-foreground">{fillModelText(tm.hint, { cases: table.cases.length })}</p>
    </section>
  )
}

/** Une tâche : son icône, son nom, ce qu'elle mesure, son verdict en mots, de qui il est, sur combien de cas ; puis une ligne par cas. */
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
  const word = verdictWord(task.verdict, t)
  return (
    <section aria-label={label} className="flex flex-col">
      <div className="flex h-7 items-center gap-1.5">
        {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <span className="min-w-0 truncate font-medium text-foreground">{label}</span>
        <VerdictMark verdict={task.verdict} judge={task.judge} name={word} />
        <span className="shrink-0 text-foreground">{word}</span>
        {judge && <span className="min-w-0 truncate text-muted-foreground">{judge}</span>}
        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {task.measured === task.total ? `${task.passed}/${task.total}` : fillText(t.partly, { measured: task.measured, total: task.total })}
        </span>
      </div>
      {info && <p className="pb-0.5 pl-5 text-muted-foreground">{info.description}</p>}
      <ul className="flex flex-col">
        {task.cases.map((item) => <CaseRow key={item.caseKey} slug={slug} model={model} item={item} />)}
      </ul>
    </section>
  )
}

/** Un cas, une ligne : réussi, raté ou trop lent, son titre, son temps ; un clic montre la réponse, les critères, et les boutons qui la retournent. */
function CaseRow({ slug, model, item }: Readonly<{ slug: string; model: string; item: BenchmarkCaseDetail }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const overturn = useModelBenchmarkStore((s) => s.overturn)
  const [open, setOpen] = useState(false)
  const played = item.resultId !== null
  const judge = judgeWord(item.judge, t)
  let word: string = t.verdicts.none
  if (played) word = item.tooSlow ? t.verdicts.too_slow : item.passed ? t.passed : t.failed

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
        className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-sm px-0.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <Named name={word}>
          <span role="img" aria-label={word} className="flex size-3.5 shrink-0 items-center justify-center">
            {!played && <span className="h-px w-2 bg-muted-foreground/50" aria-hidden="true" />}
            {played && item.tooSlow && <Timer className="size-3.5 text-muted-foreground" aria-hidden="true" />}
            {played && !item.tooSlow && (item.passed
              ? <Check className="size-3.5 text-ink-green" aria-hidden="true" />
              : <X className="size-3.5 text-ink-yellow" aria-hidden="true" />)}
          </span>
        </Named>
        <Named name={item.title}>
          <span className={cn("min-w-0 flex-1 truncate", played ? "text-foreground" : "text-muted-foreground")}>{item.title}</span>
        </Named>
        {judge && <span className="shrink-0 text-muted-foreground">{judge}</span>}
        {played && <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{timeText(item.durationMs, t)}</span>}
        {played && <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} aria-hidden="true" />}
      </button>
      {open && played && item.tooSlow && (
        <p className="py-1 pl-5 text-muted-foreground">{fillText(t.tooSlowCase, { minutes: BUDGET_MINUTES })}</p>
      )}
      {open && played && !item.tooSlow && (
        <div className="flex flex-col gap-1.5 py-1.5 pl-5">
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-sm bg-muted/40 p-2 font-sans text-xs text-foreground">
            {item.answer || t.noAnswer}
          </pre>
          {item.calls.length > 0 && (
            <ul aria-label={t.calls} className="flex min-w-0 flex-col">
              {item.calls.map((call, index) => (
                <li key={`${call.tool}-${index}`} className="min-w-0">
                  <Named name={call.arguments} wide>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{call.tool} {call.arguments}</span>
                  </Named>
                </li>
              ))}
            </ul>
          )}
          <ul aria-label={t.checks} className="flex min-w-0 flex-col">
            {item.checks.map((check, index) => (
              <li key={`${check.criterion}-${index}`} className="flex min-w-0 items-center gap-1.5">
                {check.passed
                  ? <Check className="size-3 shrink-0 text-ink-green" aria-hidden="true" />
                  : <X className="size-3 shrink-0 text-ink-yellow" aria-hidden="true" />}
                <span className="sr-only">{check.passed ? t.passed : t.failed}</span>
                <Named name={check.detail || check.criterion} wide>
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {check.criterion}{!check.passed && check.detail ? `: ${check.detail}` : ""}
                  </span>
                </Named>
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

/** Un essai tranché, une ligne : la tâche, l'issue, qui a été choisi ; les réponses à un clic. Vu de sa seule personne. */
function TrialLine({ trial, tasks, model }: Readonly<{ trial: BlindTrialResult; tasks: BenchmarkTaskInfo[]; model: string }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const [open, setOpen] = useState(false)
  const task = tasks.find((candidate) => candidate.key === trial.task)
  const Icon = TASK_ICONS[trial.task]
  const others = trial.answers.map((answer) => answer.model).join(", ")
  let chose: string = t.trialChoseNone
  if (trial.answers.length === 1) chose = t.trialAlone
  else if (trial.chosenModel) chose = fillText(trial.chosenModel === model ? t.trialChoseThis : t.trialChoseOther, { model: trial.chosenModel })
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-sm px-0.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <Named name={fillText(t.trialLineTitle, { task: task?.label ?? trial.task, models: others })} wide>
          <span className="shrink-0 font-medium text-foreground">{trial.issueKey}</span>
        </Named>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{chose}</span>
        <span className="shrink-0 text-muted-foreground">{trial.decidedAt ? dayOf(trial.decidedAt) : ""}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 py-1 pl-5">
          {trial.answers.map((answer) => (
            <div key={answer.letter}>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{trial.answers.length === 1 ? answer.model : `${answer.letter} · ${answer.model}`}</p>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs text-foreground">
                {answer.tooSlow ? fillText(t.trialTooSlow, { minutes: BUDGET_MINUTES }) : answer.answer}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
