"use client"

import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react"
import { AlignLeft, Play, Square } from "lucide-react"

import { BenchmarkDetail } from "@/components/progress/benchmark-detail"
import { TASK_ICONS, VerdictMark } from "@/components/progress/benchmark-signs"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cellTitle, estimateOf, roughDuration } from "@/lib/ai/benchmark"
import type { BenchmarkMatrix } from "@/lib/api/model-benchmark-service"
import { fillText } from "@/lib/delivery/result-card"
import { useEvalStore } from "@/lib/store/eval-store"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { parseServerDate } from "@/lib/utils/server-date"

const dayOf = (at: string | null): string | null =>
  at ? parseServerDate(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null

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
  const tableRef = useRef<HTMLTableElement>(null)

  useEffect(() => {
    if (slug) void fetchMatrix(slug)
  }, [slug, fetchMatrix])

  if (!matrix) return <p className="text-xs text-muted-foreground">{t.reading}</p>
  if (matrix.models.length === 0) return <p className="text-xs text-muted-foreground">{t.noModels}</p>

  const neverRun = matrix.models.every((row) => row.lastRunAt === null)

  // Les flèches passent d'une ligne à l'autre, Entrée ouvre la ligne (Saarinen).
  const onRowKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    const rows = Array.from(tableRef.current?.querySelectorAll<HTMLButtonElement>("[data-benchmark-row]") ?? [])
    const at = rows.indexOf(e.currentTarget)
    const next = rows[(at + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length]
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex min-h-7 items-center justify-between gap-2">
        {neverRun && !progress
          ? <p className="text-xs text-muted-foreground">{t.empty}</p>
          : <span />}
        {progress ? (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={stop} disabled={progress.stopping} title={t.stop}>
            <Square className="size-3" aria-hidden="true" />
            {t.stop}
          </Button>
        ) : (
          <RunPicker slug={slug} matrix={matrix} disabled={replaying || measuring} />
        )}
      </div>

      {progress && <RunLine done={progress.done} total={progress.total} model={progress.model} waitSeconds={progress.waitSeconds} />}

      {!neverRun || progress ? (
        <table ref={tableRef} className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col />
            {matrix.tasks.map((task) => <col key={task.key} className="w-7" />)}
          </colgroup>
          <thead>
            <tr className="h-7 text-muted-foreground">
              <th scope="col"><span className="sr-only">{t.model}</span></th>
              {matrix.tasks.map((task) => {
                const Icon = TASK_ICONS[task.key] ?? AlignLeft
                return (
                  <th key={task.key} scope="col" title={task.label} aria-label={task.label} className="font-normal">
                    <Icon className="mx-auto size-3.5" aria-hidden="true" />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.models.map((row) => {
              const expanded = open === row.model
              return (
                <Fragment key={row.model}>
                  <tr
                    className="h-9 cursor-pointer border-t border-border/60 transition-colors duration-150 hover:bg-muted/40 motion-reduce:transition-none"
                    onClick={() => setOpen(expanded ? null : row.model)}
                  >
                    <td className="min-w-0 pr-1">
                      <button
                        type="button"
                        data-benchmark-row
                        aria-expanded={expanded}
                        title={row.model}
                        onKeyDown={onRowKey}
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpen(expanded ? null : row.model)
                        }}
                        className="flex w-full min-w-0 items-center gap-1.5 text-left font-mono text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        {row.current && (
                          <span title={t.inUse} aria-label={t.inUse} className="size-1.5 shrink-0 rounded-full bg-foreground" />
                        )}
                        <span className="truncate">{row.model}</span>
                      </button>
                    </td>
                    {row.cells.map((cell) => {
                      const task = matrix.tasks.find((candidate) => candidate.key === cell.task)
                      const title = cellTitle(task?.label ?? cell.task, cell, t)
                      return (
                        <td key={cell.task} className="text-center" title={title}>
                          <VerdictMark verdict={cell.verdict} judge={cell.judge} />
                          <span className="sr-only">{title}</span>
                        </td>
                      )
                    })}
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={matrix.tasks.length + 1} className="pb-3">
                        <BenchmarkDetail slug={slug} model={row.model} tasks={matrix.tasks} models={matrix.models} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      ) : null}

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
    <div className="flex items-center gap-2" role="status" title={label} aria-label={label}>
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
          {matrix.models.map((row) => {
            const last = dayOf(row.lastRunAt)
            return (
              <li key={row.model}>
                <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 hover:bg-muted">
                  <Checkbox
                    checked={chosen.includes(row.model)}
                    onCheckedChange={(checked) => toggle(row.model, checked === true)}
                    aria-label={row.model}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={row.model}>{row.model}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{last ?? t.never}</span>
                </label>
              </li>
            )
          })}
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
