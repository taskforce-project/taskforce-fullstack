"use client"

import { useEffect } from "react"

import { useProjectStore } from "@/lib/store/project-store"
import { SegmentBar } from "@/components/ui/section-card"
import { cn } from "@/lib/utils"
import type { DashboardCardBodyProps } from "../card-registry"
import { healthCounts } from "../health"
import { CardEmpty, CardError, CardSkeleton } from "../card-states"

/** Santé des opérations : agrégats réels calculés depuis le store projets (aucun mock). */
export function OpsHealthCard({ slug, refreshToken }: DashboardCardBodyProps) {
  const projects = useProjectStore((s) => s.projects)
  const isLoading = useProjectStore((s) => s.isLoading)
  const error = useProjectStore((s) => s.error)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)

  useEffect(() => {
    // 0 = chargement initial déjà déclenché par la page ; on ne refetch que sur demande.
    // Garde anti-doublon : plusieurs cartes partagent ce store - un seul GET par refresh global.
    if (slug && refreshToken > 0 && !useProjectStore.getState().isLoading) void fetchProjects(slug)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, refreshToken])

  if (isLoading && projects.length === 0) return <CardSkeleton />
  if (error && projects.length === 0) return <CardError onRetry={() => void fetchProjects(slug)} />
  if (projects.length === 0) return <CardEmpty message="No operations yet" />

  const health = healthCounts(projects)
  const atRisk = health.atRisk + health.critical
  const activeOps = projects.filter((p) => p.status === "ACTIVE").length
  const openIssues = projects.reduce((s, p) => s + p.openIssues, 0)

  return (
    <div className="flex h-full flex-col justify-between gap-3 p-4">
      <div className="grid grid-cols-3 gap-2">
        <MiniMetric label="Actives" value={`${activeOps}/${projects.length}`} />
        <MiniMetric label="Ouvertes" value={String(openIssues)} />
        <MiniMetric
          label="À risque"
          value={String(atRisk)}
          valueClassName={atRisk > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Operations health</span>
          <span className="tabular-nums">
            {health.healthy} sain · {atRisk} à risque · {health.paused} en pause
          </span>
        </div>
        {/* Empilement sémantique : les couleurs de statut restent vert/orange/rouge. */}
        <SegmentBar
          segments={[
            { value: health.healthy, className: "bg-emerald-500" },
            { value: health.atRisk, className: "bg-amber-500" },
            { value: health.critical, className: "bg-rose-500" },
            { value: health.paused, className: "bg-muted-foreground/40" },
          ]}
        />
      </div>
    </div>
  )
}

function MiniMetric({
  label,
  value,
  valueClassName,
}: {
  readonly label: string
  readonly value: string
  readonly valueClassName?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-semibold tabular-nums tracking-tight", valueClassName)}>{value}</span>
    </div>
  )
}
