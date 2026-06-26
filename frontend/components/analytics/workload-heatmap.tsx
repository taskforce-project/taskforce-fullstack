"use client"

import { cn } from "@/lib/utils"
import type { Workload } from "@/lib/api/analytics-service"

/**
 * Heatmap de charge d'équipe (US-022) : membres (lignes) × jours (colonnes).
 * Intensité d'une cellule = nombre d'échéances (issues ouvertes assignées) ce jour-là,
 * relative au max de la grille. Lecture façon GitHub contributions.
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
    dow: d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", ""),
    dom: String(d.getDate()),
  }
}

export function WorkloadHeatmap({ data }: { readonly data: Workload | null }) {
  if (!data || data.members.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">Aucune donnée de charge disponible.</p>
  }

  const days = data.members[0]?.days ?? []
  const max = Math.max(1, ...data.members.flatMap((m) => m.days.map((d) => d.count)))

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
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
                  {m.openIssues} ouv.{m.capacityHoursPerWeek != null ? ` · ${m.capacityHoursPerWeek}h` : ""}
                </span>
              </div>
              {m.days.map((d) => (
                <div
                  key={d.date}
                  title={`${m.displayName} — ${d.count} échéance(s) le ${d.date}`}
                  className={cn("h-6 flex-1 rounded-sm", cellClass(d.count, max))}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Légende */}
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
          <span>moins</span>
          <span className={cn("size-3 rounded-sm", EMPTY_CELL)} />
          <span className="size-3 rounded-sm bg-amber-500/30" />
          <span className="size-3 rounded-sm bg-amber-500/55" />
          <span className="size-3 rounded-sm bg-orange-500/70" />
          <span className="size-3 rounded-sm bg-rose-500/85" />
          <span>plus</span>
        </div>
      </div>
    </div>
  )
}
