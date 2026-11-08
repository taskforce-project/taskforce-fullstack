"use client"

import { useId, useState } from "react"
import { X } from "lucide-react"

import { optionDomId, PickList } from "@/components/agent/pick-list"
import { TASK_ICONS } from "@/components/progress/benchmark-signs"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { timeText } from "@/lib/ai/benchmark"
import type { BenchmarkModelRow, BenchmarkTaskInfo } from "@/lib/api/model-benchmark-service"
import { nextIndex, type PickOption } from "@/lib/cortex/composer-picker"
import { fillText } from "@/lib/delivery/result-card"
import { usePickOptions } from "@/lib/hooks/use-pick-options"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

/** Deux ou trois modèles à la fois : assez pour comparer, pas trop pour lire (R131). */
const MIN_MODELS = 2
const MAX_MODELS = 3

/**
 * « Try on my work », l'essai à l'aveugle (R131) : une issue de la personne, une tâche, deux ou trois modèles. Les réponses
 * arrivent sous A, B, C, dans un ordre tiré par le serveur ; la personne choisit, ou aucune ; puis les noms apparaissent.
 * L'issue est lue avec ses droits, sans outil, et rien ne s'écrit sur elle.
 */
export function BenchmarkTrial({ slug, model, tasks, models, onClose }: Readonly<{
  slug: string
  model: string
  tasks: BenchmarkTaskInfo[]
  models: BenchmarkModelRow[]
  onClose: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const blind = useModelBenchmarkStore((s) => s.blind)
  const closeTrial = useModelBenchmarkStore((s) => s.closeTrial)

  const close = () => {
    closeTrial()
    onClose()
  }

  return (
    <section aria-label={t.trialOpen} className="flex flex-col gap-2 border-t border-border pt-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-foreground">{t.trialOpen}</h4>
        <button
          type="button"
          onClick={close}
          aria-label={t.trialClose}
          title={t.trialClose}
          className="rounded-sm p-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {blind ? <TrialAnswers slug={slug} onDone={close} /> : <TrialSetup slug={slug} model={model} tasks={tasks} models={models} />}
    </section>
  )
}

/** Choisir : l'issue (la liste du compositeur), la tâche, les modèles. Un seul geste ensuite : Try. */
function TrialSetup({ slug, model, tasks, models }: Readonly<{
  slug: string
  model: string
  tasks: BenchmarkTaskInfo[]
  models: BenchmarkModelRow[]
}>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const startTrial = useModelBenchmarkStore((s) => s.startTrial)
  const error = useModelBenchmarkStore((s) => s.error)
  const offered = tasks.filter((task) => task.trial)
  const [picked, setPicked] = useState<PickOption | null>(null)
  const [task, setTask] = useState(offered[0]?.key ?? "")
  const [chosen, setChosen] = useState<string[]>(() => {
    const others = models.map((row) => row.model).filter((name) => name !== model)
    return [model, ...others.slice(0, 1)]
  })
  const attach = picked?.attach ?? null
  const ready = attach !== null && attach.issueId !== null && task !== "" && chosen.length >= MIN_MODELS

  const toggle = (name: string, on: boolean) => setChosen((list) => {
    if (!on) return list.filter((other) => other !== name)
    return list.length >= MAX_MODELS ? list : [...list, name]
  })

  const go = () => {
    if (!attach || attach.issueId === null) return
    void startTrial(slug, { projectId: attach.projectId, issueId: attach.issueId, task, models: chosen })
  }

  return (
    <div className="flex flex-col gap-2">
      {picked ? (
        <div className="flex h-7 items-center gap-1.5 text-xs">
          <span className="shrink-0 font-medium text-foreground">{picked.label}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={picked.detail ?? undefined}>{picked.detail}</span>
          <button
            type="button"
            onClick={() => setPicked(null)}
            aria-label={t.trialChange}
            title={t.trialChange}
            className="rounded-sm p-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <IssuePicker slug={slug} onPick={setPicked} />
      )}

      <div role="radiogroup" aria-label={t.trialTask} className="flex flex-wrap gap-1">
        {offered.map((item) => {
          const Icon = TASK_ICONS[item.key]
          return (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={task === item.key}
              title={item.description}
              onClick={() => setTask(item.key)}
              className={cn(
                "flex h-7 items-center gap-1 rounded-md px-2 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none",
                task === item.key ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {Icon && <Icon className="size-3" aria-hidden="true" />}
              {item.label}
            </button>
          )
        })}
      </div>

      <ul aria-label={t.trialModels} className="flex flex-col">
        {models.map((row) => {
          const on = chosen.includes(row.model)
          return (
            <li key={row.model}>
              <label className={cn("flex h-7 cursor-pointer items-center gap-2 rounded-md px-0.5 hover:bg-muted", !on && chosen.length >= MAX_MODELS && "opacity-50")}>
                <Checkbox
                  checked={on}
                  disabled={!on && chosen.length >= MAX_MODELS}
                  onCheckedChange={(checked) => toggle(row.model, checked === true)}
                  aria-label={row.model}
                />
                <span className="min-w-0 truncate font-mono text-[11px]" title={row.model}>{row.model}</span>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={go} disabled={!ready}>{t.trialGo}</Button>
        {error && <span className="min-w-0 truncate text-xs text-destructive" title={error}>{error}</span>}
      </div>
    </div>
  )
}

/** L'issue, trouvée comme dans le compositeur : une recherche, sa liste, le clavier d'abord. Seules les issues se choisissent. */
function IssuePicker({ slug, onPick }: Readonly<{ slug: string; onPick: (option: PickOption) => void }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listId = useId()
  const found = usePickOptions(slug, "attach", query)
  const options = found.options.filter((option) => option.group === "issues")
  const current = options[Math.min(active, options.length - 1)]

  return (
    <div className="flex flex-col gap-1">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0) }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            setActive((i) => Math.max(0, nextIndex(i, e.key === "ArrowDown" ? 1 : -1, options.length)))
          } else if (e.key === "Enter" && current) {
            e.preventDefault()
            onPick(current)
          }
        }}
        placeholder={t.trialSearch}
        aria-label={t.trialSearch}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={current ? optionDomId(listId, current) : undefined}
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary"
      />
      <PickList id={listId} options={options} active={active} searching={found.searching} onPick={onPick} onActive={setActive} className="max-h-40 shadow-none" />
    </div>
  )
}

/** Les réponses sous leur lettre, côte à côte si le volet le permet ; un seul geste : choisir. Puis les noms. */
function TrialAnswers({ slug, onDone }: Readonly<{ slug: string; onDone: () => void }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const blind = useModelBenchmarkStore((s) => s.blind)
  const chooseTrial = useModelBenchmarkStore((s) => s.chooseTrial)
  const error = useModelBenchmarkStore((s) => s.error)
  if (!blind) return null
  const { phase, trial, answers, result, waitSeconds } = blind
  const named = (letter: string) => result?.answers.find((answer) => answer.letter === letter)
  const done = Object.keys(answers).length

  return (
    <div className="flex flex-col gap-2 @container">
      <p className="text-xs text-muted-foreground">{trial.issueKey}</p>
      {phase === "answering" && (
        <p role="status" className="text-xs text-muted-foreground">
          {waitSeconds !== null
            ? fillText(t.waiting, { seconds: waitSeconds })
            : fillText(t.trialAnswering, { done, total: trial.letters.length })}
        </p>
      )}
      <div className="grid gap-2 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {trial.letters.map((letter) => {
          const answer = answers[letter] ?? named(letter)
          const revealed = named(letter)
          const chosen = result?.chosenLetter === letter
          return (
            <article
              key={letter}
              aria-label={fillText(t.trialAnswer, { letter })}
              className={cn("flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-background p-2", chosen && "border-foreground")}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-medium text-foreground">{letter}</span>
                {revealed && <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" title={revealed.model}>{revealed.model}</span>}
                {revealed && <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{timeText(revealed.durationMs, t)}</span>}
                {chosen && <span className="shrink-0 text-xs text-foreground">{t.trialChosen}</span>}
              </div>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs text-foreground">
                {answer ? (answer.answer || t.noAnswer) : "…"}
              </pre>
              {phase === "choosing" && (
                <Button size="sm" variant="secondary" className="w-fit" onClick={() => void chooseTrial(slug, letter)}>{t.trialChoose}</Button>
              )}
            </article>
          )
        })}
      </div>
      {phase === "choosing" && (
        <Button size="sm" variant="ghost" className="w-fit" onClick={() => void chooseTrial(slug, null)}>{t.trialChooseNone}</Button>
      )}
      {phase === "revealed" && (
        <Button size="sm" variant="ghost" className="w-fit" onClick={onDone}>{t.trialDone}</Button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
