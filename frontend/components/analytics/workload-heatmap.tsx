"use client"

import { useRef, useState } from "react"
import { CalendarX2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Workload } from "@/lib/api/analytics-service"

/**
 * Heatmap de charge d'équipe (US-022) : membres (lignes) × jours (colonnes).
 * Intensité d'une cellule = nombre d'échéances (issues ouvertes assignées) ce jour-là,
 * relative au max de la grille. Lecture façon GitHub contributions (tooltip riche au survol).
 */

const EMPTY_CELL = "bg-muted/40"

/** Échelle d'intensité (ratio 0..1 → classe Tailwind). */
function cellClass(count: number, max: number): string {
  if (count <= 0 || max <= 0) return EMPTY_CELL
  const ratio = count / max
  if (ratio <= 0.25) return "bg-amber-500/30"
  if (ratio <= 0.5) return "bg-amber-500/55"
  if (ratio <= 0.75) return "bg-orange-500/70"
  return "bg-rose-500/85"
}

function dayLabel(iso: string): { dow: string; dom: string } {
  const d = new Date(`${iso}T00:00:00`)
  return {
    dow: d.toLocaleDateString("en-US", { weekday: "short" }).replace(".", ""),
    dom: String(d.getDate()),
  }
}

/** Date lisible pour le tooltip : « samedi 18 juillet ». */
function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })
}

/** Cellule survolée : contenu + position (relative au wrapper) pour le tooltip. */
interface HoverState {
  member: string
  date: string
  count: number
  x: number
  y: number
}

export function WorkloadHeatmap({ data }: { readonly data: Workload | null }) {
  const [hover, setHover] = useState<HoverState | null>(null)
  // Ancre du tooltip : un wrapper `relative`. On positionne le tooltip en `absolute` par rapport
  // à lui (et non en `fixed`) : la Drawer vaul applique un `transform` d'animation, ce qui casse
  // `position: fixed` (résolu contre l'ancêtre transformé, pas le viewport). Le positionnement
  // relatif via des différences de getBoundingClientRect est, lui, insensible à ce transform.
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  if (!data || data.members.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">No workload data available.</p>
  }

  const days = data.members[0]?.days ?? []
  const peak = Math.max(0, ...data.members.flatMap((m) => m.days.map((d) => d.count)))

  // Toutes les cellules à zéro = aucune échéance planifiée sur la fenêtre. Sans ce garde-fou,
  // la grille s'affiche entièrement grise et donne l'impression d'être cassée.
  if (peak === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-3 py-10 text-center">
        <CalendarX2 className="size-6 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">No due dates scheduled</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          No one has a task due within the next {days.length || 14} days. The heatmap will
          fill up as soon as issues have an assigned due date.
        </p>
      </div>
    )
  }
  const max = Math.max(1, peak)

  const showTip = (e: React.MouseEvent<HTMLDivElement>, member: string, date: string, count: number) => {
    const wrap = wrapperRef.current
    if (!wrap) return
    const cr = e.currentTarget.getBoundingClientRect()
    const wr = wrap.getBoundingClientRect()
    setHover({ member, date, count, x: cr.left - wr.left + cr.width / 2, y: cr.top - wr.top })
  }

  return (
    <div ref={wrapperRef} className="relative h-full">
      <div className="h-full overflow-auto">
        <div className="min-w-[640px]">
          {/* Légende d'intensité - en tête pour rester visible même avec beaucoup de membres. */}
          <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="mr-1 font-medium uppercase tracking-wide">Due dates / day</span>
            <span>less</span>
            <span className={cn("size-3 rounded-sm", EMPTY_CELL)} />
            <span className="size-3 rounded-sm bg-amber-500/30" />
            <span className="size-3 rounded-sm bg-amber-500/55" />
            <span className="size-3 rounded-sm bg-orange-500/70" />
            <span className="size-3 rounded-sm bg-rose-500/85" />
            <span>more</span>
            <span className="ml-auto tabular-nums">peak: {peak}</span>
          </div>

          {/* En-tête des jours */}
          <div className="flex items-end gap-1 pb-1.5">
            <div className="w-44 shrink-0" />
            {days.map((d) => {
              const { dow, dom } = dayLabel(d.date)
              return (
                <div key={d.date} className="flex-1 text-center">
                  <div className="text-[9px] uppercase leading-none text-muted-foreground/70">{dow}</div>
                  <div className="text-[10px] font-medium tabular-nums text-muted-foreground">{dom}</div>
                </div>
              )
            })}
          </div>

          {/* Lignes membres */}
          <div className="flex flex-col gap-1">
            {data.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-1">
                <div className="flex w-44 shrink-0 items-center justify-between gap-2 pr-2">
                  <span className="truncate text-xs text-foreground">{m.displayName}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {m.openIssues} open{m.capacityHoursPerWeek != null ? ` · ${m.capacityHoursPerWeek}h` : ""}
                  </span>
                </div>
                {m.days.map((d) => (
                  <div
                    key={d.date}
                    onMouseEnter={(e) => showTip(e, m.displayName, d.date, d.count)}
                    onMouseLeave={() => setHover(null)}
                    className={cn(
                      "h-6 flex-1 cursor-default rounded-sm transition-all hover:ring-2 hover:ring-foreground/40",
                      cellClass(d.count, max),
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip riche (façon GitHub) - `absolute` dans le wrapper, posé juste au-dessus de la cellule. */}
      {hover && (
        <div
          role="tooltip"
          style={{ left: hover.x, top: hover.y, transform: "translate(-50%, calc(-100% - 8px))" }}
          className="pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
        >
          <div className="font-semibold text-foreground">
            {hover.count === 0 ? "No due date" : `${hover.count} due date${hover.count > 1 ? "s" : ""}`}
          </div>
          <div className="text-muted-foreground">
            {hover.member} · {prettyDate(hover.date)}
          </div>
        </div>
      )}
    </div>
  )
}
