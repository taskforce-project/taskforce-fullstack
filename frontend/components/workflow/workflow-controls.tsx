"use client"

import { format } from "date-fns"
import { Check, ListFilter } from "lucide-react"

import { StateMark } from "@/components/workflow/state-mark"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { LiveState } from "@/lib/hooks/use-project-live"
import { fillText } from "@/lib/delivery/result-card"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useWorkflowViewStore } from "@/lib/store/workflow-view-store"
import { cn } from "@/lib/utils"
import { DENSITIES, FILTERS, FILTER_STATE, WORKFLOW_STATES, type Density, type WorkflowFilter } from "@/lib/workflow/states"

/**
 * Le direct, en un point et un mot (séance n°25, §10) : « Live » (point vert), « Reconnecting… » (point jaune),
 * « Offline. Showing {time}. » (point gris). Rien avant la première connexion : aucun indicateur ne clignote.
 */
export function LiveIndicator({ state, readAt }: Readonly<{ state: LiveState; readAt: number | null }>) {
  const t = usePreferencesStore((s) => s.t.workflow.live)
  if (state === "connecting") return null
  const word = state === "live" ? t.on
    : state === "reconnecting" ? t.reconnecting
      : fillText(t.offline, { time: readAt ? format(new Date(readAt), "HH:mm") : "--:--" })
  const dot = state === "live" ? "bg-ink-green" : state === "reconnecting" ? "bg-shape-yellow" : "bg-subtle"
  return (
    <span role="status" className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-muted-foreground">
      <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />
      {word}
    </span>
  )
}

/** Le sélecteur de densité : un contrôle segmenté de 28 px, Summary, Plan, Detail (1, 2, 3 au clavier). */
export function DensitySwitch({ value, onChange }: Readonly<{ value: Density; onChange: (density: Density) => void }>) {
  const t = usePreferencesStore((s) => s.t.workflow.density)
  return (
    <div role="radiogroup" aria-label={t.label} className="flex h-7 shrink-0 items-center border border-border p-0.5">
      {DENSITIES.map((density) => (
        <button
          key={density}
          type="button"
          role="radio"
          aria-checked={value === density}
          onClick={() => onChange(density)}
          className={cn(
            "flex h-full items-center px-2 text-xs transition-colors duration-150 motion-reduce:transition-none",
            value === density ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t[density]}
        </button>
      ))}
    </div>
  )
}

/** « Filter » : un filtre à la fois (Needs you, Blocked, Missing, Failed), et « Show everything ». */
export function FilterMenu({ value, onChange }: Readonly<{ value: WorkflowFilter | null; onChange: (filter: WorkflowFilter | null) => void }>) {
  const t = usePreferencesStore((s) => s.t.workflow)
  const label = value ? `${t.filter.label}: ${t.state[FILTER_STATE[value]]}` : t.filter.label
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 px-2 text-xs transition-colors duration-150 hover:bg-muted motion-reduce:transition-none",
            value ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          <ListFilter className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{value ? t.state[FILTER_STATE[value]] : t.filter.label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {FILTERS.map((filter) => (
          <DropdownMenuItem key={filter} onSelect={() => onChange(filter)} className="gap-2">
            <StateMark state={FILTER_STATE[filter]} word={t.state[FILTER_STATE[filter]]} />
            <span className="flex-1">{t.filter[filter === "needs-you" ? "needsYou" : filter]}</span>
            {value === filter && <Check className="size-4" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange(null)} disabled={value === null}>{t.filter.clear}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * La légende (« ... », puis « Legend », ou la touche `?`) : les dix états, chacun avec sa marque, son mot et ce qu'il dit,
 * tels que la carte les montre.
 */
export function LegendDialog() {
  const t = usePreferencesStore((s) => s.t.workflow)
  const open = useWorkflowViewStore((s) => s.legendOpen)
  const setOpen = useWorkflowViewStore((s) => s.setLegendOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t.legend}</DialogTitle>
          <DialogDescription className="sr-only">{t.legend}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y divide-border">
          {WORKFLOW_STATES.map((state) => (
            <li key={state} className="flex items-start gap-3 py-2">
              <StateMark state={state} word={t.state[state]} className="mt-0.5" />
              <span className="w-24 shrink-0 text-sm font-medium text-foreground">{t.state[state]}</span>
              <span className="text-sm text-muted-foreground">{t.meaning[state]}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
