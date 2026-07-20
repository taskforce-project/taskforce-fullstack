"use client"

import { useEffect } from "react"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"

import { useProjectStore } from "@/lib/store/project-store"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { DashboardCardBodyProps } from "../card-registry"
import { healthOf } from "../health"
import { CardError, CardSkeleton } from "../card-states"

const MAX_ROWS = 5

/** Opérations à risque ou critiques — données réelles du store projets. */
export function NeedsAttentionCard({ slug, refreshToken }: DashboardCardBodyProps) {
  const projects = useProjectStore((s) => s.projects)
  const isLoading = useProjectStore((s) => s.isLoading)
  const error = useProjectStore((s) => s.error)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)

  useEffect(() => {
    // Garde anti-doublon : le store est partagé entre cartes — un seul GET par refresh global.
    if (slug && refreshToken > 0 && !useProjectStore.getState().isLoading) void fetchProjects(slug)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, refreshToken])

  if (isLoading && projects.length === 0) return <CardSkeleton />
  if (error && projects.length === 0) return <CardError onRetry={() => void fetchProjects(slug)} />

  // Critiques d'abord, puis à risque — les plus urgentes en tête.
  const flagged = projects
    .filter((p) => {
      const h = healthOf(p)
      return h === "atRisk" || h === "critical"
    })
    .sort((a, b) => (healthOf(b) === "critical" ? 1 : 0) - (healthOf(a) === "critical" ? 1 : 0))

  if (flagged.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-4 text-center">
        <CheckCircle2 className="size-5 text-emerald-500" />
        <p className="text-sm font-medium text-muted-foreground">Rien à signaler</p>
        <p className="text-xs text-muted-foreground/70">Toutes les opérations sont saines.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {flagged.slice(0, MAX_ROWS).map((p) => (
        <Link
          key={p.id}
          href={`./projects/${p.id}`}
          className="flex items-center gap-3 border-b border-border px-4 py-2.5 transition-colors last:border-0 hover:bg-muted/50"
        >
          <span className={cn("size-2 shrink-0 rounded-full", healthOf(p) === "critical" ? "bg-rose-500" : "bg-amber-500")} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{p.name}</span>
          <Badge variant="secondary" className="shrink-0 font-normal text-muted-foreground">
            {p.openIssues} ouvertes
          </Badge>
        </Link>
      ))}
      {flagged.length > MAX_ROWS && (
        <Link href="./projects" className="px-4 py-2 text-[11px] text-muted-foreground hover:text-foreground">
          +{flagged.length - MAX_ROWS} autres opérations
        </Link>
      )}
    </div>
  )
}
