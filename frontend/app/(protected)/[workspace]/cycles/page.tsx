"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import {
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  CalendarRange,
  MoreHorizontal,
  Play,
  BarChart3,
  CircleDot,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { CreateCycleDialog } from "@/components/dialogs/create-cycle-dialog"
import { useCycleStore } from "@/lib/store/cycle-store"
import { useProjectStore } from "@/lib/store/project-store"
import type { CycleStatus as ApiCycleStatus } from "@/lib/api/cycle-service"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type CycleStatus = "active" | "upcoming" | "completed"

interface CycleIssueStats {
  total: number
  done: number
  inProgress: number
  todo: number
  cancelled: number
}

interface Cycle {
  id: string
  name: string
  description: string | null
  project: { id: string; name: string; emoji: string; color: string }
  status: CycleStatus
  startDate: string
  endDate: string
  issues: CycleIssueStats
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
  "bg-slate-500", "bg-orange-500", "bg-pink-500", "bg-cyan-500",
]

function projectColor(id: number): string {
  return PROJECT_COLORS[id % PROJECT_COLORS.length]
}

const API_STATUS_MAP: Record<ApiCycleStatus, CycleStatus> = {
  ACTIVE:    "active",
  DRAFT:     "upcoming",
  COMPLETED: "completed",
}
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function progress(stats: CycleIssueStats): number {
  if (stats.total === 0) return 0
  return Math.round((stats.done / stats.total) * 100)
}

