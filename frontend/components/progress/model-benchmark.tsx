"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { AlignLeft, Play, Square } from "lucide-react"

import { BenchmarkDetail } from "@/components/progress/benchmark-detail"
import { TASK_ICONS, VerdictMark } from "@/components/progress/benchmark-signs"
import { BusyMark } from "@/components/progress/busy-mark"
import { Named } from "@/components/progress/named"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BUDGET_MINUTES, cellTitle, estimateOf, roughDuration } from "@/lib/ai/benchmark"
import { fitLine, spillsVisibly } from "@/lib/ai/model-description"
import type { BenchmarkMatrix, BenchmarkModelRow, BenchmarkTaskInfo } from "@/lib/api/model-benchmark-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"
import { dayOf } from "@/lib/progress/day"
import { useEvalStore } from "@/lib/store/eval-store"
import { useModelBenchmarkStore, type BenchmarkProgress } from "@/lib/store/model-benchmark-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { cn } from "@/lib/utils"

type Texts = (typeof CONSTANTS_EN)["benchmark"]

/** Une colonne de la matrice, 28 px (« Le dessin », séance n°19). */
const COLUMN = "flex w-7 shrink-0 items-center justify-center"

/** La tête d'une colonne : l'icône de la tâche, son nom au survol (R129). */
function TaskHead({ task }: Readonly<{ task: BenchmarkTaskInfo }>) {
  const Icon = TASK_ICONS[task.key] ?? AlignLeft
  const name = `${task.label}: ${task.description}`
  return (
    <span className={COLUMN}>
      <Named name={name} wide>
        <span role="img" aria-label={name} className="flex size-4 items-center justify-center text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
        </span>
      </Named>
    </span>
  )
}

/** Ce que la ligne dit du passage qui la concerne : « Loading », « 3/30 », les secondes du frein de débit ; la phrase au survol. */
function runWords(run: BenchmarkProgress, t: Texts): { short: string; text: string } {
  if (run.waitSeconds !== null) {
    return { short: fillText(t.waitingShort, { seconds: run.waitSeconds }), text: fillText(t.waiting, { seconds: run.waitSeconds }) }
  }
  if (run.phase === "loading") return { short: t.loadingShort, text: fillText(t.loadingModel, { model: run.model }) }
  return {
    short: `${run.done}/${run.total}`,
    text: fillText(run.auto ? t.measuringAuto : t.progress, { model: run.model, done: run.done, total: run.total }),
  }
}

/**
 * Pourquoi cette ligne se lit comme elle se lit, en une phrase, sous le nom : ce qui a empêché le modèle d'aller au bout, ou la
 * part de lui qui tourne sur le processeur. Une phrase visible, et pas au survol : un « Too slow » ne doit pas se lire comme
 * un mauvais modèle (signal d'arrêt de R142). Rien pour un modèle qui n'a rien à expliquer.
 */
function reasonOf(row: BenchmarkModelRow, note: string | undefined, t: Texts): string | null {
  if (note) return note
  if (row.facts.loadProblem === "too_slow") return fillText(t.loadTooSlow, { minutes: BUDGET_MINUTES })
  if (row.facts.loadProblem === "failed") return t.loadFailed
  const slow = row.cells.some((cell) => cell.tooSlow > 0)
  const fit = slow || spillsVisibly(row.facts) ? fitLine(row.facts, t.about) : null
  return fit ?? (slow ? fillText(t.tooSlowRow, { minutes: BUDGET_MINUTES }) : null)
}

