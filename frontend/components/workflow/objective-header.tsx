"use client"

import { useState, type ReactNode } from "react"
import { Pencil } from "lucide-react"

import { ObjectiveDialog } from "@/components/workflow/objective-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ProjectObjective } from "@/lib/api/project-service"
import { fillText } from "@/lib/delivery/result-card"
import { cn } from "@/lib/utils"
import { parseServerDate } from "@/lib/utils/server-date"
import type { WorkflowCounts } from "@/lib/workflow/model"
import { dayWords, type WorkflowTexts } from "@/lib/workflow/sentence"
import type { WorkflowFilter } from "@/lib/workflow/states"

/** Où se pose le trait d'aujourd'hui, entre le début du projet et la date visée (0 à 1) ; null sans date visée. */
export function todayMark(start: string | null | undefined, target: string | null | undefined, now: Date): number | null {
  if (!start || !target) return null
  const from = parseServerDate(start).getTime()
  const [year, month, day] = target.slice(0, 10).split("-").map(Number)
  const to = new Date(year, (month ?? 1) - 1, day ?? 1, 23, 59).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null
  return Math.min(1, Math.max(0, (now.getTime() - from) / (to - from)))
}

const COUNTERS: readonly { filter: WorkflowFilter; key: keyof WorkflowCounts; ink: string; dot?: boolean }[] = [
  // L'encre bleue lisible (AA sur le fond de l'en-tête, en clair comme en sombre) ; le point garde --primary.
  { filter: "needs-you", key: "needsYou", ink: "text-ink-blue", dot: true },
  { filter: "blocked", key: "blocked", ink: "text-ink-yellow" },
  { filter: "missing", key: "missing", ink: "text-ink-yellow" },
  { filter: "failed", key: "failed", ink: "text-destructive" },
]

/**
 * L'en-tête de l'objectif (séance n°25, §3), la première lecture du dirigeant : le but en une ligne, la date visée, ce qui
 * est fait sur le total et le nombre de critères (un clic les montre) ; à droite, des compteurs qui sont des filtres
 * (Needs you, Blocked, Missing, Failed ; un compteur à zéro disparaît) ; en bas, la part faite sur quatre pixels, et un trait
 * d'un pixel pour aujourd'hui sur toute la hauteur de l'en-tête, entre le début du projet et la date visée (« Today » au
 * survol) : l'avance ou le retard se lit à la forme, la part faite d'un côté du trait, jamais à un pourcentage (R56). Sans
 * objectif, il le dit et propose de l'écrire, à qui le peut.
 */
export function ObjectiveHeader({
  slug, projectId, objective, readFailed = false, onRetry, projectStart, counts, done, total, filter, onFilter, now, narrow, t,
  controls = null,
}: Readonly<{
  slug: string
  projectId: number
  objective: ProjectObjective | undefined
  /** La lecture de l'objectif a échoué, et aucun n'est connu : l'en-tête le dit, avec « Try again ». */
  readFailed?: boolean
  onRetry?: () => void
  /** Le début du projet (sa création), d'où part le trait d'aujourd'hui. */
  projectStart: string | null | undefined
  counts: WorkflowCounts
  done: number
  total: number
  filter: WorkflowFilter | null
  onFilter: (filter: WorkflowFilter | null) => void
  now: Date
  narrow: boolean
  t: WorkflowTexts
  /** Le direct, la densité et le filtre, quand la vue est étroite : ils quittent la ligne des onglets pour celle-ci. */
  controls?: ReactNode
}>) {
  const [editing, setEditing] = useState(false)
  const o = t.objective
  const goal = objective?.goal ?? null
  const canEdit = objective?.canEdit === true
  const criteria = objective?.criteria ?? []
  const share = total > 0 ? done / total : 0
  const mark = goal ? todayMark(projectStart, objective?.targetDate, now) : null
  const progressLabel = fillText(o.progress, { done, total })

  const meta = [
    goal ? (objective?.targetDate ? fillText(o.target, { date: dayWords(objective.targetDate, now).replace(/^on /, "") }) : o.noTarget) : null,
    fillText(o.done, { done, total }),
  ].filter((part): part is string => part !== null)

  return (
    <div className={cn("relative flex shrink-0 gap-x-4 gap-y-2 border-b border-border bg-paper-soft px-4 pb-2.5 pt-2", narrow ? "flex-col" : "min-h-14 items-center")}>
      {/* Aujourd'hui, sur toute la hauteur : derrière les mots, et « Today » au survol d'une marge de quelques pixels. */}
      {mark !== null && (
        <span
          data-today
          title={o.today}
          className="absolute inset-y-0 z-0 flex w-2 -translate-x-1/2 justify-center"
          style={{ left: `${Math.round(mark * 1000) / 10}%` }}
        >
          <span aria-hidden="true" className="h-full w-px bg-foreground/50" />
        </span>
      )}
      <div className="relative z-10 min-w-0 flex-1">
        {goal ? (
          <div className="group/goal flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 truncate text-base font-[550] text-foreground" title={goal}>{goal}</p>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label={o.change}
                title={o.change}
                className="flex size-6 shrink-0 items-center justify-center text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/goal:opacity-100 motion-reduce:transition-none"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ) : readFailed && !objective ? (
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm text-foreground">
            <span>{o.loadFailed}</span>
            {onRetry && (
              <button type="button" onClick={onRetry} className="text-ink-blue underline-offset-2 hover:underline">
                {o.retry}
              </button>
            )}
          </p>
        ) : (
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm text-foreground">
            <span>{o.none}</span>
            {canEdit && (
              <button type="button" onClick={() => setEditing(true)} className="text-ink-blue underline-offset-2 hover:underline">
                {o.add}
              </button>
            )}
          </p>
        )}
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {meta.map((part, i) => (
            <span key={part} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">·</span>}
              {part}
            </span>
          ))}
          {goal && criteria.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="underline-offset-2 hover:text-foreground hover:underline">
                    {criteria.length === 1 ? o.criteriaOne : fillText(o.criteriaMany, { count: criteria.length })}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-3 text-sm">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{o.criteriaLabel}</p>
                  <ol className="flex list-decimal flex-col gap-1.5 pl-4">
                    {criteria.map((criterion, i) => <li key={i} className="text-foreground">{criterion}</li>)}
                  </ol>
                </PopoverContent>
              </Popover>
            </>
          )}
        </p>
      </div>

      <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-1" role="group" aria-label={t.filter.label}>
        {COUNTERS.map(({ filter: value, key, ink, dot }) => {
          const count = counts[key]
          if (count === 0) return null
          const label = fillText(t.count[key], { count })
          const on = filter === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => onFilter(on ? null : value)}
              className={cn(
                "flex h-7 items-center gap-1.5 px-2 text-xs font-medium transition-colors duration-150 hover:bg-muted motion-reduce:transition-none",
                ink,
                on && "bg-muted ring-1 ring-inset ring-border",
              )}
            >
              {dot && <span aria-hidden="true" className="size-2 rounded-full bg-primary" />}
              <span className="tabular-nums">{label}</span>
            </button>
          )
        })}
        {controls}
      </div>

      {/* La part faite : une forme, pas un pourcentage. */}
      <div role="img" aria-label={progressLabel} title={progressLabel} data-progress className="absolute inset-x-0 bottom-0 h-1 bg-muted">
        <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${Math.round(share * 1000) / 10}%` }} />
      </div>

      <ObjectiveDialog slug={slug} projectId={projectId} objective={objective} open={editing} onOpenChange={setEditing} />
    </div>
  )
}
