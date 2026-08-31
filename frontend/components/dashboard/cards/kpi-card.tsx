"use client"

import { useEffect, useState } from "react"
import { Minus, TrendingDown, TrendingUp } from "lucide-react"

import { getAnalyticsKpis, type AnalyticsKpis } from "@/lib/api/analytics-service"
import { useProjectStore } from "@/lib/store/project-store"
import { cn } from "@/lib/utils"
import type { DashboardCardBodyProps } from "../card-registry"
import { CardError, CardSkeleton } from "../card-states"

/** Ligne de delta façon page Analytics : +N vs mois dernier, vert/rouge/neutre. */
function DeltaLine({ delta, suffix }: { readonly delta: number; readonly suffix: string }) {
  const DeltaIcon = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown
  const cls = delta === 0 ? "text-muted-foreground" : delta > 0 ? "text-emerald-500" : "text-rose-500"
  return (
    <div className={cn("flex items-center gap-1 text-xs font-medium tabular-nums", cls)}>
      <DeltaIcon className="size-3.5" />
      {delta > 0 ? "+" : ""}
      {delta} {suffix}
    </div>
  )
}

function KpiBody({
  value,
  unit,
  delta,
}: {
  readonly value: string
  readonly unit: string
  readonly delta?: number
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">{value}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      {delta !== undefined && <DeltaLine delta={delta} suffix="vs mois dernier" />}
    </div>
  )
}

/** Stat tiles « kpi-resolved » / « kpi-velocity » - endpoint analytics/kpis réel. */
export function KpiCard({ slug, card, refreshToken }: DashboardCardBodyProps) {
  const [kpis, setKpis] = useState<AnalyticsKpis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!slug) return
    let alive = true
    setLoading(true)
    setError(false)
    getAnalyticsKpis(slug)
      .then((d) => {
        if (alive) setKpis(d)
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
  }, [slug, refreshToken, retry])

  if (loading) return <CardSkeleton />
  if (error || !kpis) return <CardError onRetry={() => setRetry((n) => n + 1)} />

  if (card.cardType === "kpi-velocity") {
    return <KpiBody value={String(kpis.velocity)} unit="7 derniers jours" delta={kpis.velocityDelta} />
  }
  return <KpiBody value={String(kpis.tasksResolved)} unit="ce mois-ci" delta={kpis.tasksResolvedDelta} />
}

/**
 * Stat tile « kpi-open » - le endpoint kpis n'expose pas les issues ouvertes :
 * agrégat réel calculé depuis le store projets (somme des openIssues).
 */
export function KpiOpenCard({ slug, refreshToken }: DashboardCardBodyProps) {
  const projects = useProjectStore((s) => s.projects)
  const isLoading = useProjectStore((s) => s.isLoading)
  const error = useProjectStore((s) => s.error)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)

  useEffect(() => {
    // Garde anti-doublon : le store est partagé entre cartes - un seul GET par refresh global.
    if (slug && refreshToken > 0 && !useProjectStore.getState().isLoading) void fetchProjects(slug)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, refreshToken])

  if (isLoading && projects.length === 0) return <CardSkeleton />
  if (error && projects.length === 0) return <CardError onRetry={() => void fetchProjects(slug)} />

  const openIssues = projects.reduce((s, p) => s + p.openIssues, 0)
  return <KpiBody value={openIssues.toLocaleString("en-US")} unit={`of ${projects.length} operation${projects.length > 1 ? "s" : ""}`} />
}