/** Une ligne, 36 px : le point du modèle en service, son nom, un verdict par tâche ; un clic ouvre son détail dans la ligne. */
function ModelLine({ slug, matrix, row, open, onToggle }: Readonly<{
  slug: string
  matrix: BenchmarkMatrix
  row: BenchmarkModelRow
  open: boolean
  onToggle: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const running = useModelBenchmarkStore((s) => (s.progress?.model === row.model ? s.progress : null))
  const queued = useModelBenchmarkStore((s) => s.queue.some((item) => item.model === row.model))
  const note = useModelBenchmarkStore((s) => s.notes[row.model])
  const detailId = useId()
  const labelOf = (key: string) => matrix.tasks.find((task) => task.key === key)?.label ?? key
  const words = running ? runWords(running, t) : null
  const why = reasonOf(row, note, t)
  // Ouverte, la ligne laisse au détail la phrase sur la carte graphique : il la dit juste en dessous.
  const reason = open && why === fitLine(row.facts, t.about) ? null : why
  const chats = row.facts.chat !== false
  return (
    <li>
      {/* Dite une fois, hors du bouton de la ligne : son nom ne change pas pendant le passage. */}
      {words && <span role="status" className="sr-only">{words.text}</span>}
      <button
        type="button"
        data-benchmark-line
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        onClick={onToggle}
        className={cn(
          "flex w-full min-w-0 flex-col rounded-md px-1 text-left transition-colors duration-150 hover:bg-muted motion-reduce:transition-none",
          open && "bg-muted",
        )}
      >
        <span className="flex h-9 w-full min-w-0 items-center gap-2">
          <span className="flex w-3 shrink-0 justify-center">
            {row.current && (
              <Named name={t.inUse}>
                <span role="img" aria-label={t.inUse} className="block size-1.5 rounded-full bg-primary" />
              </Named>
            )}
          </span>
          <Named name={row.model}>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{row.model}</span>
          </Named>
          {words && <BusyMark short={words.short} text={words.text} announced={false} />}
          {queued && !running && <span className="shrink-0 text-[11px] text-muted-foreground">{t.queued}</span>}
          {chats ? (
            <span className="flex shrink-0">
              {row.cells.map((cell) => (
                <span key={cell.task} className={COLUMN}>
                  <VerdictMark verdict={cell.verdict} judge={cell.judge} name={cellTitle(labelOf(cell.task), cell, t)} />
                </span>
              ))}
            </span>
          ) : (
            <Named name={t.cannotChatHint} wide>
              <span className="shrink-0 text-[11px] text-muted-foreground">{t.cannotChat}</span>
            </Named>
          )}
        </span>
        {reason && <span className="-mt-1 w-full pb-2 pl-5 text-[11px] leading-4 text-muted-foreground">{reason}</span>}
      </button>
      {open && (
        <div id={detailId}>
          <BenchmarkDetail slug={slug} row={row} tasks={matrix.tasks} models={matrix.models} />
        </div>
      )}
    </li>
  )
}

/**
 * Les modèles de cette instance (R131, R142) : « que puis-je confier à ce modèle ? ». Une ligne par modèle, une colonne de
 * 28 px par tâche, le verdict en signe, son mot au survol. Un seul geste principal, Run : une file, un modèle après l'autre ; un
 * clic sur une ligne dit ce qu'est le modèle, ce qu'il sait faire et chaque cas passé. Le modèle en service d'abord, puis
 * l'ordre d'installation : aucun classement (R57). Tout tient dans 480 px, sans défilement horizontal.
 */
export function ModelBenchmark({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const tp = usePreferencesStore((s) => s.t.progress)
  const matrix = useModelBenchmarkStore((s) => s.matrix)
  const progress = useModelBenchmarkStore((s) => s.progress)
  const error = useModelBenchmarkStore((s) => s.error)
  const fetchMatrix = useModelBenchmarkStore((s) => s.fetchMatrix)
  const measureCortexModel = useModelBenchmarkStore((s) => s.measureCortexModel)
  const stop = useModelBenchmarkStore((s) => s.stop)
  const fetchTable = useModelCapabilityStore((s) => s.fetchTable)
  const table = useModelCapabilityStore((s) => s.table)
  const openSettings = useSettingsStore((s) => s.openSettings)
  // Un rejeu de la banque tient déjà le modèle : la file attend qu'il finisse.
  const replaying = useEvalStore((s) => s.progress !== null)
  const open = useModelBenchmarkStore((s) => s.openModel)
  const setOpen = useModelBenchmarkStore((s) => s.setOpenModel)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!slug) return
    void fetchMatrix(slug)
    void fetchTable(slug)
  }, [slug, fetchMatrix, fetchTable])
  // Le modèle de Cortex sans mesure complète se mesure une fois, sans clic, quand l'onglet s'ouvre ou que le modèle de Cortex
  // change (R125). Les autres restent à la demande ; le store garde ce qu'il a déjà mesuré seul.
  useEffect(() => {
    if (slug && table && matrix) void measureCortexModel(slug)
  }, [slug, table, matrix, measureCortexModel])

  if (!matrix) return <p className="text-xs text-muted-foreground">{t.reading}</p>
  if (matrix.models.length === 0) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {t.noModels}
        <Button size="sm" variant="outline" onClick={() => openSettings("ai")}>{tp.setUpAi}</Button>
      </p>
    )
  }

  const neverRun = matrix.models.every((row) => row.lastRunAt === null)
  // Ceux qui ne se passent pas à la fin : ils n'ont rien à montrer dans les colonnes. Le reste garde son ordre (R57).
  const rows = [...matrix.models].sort((a, b) => Number(a.facts.chat === false) - Number(b.facts.chat === false))

  /** Les flèches passent d'une ligne à l'autre, Entrée ouvre son détail : le geste du bouton de la ligne. */
  const arrows = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const lines = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-benchmark-line]") ?? [])]
    const here = lines.indexOf(document.activeElement as HTMLButtonElement)
    if (here < 0) return
    event.preventDefault()
    lines[Math.min(Math.max(here + (event.key === "ArrowDown" ? 1 : -1), 0), lines.length - 1)]?.focus()
  }

  let line: ReactNode = <span />
  if (error) line = <p className="min-w-0 truncate text-xs text-destructive">{error}</p>
  else if (neverRun && !progress) line = <p className="min-w-0 truncate text-xs text-muted-foreground">{t.empty}</p>

  return (
    <div className="flex w-full flex-col gap-1">
      {/* Une hauteur fixe : ce qui avance ou échoue ne pousse jamais la liste (R133). */}
      <div className="flex h-7 items-center justify-between gap-2">
        {line}
        <div className="flex shrink-0 items-center gap-1">
          {progress && (
            <Named name={progress.stopping ? t.stopping : t.stop}>
              <span className="inline-flex shrink-0">
                <Button size="icon-sm" variant="ghost" onClick={() => stop(slug)} disabled={progress.stopping} aria-label={progress.stopping ? t.stopping : t.stop}>
                  <Square className="size-3.5" />
                </Button>
              </span>
            </Named>
          )}
          <RunPicker slug={slug} matrix={matrix} disabled={replaying} />
        </div>
      </div>

      {/* Les têtes s'alignent sur les signes : le retrait du bouton de la ligne (4 px). */}
      <div className="flex h-5 justify-end pr-1">
        {matrix.tasks.map((task) => <TaskHead key={task.key} task={task} />)}
      </div>
      <ul ref={listRef} onKeyDown={arrows} className="flex flex-col">
        {rows.map((row) => (
          <ModelLine
            key={row.model}
            slug={slug}
            matrix={matrix}
            row={row}
            open={open === row.model}
            onToggle={() => setOpen(open === row.model ? null : row.model)}
          />
        ))}
      </ul>
    </div>
  )
}

