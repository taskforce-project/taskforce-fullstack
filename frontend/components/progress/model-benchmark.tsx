"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { AlignLeft, Play, Square } from "lucide-react"

import { BenchmarkDetail } from "@/components/progress/benchmark-detail"
import { TASK_ICONS, VerdictMark } from "@/components/progress/benchmark-signs"
import { Named } from "@/components/progress/named"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cellTitle, estimateOf, roughDuration } from "@/lib/ai/benchmark"
import type { BenchmarkMatrix, BenchmarkModelRow, BenchmarkTaskInfo } from "@/lib/api/model-benchmark-service"
import { fillText } from "@/lib/delivery/result-card"
import { dayOf } from "@/lib/progress/day"
import { useEvalStore } from "@/lib/store/eval-store"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

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

/** Une ligne, 36 px : le point du modèle en service, son nom, un verdict par tâche ; un clic ouvre son détail dans la ligne. */
function ModelLine({ slug, matrix, row, open, onToggle }: Readonly<{
  slug: string
  matrix: BenchmarkMatrix
  row: BenchmarkModelRow
  open: boolean
  onToggle: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const detailId = useId()
  const labelOf = (key: string) => matrix.tasks.find((task) => task.key === key)?.label ?? key
  return (
    <li>
      <button
        type="button"
        data-benchmark-line
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        onClick={onToggle}
        className={cn(
          "flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-1 text-left transition-colors duration-150 hover:bg-muted motion-reduce:transition-none",
          open && "bg-muted",
        )}
      >
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
        <span className="flex shrink-0">
          {row.cells.map((cell) => (
            <span key={cell.task} className={COLUMN}>
              <VerdictMark verdict={cell.verdict} judge={cell.judge} name={cellTitle(labelOf(cell.task), cell, t)} />
            </span>
          ))}
        </span>
      </button>
      {open && (
        <div id={detailId}>
          <BenchmarkDetail slug={slug} model={row.model} tasks={matrix.tasks} models={matrix.models} />
        </div>
      )}
    </li>
  )
}

/**
 * Le banc des modèles (R131, séance n°19) : « que puis-je confier à ce modèle ? ». Une ligne par modèle, une colonne de
 * 28 px par tâche, le verdict en signe, son mot au survol (Le dessin). Tout tient dans 480 px, sans défilement horizontal.
 * Un seul geste principal : Run. Un clic sur une ligne ouvre son détail. Le modèle en service d'abord, puis l'ordre
 * d'installation : aucun classement (R57).
 */
export function ModelBenchmark({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const matrix = useModelBenchmarkStore((s) => s.matrix)
  const progress = useModelBenchmarkStore((s) => s.progress)
  const error = useModelBenchmarkStore((s) => s.error)
  const fetchMatrix = useModelBenchmarkStore((s) => s.fetchMatrix)
  const stop = useModelBenchmarkStore((s) => s.stop)
  // Un rejeu de la banque ou une mesure tient déjà le modèle : un passage attend qu'ils finissent.
  const replaying = useEvalStore((s) => s.progress !== null)
  const measuring = useModelCapabilityStore((s) => s.progress !== null)
  const open = useModelBenchmarkStore((s) => s.openModel)
  const setOpen = useModelBenchmarkStore((s) => s.setOpenModel)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (slug) void fetchMatrix(slug)
  }, [slug, fetchMatrix])

  if (!matrix) return <p className="text-xs text-muted-foreground">{t.reading}</p>
  if (matrix.models.length === 0) return <p className="text-xs text-muted-foreground">{t.noModels}</p>

  const neverRun = matrix.models.every((row) => row.lastRunAt === null)

  /** Les flèches passent d'une ligne à l'autre, Entrée ouvre son détail : le geste du bouton de la ligne. */
  const arrows = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const lines = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-benchmark-line]") ?? [])]
    const here = lines.indexOf(document.activeElement as HTMLButtonElement)
    if (here < 0) return
    event.preventDefault()
    lines[Math.min(Math.max(here + (event.key === "ArrowDown" ? 1 : -1), 0), lines.length - 1)]?.focus()
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex min-h-7 items-center justify-between gap-2">
        {neverRun && !progress
          ? <p className="text-xs text-muted-foreground">{t.empty}</p>
          : <span />}
        {progress ? (
          <Named name={t.stop}>
            <span className="inline-flex shrink-0">
              <Button size="icon-sm" variant="ghost" onClick={stop} disabled={progress.stopping} aria-label={t.stop}>
                <Square className="size-3.5" />
              </Button>
            </span>
          </Named>
        ) : (
          <RunPicker slug={slug} matrix={matrix} disabled={replaying || measuring} />
        )}
      </div>

      {progress && <RunLine done={progress.done} total={progress.total} model={progress.model} waitSeconds={progress.waitSeconds} />}

      {(!neverRun || progress) && (
        <>
          {/* Les têtes s'alignent sur les signes : le retrait du bouton de la ligne (4 px). */}
          <div className="flex h-5 justify-end pr-1">
            {matrix.tasks.map((task) => <TaskHead key={task.key} task={task} />)}
          </div>
          <ul ref={listRef} onKeyDown={arrows} className="flex flex-col">
            {matrix.models.map((row) => (
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
        </>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/** Le fil d'avancement : une ligne fine, le nombre de cas à côté ; le modèle et l'attente sont au survol et pour les lecteurs d'écran. */
function RunLine({ done, total, model, waitSeconds }: Readonly<{
  done: number
  total: number
  model: string
  waitSeconds: number | null
}>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  const label = waitSeconds !== null
    ? fillText(t.waiting, { seconds: waitSeconds })
    : fillText(t.progress, { model, done, total })
  return (
    <Named name={label} wide>
      <div className="flex items-center gap-2" role="status" aria-label={label}>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-0.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border"
        >
          <div className="h-full bg-foreground transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
        </div>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{done}/{total}</span>
      </div>
    </Named>
  )
}

/** Le geste principal : quels modèles passer (ceux qui sont installés, avec leur dernier passage), et à peu près combien de temps. */
function RunPicker({ slug, matrix, disabled }: Readonly<{ slug: string; matrix: BenchmarkMatrix; disabled: boolean }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const run = useModelBenchmarkStore((s) => s.run)
  const inUse = matrix.models.find((row) => row.current)?.model ?? matrix.models[0]?.model
  const [chosen, setChosen] = useState<string[]>(inUse ? [inUse] : [])
  const [open, setOpen] = useState(false)

  const toggle = (model: string, on: boolean) =>
    setChosen((list) => (on ? [...list.filter((name) => name !== model), model] : list.filter((name) => name !== model)))

  const start = () => {
    setOpen(false)
    // Dans l'ordre de la matrice : le modèle en service d'abord.
    void run(slug, matrix.models.filter((row) => chosen.includes(row.model)).map((row) => row.model))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" className="gap-1.5" disabled={disabled}>
          <Play className="size-3" aria-hidden="true" />
          {t.run}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <ul className="flex max-h-64 flex-col overflow-y-auto" aria-label={t.modelsToRun}>
          {matrix.models.map((row) => (
            <li key={row.model}>
              <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 hover:bg-muted">
                <Checkbox
                  checked={chosen.includes(row.model)}
                  onCheckedChange={(checked) => toggle(row.model, checked === true)}
                  aria-label={row.model}
                />
                <Named name={row.model}>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{row.model}</span>
                </Named>
                <span className="shrink-0 text-xs text-muted-foreground">{row.lastRunAt ? dayOf(row.lastRunAt) : t.never}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
          <span className="text-xs text-muted-foreground">
            {chosen.length > 0 ? roughDuration(estimateOf(matrix, chosen), t) : ""}
          </span>
          <Button size="sm" onClick={start} disabled={chosen.length === 0}>{t.run}</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