function daysLeft(endDate: string): number {
  const diff = new Date(endDate).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ─────────────────────────────────────────────────────────────────────────────
// CycleCard
// ─────────────────────────────────────────────────────────────────────────────

function CycleCard({ cycle, slug, reload }: Readonly<{ cycle: Cycle; slug: string; reload: () => void | Promise<void> }>) {
  const pct  = progress(cycle.issues)
  const left = daysLeft(cycle.endDate)
  const router = useRouter()
  const { deleteCycle, updateCycle } = useCycleStore()
  const [busy, setBusy] = useState(false)

  const projectId = Number.parseInt(cycle.project.id, 10)
  const cycleId   = Number.parseInt(cycle.id, 10)

  async function handleDelete() {
    await deleteCycle(slug, projectId, cycleId)
    await reload() // la page tient un état local → sans ça, la carte supprimée restait à l'écran
  }

  /**
   * Transition de statut — le chaînon UI qui manquait (C2). `updateCycle` existait dans le store et
   * n'avait AUCUN appelant : un cycle naissait `DRAFT` et y restait, donc `ACTIVE`/`COMPLETED` étaient
   * inatteignables depuis le produit (burndown vide, KPI à 0, sections Active/Completed désertes). Le
   * backend, lui, gère déjà tout : validation, push Slack ET l'event Brain OS à la clôture (garde « une
   * seule fois »). Passer un cycle à COMPLETED depuis l'UI déclenche donc enfin la rétro (TF-BRAIN-INGEST).
   */
  async function handleTransition(next: ApiCycleStatus) {
    setBusy(true)
    try {
      const updated = await updateCycle(slug, projectId, cycleId, { status: next })
      if (updated) await reload() // reclasse la carte dans la bonne section (Active/Upcoming/Completed)
    } finally {
      setBusy(false)
    }
  }

  function handleViewIssues() {
    router.push(`/${slug}/projects/${cycle.project.id}/issues`)
  }

  function statusLabel(): string {
    if (cycle.status === "active")   return "Active"
    if (cycle.status === "upcoming") return "Upcoming"
    return "Completed"
  }

  function daysLeftColor(): string {
    if (left <= 2) return "text-red-400"
    if (left <= 5) return "text-amber-400"
    return "text-muted-foreground"
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)] flex flex-col gap-4 hover:border-border/80 transition-colors">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Status icon */}
          <div className={cn(
            "mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
            cycle.status === "active"    && "bg-emerald-500/10",
            cycle.status === "upcoming"  && "bg-blue-500/10",
            cycle.status === "completed" && "bg-muted",
          )}>
            {cycle.status === "active"    && <Play        className="h-4 w-4 text-emerald-400" />}
            {cycle.status === "upcoming"  && <Clock       className="h-4 w-4 text-blue-400"    />}
            {cycle.status === "completed" && <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground truncate">{cycle.name}</h3>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0 h-4 border font-medium",
                  cycle.status === "active"    && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                  cycle.status === "upcoming"  && "border-blue-500/30 bg-blue-500/10 text-blue-400",
                  cycle.status === "completed" && "border-border bg-muted/50 text-muted-foreground",
                )}
              >
                {statusLabel()}
              </Badge>
            </div>
            {cycle.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{cycle.description}</p>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Actions" className="h-7 w-7 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2" onClick={handleViewIssues}><BarChart3 className="h-4 w-4" />Voir les issues</DropdownMenuItem>
            {/* Transitions contextuelles — remplacent le « Edit cycle » qui n'avait aucun onClick. */}
            {cycle.status === "upcoming" && (
              <DropdownMenuItem className="gap-2" disabled={busy} onClick={() => handleTransition("ACTIVE")}>
                <Play className="h-4 w-4 text-emerald-400" />Démarrer le cycle
              </DropdownMenuItem>
            )}
            {cycle.status === "active" && (
              <DropdownMenuItem className="gap-2" disabled={busy} onClick={() => handleTransition("COMPLETED")}>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />Terminer le cycle
              </DropdownMenuItem>
            )}
            {cycle.status === "completed" && (
              <DropdownMenuItem className="gap-2" disabled={busy} onClick={() => handleTransition("ACTIVE")}>
                <Play className="h-4 w-4 text-blue-400" />Rouvrir le cycle
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete}>Supprimer</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Project tag */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{cycle.project.emoji}</span>
        <span className="text-xs text-muted-foreground">{cycle.project.name}</span>
      </div>

      {/* Progress */}
      {cycle.issues.total > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {cycle.issues.done}/{cycle.issues.total} issues
            </span>
            <span className="text-xs font-semibold text-foreground">{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />

          {/* Mini breakdown */}
          <div className="flex items-center gap-3 mt-0.5">
            {cycle.issues.inProgress > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-blue-400">
                <RefreshCw className="h-3 w-3" />{cycle.issues.inProgress}
              </span>
            )}
            {cycle.issues.todo > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <CircleDot className="h-3 w-3" />{cycle.issues.todo}
              </span>
            )}
            {cycle.issues.cancelled > 0 && (
              <span className="text-[10px] text-muted-foreground/50">{cycle.issues.cancelled} cancelled</span>
            )}
          </div>
        </div>
      )}

      {/* Dates */}
      <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-auto">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          {formatDate(cycle.startDate)} – {formatDate(cycle.endDate)}
        </div>
        {cycle.status === "active" && (
          <span className={cn(
            "text-xs font-medium",
            daysLeftColor()
          )}>
            {left <= 0 ? "Overdue" : `${left}d left`}
          </span>
        )}
        {cycle.status === "upcoming" && (
          <span className="text-xs text-muted-foreground">
            Starts in {daysLeft(cycle.startDate)}d
          </span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section
// ─────────────────────────────────────────────────────────────────────────────

function CycleSection({ title, cycles, defaultOpen = true, slug, reload }: Readonly<{
  title: string
  cycles: Cycle[]
  defaultOpen?: boolean
  slug: string
  reload: () => void | Promise<void>
}>) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-foreground w-fit"
      >
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        {title}
        <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-semibold">
          {cycles.length}
        </Badge>
      </button>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cycles.map((cycle) => <CycleCard key={cycle.id} cycle={cycle} slug={slug} reload={reload} />)}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function mapApiCyclesToLocal(
  results: import("@/lib/api/cycle-service").Cycle[][],
  projs: import("@/lib/api/project-service").Project[]
): Cycle[] {
  return results.flatMap((apiCycles, idx) => {
    const proj = projs[idx]
    return apiCycles.map((c) => ({
      id:          String(c.id),
      name:        c.name,
      description: c.description,
      project: {
        id:    String(proj.id),
        name:  proj.name,
        emoji: proj.identifier.slice(0, 2),
        color: projectColor(proj.id),
      },
      status:    API_STATUS_MAP[c.status],
      startDate: c.startDate ?? "",
      endDate:   c.endDate ?? "",
      issues: {
        total:      c.issueCount,
        done:       0,
        inProgress: 0,
        todo:       c.issueCount,
        cancelled:  0,
      },
    }))
  })
}

export default function CyclesPage() {
  const params = useParams()
  const slug   = typeof params?.workspace === "string" ? params.workspace : ""

  const { fetchProjects } = useProjectStore()
  const { fetchCycles, isLoading }  = useCycleStore()

  const [cycles, setCycles] = useState<Cycle[]>([])

  // Extrait en callback pour être rejoué après une transition/suppression : la page tient son PROPRE
  // état local (mappé depuis l'API), distinct du store — muter le store ne la rafraîchit donc pas.
  const reload = useCallback(async () => {
    if (!slug) return
    const projs = await fetchProjects(slug)
    const results = await Promise.all(projs.map((p) => fetchCycles(slug, p.id)))
    setCycles(mapApiCyclesToLocal(results, projs))
  }, [slug, fetchProjects, fetchCycles])

  useEffect(() => {
    void reload()
  }, [reload])

  const active    = cycles.filter((c) => c.status === "active")
  const upcoming  = cycles.filter((c) => c.status === "upcoming")
  const completed = cycles.filter((c) => c.status === "completed")

  return (
    <div className="flex flex-col gap-8 w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cycles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? "Loading…" : `${active.length} active · ${upcoming.length} upcoming · ${completed.length} completed`}
          </p>
        </div>
        <CreateCycleDialog>
          <Button size="sm" className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            New cycle
          </Button>
        </CreateCycleDialog>
      </div>

      {/* Active cycles */}
      {active.length > 0 && (
        <CycleSection title="Active" cycles={active} defaultOpen slug={slug} reload={reload} />
      )}

      {/* Upcoming cycles */}
      {upcoming.length > 0 && (
        <CycleSection title="Upcoming" cycles={upcoming} defaultOpen slug={slug} reload={reload} />
      )}

      {/* Completed cycles */}
      {completed.length > 0 && (
        <CycleSection title="Completed" cycles={completed} defaultOpen={false} slug={slug} reload={reload} />
      )}

      {/* Empty state */}
      {!isLoading && cycles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <RefreshCw className="h-10 w-10 text-muted-foreground/30 mb-4" />
          <p className="text-base font-medium text-foreground">No cycles yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create a cycle to track a sprint or milestone.</p>
          <CreateCycleDialog>
            <Button size="sm" className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              New cycle
            </Button>
          </CreateCycleDialog>
        </div>
      )}
    </div>
  )
}