/**
 * Le geste principal : quels modèles passer (ceux qui sont installés, avec leur dernier passage), et à peu près combien de temps.
 * Il reste là pendant un passage : ce qu'on ajoute attend son tour. Un modèle qui ne sait pas converser le dit, et ne se coche pas.
 */
function RunPicker({ slug, matrix, disabled }: Readonly<{ slug: string; matrix: BenchmarkMatrix; disabled: boolean }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const run = useModelBenchmarkStore((s) => s.run)
  const open = useModelBenchmarkStore((s) => s.pickerOpen)
  const setOpen = useModelBenchmarkStore((s) => s.setPickerOpen)
  const runningModel = useModelBenchmarkStore((s) => s.progress?.model ?? null)
  const queue = useModelBenchmarkStore((s) => s.queue)
  const runnable = matrix.models.filter((row) => row.facts.chat !== false)
  const inUse = runnable.find((row) => row.current)?.model ?? runnable[0]?.model
  const [chosen, setChosen] = useState<string[]>(inUse ? [inUse] : [])
  const taken = (model: string) => model === runningModel || queue.some((item) => item.model === model)
  const available = runnable.filter((row) => !taken(row.model)).map((row) => row.model)
  const picked = chosen.filter((model) => available.includes(model))

  const toggle = (model: string, on: boolean) =>
    setChosen((list) => (on ? [...list.filter((name) => name !== model), model] : list.filter((name) => name !== model)))

  const start = () => {
    setOpen(false)
    // Dans l'ordre de la matrice : le modèle en service d'abord.
    void run(slug, matrix.models.filter((row) => picked.includes(row.model)).map((row) => row.model))
  }

  const trigger = (
    <Button size="sm" className="gap-1.5" disabled={disabled} aria-label={disabled ? t.replayBusy : undefined}>
      <Play className="size-3" aria-hidden="true" />
      {t.run}
    </Button>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {disabled ? (
        // Un bouton désactivé ne reçoit pas le survol : c'est le `span` qui dit pourquoi.
        <Named name={t.replayBusy} wide>
          <span className="inline-flex">{trigger}</span>
        </Named>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent align="end" className="w-72 p-2">
        <ul className="flex max-h-64 flex-col overflow-y-auto" aria-label={t.modelsToRun}>
          {[...runnable, ...matrix.models.filter((row) => row.facts.chat === false)].map((row) => {
            const chats = row.facts.chat !== false
            const busy = taken(row.model)
            let side: string = row.lastRunAt ? dayOf(row.lastRunAt) : t.never
            if (!chats) side = t.cannotChat
            else if (busy) side = t.queued
            return (
              <li key={row.model}>
                <label className={cn("flex h-8 items-center gap-2 rounded-md px-1.5", chats && !busy ? "cursor-pointer hover:bg-muted" : "cursor-default opacity-50")}>
                  <Checkbox
                    checked={picked.includes(row.model)}
                    disabled={!chats || busy}
                    onCheckedChange={(checked) => toggle(row.model, checked === true)}
                    aria-label={row.model}
                  />
                  <Named name={row.model}>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{row.model}</span>
                  </Named>
                  <span className="shrink-0 text-xs text-muted-foreground">{side}</span>
                </label>
              </li>
            )
          })}
        </ul>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setChosen(available)} disabled={picked.length === available.length}>{t.all}</Button>
            <span className="truncate text-xs text-muted-foreground">
              {picked.length > 0 ? roughDuration(estimateOf(matrix, picked), t) : ""}
            </span>
          </div>
          <Button size="sm" onClick={start} disabled={picked.length === 0}>{t.run}</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
