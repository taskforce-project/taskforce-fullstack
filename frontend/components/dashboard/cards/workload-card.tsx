"use client"

import { useEffect, useState } from "react"

import { getAnalyticsWorkload, type Workload } from "@/lib/api/analytics-service"
import { cn } from "@/lib/utils"
import { GLOBAL_RANGE_DAYS, type DashboardCardBodyProps } from "../card-registry"
import { CardEmpty, CardError, CardSkeleton } from "../card-states"

const MAX_MEMBERS = 6

/** Fenêtre en jours : réglage carte (7d/14d/30d) prioritaire, sinon période globale. */
function windowDays(timeRange: string | null, globalDays: number): number {
  if (timeRange === "7d") return 7
  if (timeRange === "14d") return 14
  if (timeRange === "30d") return 30
  return globalDays
}

/** Échelle d'intensité des cellules - même palette que la heatmap d'Intelligence. */
function cellClass(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "bg-muted/40"
  const ratio = count / max
  if (ratio <= 0.25) return "bg-amber-500/30"
  if (ratio <= 0.5) return "bg-amber-500/55"
  if (ratio <= 0.75) return "bg-orange-500/70"
  return "bg-rose-500/85"
}

/** Heatmap compacte membre × jour des échéances (endpoint analytics/workload réel). */
export function WorkloadCard({ slug, card, globalRange, refreshToken }: DashboardCardBodyProps) {
  const [workload, setWorkload] = useState<Workload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  const days = windowDays(card.timeRange, GLOBAL_RANGE_DAYS[globalRange])

  useEffect(() => {
    if (!slug) return
    let alive = true
    setLoading(true)
    setError(false)
    getAnalyticsWorkload(slug, days)
      .then((d) => {
        if (alive) setWorkload(d)
      })
      .catch(() => {
        if (alive) setError(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [slug, days, refreshToken, retry])

  if (loading) return <CardSkeleton />
  if (error) return <CardError onRetry={() => setRetry((n) => n + 1)} />

  const members = workload?.members ?? []
  if (members.length === 0) return <CardEmpty message="No workload data available" />

  const peak = Math.max(0, ...members.flatMap((m) => m.days.map((d) => d.count)))
  if (peak === 0) return <CardEmpty message={`No due dates scheduled in ${days}d`} />

  const visible = members.slice(0, MAX_MEMBERS)

  return (
    <div className="flex h-full flex-col justify-center gap-1.5 p-4">
      {visible.map((m) => (
        <div key={m.userId} className="flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-[10px] text-muted-foreground" title={m.displayName}>
            {m.displayName}
          </span>
          <div className="flex min-w-0 flex-1 gap-px">
            {m.days.map((d) => (
              <div
                key={d.date}
                className={cn("h-3 min-w-0 flex-1 rounded-[2px]", cellClass(d.count, peak))}
                title={`${m.displayName} · ${d.date} : ${d.count}`}
              />
            ))}
          </div>
          <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{m.openIssues}</span>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/70">
        <span>Échéances · {days} j</span>
        {members.length > MAX_MEMBERS && <span>+{members.length - MAX_MEMBERS} membres</span>}
      </div>
    </div>
  )
}
