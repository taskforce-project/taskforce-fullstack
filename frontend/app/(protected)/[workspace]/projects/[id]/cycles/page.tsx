"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  RefreshCw,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { CreateCycleDialog } from "@/components/dialogs/create-cycle-dialog"
import { cn } from "@/lib/utils"
import { useCycleStore } from "@/lib/store/cycle-store"
import type { Cycle, CycleStatus } from "@/lib/api/cycle-service"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CYCLE_STATUS_CONFIG: Record<CycleStatus, { badgeClass: string; label: string; icon: React.ReactNode }> = {
  ACTIVE:    { badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", label: "Active",    icon: <RefreshCw className="h-3.5 w-3.5 text-emerald-400" /> },
  DRAFT:     { badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/20",         label: "Draft",     icon: <Clock className="h-3.5 w-3.5 text-blue-400" /> },
  COMPLETED: { badgeClass: "bg-muted text-muted-foreground border-border",             label: "Completed", icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> },
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch {
    return iso
  }
}

function daysLeft(endDate: string | null | undefined): number | null {
  if (!endDate) return null
  const diff = new Date(endDate).getTime() - Date.now()
  return diff > 0 ? Math.ceil(diff / 86400000) : null
}

// ---------------------------------------------------------------------------
// CycleCard
// ---------------------------------------------------------------------------

function CycleCard({ cycle, href }: { readonly cycle: Cycle; readonly href: string }) {
  const cfg  = CYCLE_STATUS_CONFIG[cycle.status]
  const left = daysLeft(cycle.endDate)

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 hover:border-primary/40 transition-all shadow-sm hover:shadow-md"
    >
      <div className="shrink-0">{cfg.icon}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
            {cycle.name}
          </span>
          <Badge variant="outline" className={cn("text-xs border px-1.5 py-0", cfg.badgeClass)}>
            {cfg.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDate(cycle.startDate)} → {formatDate(cycle.endDate)}
          {left !== null && <span className="ml-2 text-amber-400">{left}d left</span>}
        </p>
      </div>

      {cycle.issueCount > 0 ? (
        <span className="text-xs text-muted-foreground hidden md:block shrink-0">
          {cycle.issueCount} issue{cycle.issueCount !== 1 ? "s" : ""}
        </span>
      ) : (
        <span className="text-xs text-amber-400/80 hidden md:block shrink-0">Aucune issue — à remplir</span>
      )}

      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectCyclesPage() {
  const params = useParams()

  const workspaceRaw = params.workspace
  let workspace = ""
  if (typeof workspaceRaw === "string") workspace = workspaceRaw
  else if (Array.isArray(workspaceRaw)) workspace = workspaceRaw[0] ?? ""

  const idRaw = params.id
  let projectId = 0
  if (typeof idRaw === "string") projectId = Number(idRaw)
  else if (Array.isArray(idRaw)) projectId = Number(idRaw[0] ?? "0")

  const { cycles, isLoading, error, fetchCycles } = useCycleStore()

  useEffect(() => {
    if (workspace && projectId) {
      fetchCycles(workspace, projectId)
    }
  }, [workspace, projectId, fetchCycles])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-1.5 w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Les <span className="font-medium text-foreground">cycles</span> (sprints) sont des itérations limitées dans le temps :
        regroupez-y des issues pour suivre la vélocité, la charge et les échéances de l&apos;équipe.
      </p>
      <div className="flex items-center justify-between">
        {error ? (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{cycles.length} cycle{cycles.length !== 1 ? "s" : ""}</p>
        )}
        <CreateCycleDialog projectId={projectId} onCreated={() => fetchCycles(workspace, projectId)}>
          <Button size="sm" className="gap-1.5 h-8 text-xs">
            <Plus className="h-3.5 w-3.5" />
            New Cycle
          </Button>
        </CreateCycleDialog>
      </div>

      {cycles.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><RefreshCw /></EmptyMedia>
            <EmptyTitle>Aucun cycle</EmptyTitle>
            <EmptyDescription>Créez un sprint pour planifier vos issues dans le temps.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CreateCycleDialog projectId={projectId} onCreated={() => fetchCycles(workspace, projectId)}>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                New Cycle
              </Button>
            </CreateCycleDialog>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {cycles.map((cycle) => (
            <CycleCard
              key={cycle.id}
              cycle={cycle}
              href={`/${workspace}/projects/${projectId}/cycles/${cycle.id}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
