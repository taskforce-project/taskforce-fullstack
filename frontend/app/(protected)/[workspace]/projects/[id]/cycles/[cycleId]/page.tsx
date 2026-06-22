"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  RefreshCw,
  Clock,
  CheckCircle2,
  CircleDot,
  TrendingUp,
  Calendar,
  Loader2,
  AlertCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { cn } from "@/lib/utils"
import { useCycleStore } from "@/lib/store/cycle-store"
import type { CycleStatus } from "@/lib/api/cycle-service"
import type { Issue, IssuePriority, IssueStatusCategory } from "@/lib/api/issue-service"
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CYCLE_STATUS_CONFIG: Record<CycleStatus, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  ACTIVE:    { label: "Active",    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", icon: <RefreshCw className="h-3.5 w-3.5 text-emerald-400" /> },
  DRAFT:     { label: "Draft",     badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/20",         icon: <Clock className="h-3.5 w-3.5 text-blue-400" /> },
  COMPLETED: { label: "Completed", badgeClass: "bg-muted text-muted-foreground border-border",             icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> },
}

const PRIORITY_DOT: Record<IssuePriority, string> = {
  URGENT: "bg-red-400",
  HIGH:   "bg-orange-400",
  MEDIUM: "bg-yellow-400",
  LOW:    "bg-slate-400",
  NONE:   "bg-muted-foreground/30",
}

function getCategoryIcon(category: IssueStatusCategory): React.ReactNode {
  switch (category) {
    case "STARTED":   return <RefreshCw className="h-3.5 w-3.5 text-blue-400" />
    case "COMPLETED": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
    default:          return <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

function getCategoryLabel(category: IssueStatusCategory): string {
  switch (category) {
    case "STARTED":   return "In Progress"
    case "COMPLETED": return "Done"
    case "CANCELLED": return "Cancelled"
    case "BACKLOG":   return "Backlog"
    default:          return "Todo"
  }
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
// IssueRow
// ---------------------------------------------------------------------------

function IssueRow({ issue }: { readonly issue: Issue }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/50 last:border-0">
      <div className={cn("size-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />
      {getCategoryIcon(issue.status.category)}
      <span className="text-xs text-muted-foreground font-mono shrink-0 w-16">{issue.identifier}</span>
      <span className="text-sm text-foreground flex-1 min-w-0 truncate">{issue.title}</span>
      {issue.assignee ? (
        <UserAvatar
          email={issue.assignee.email}
          name={issue.assignee.displayName ?? issue.assignee.email}
          avatarUrl={issue.assignee.avatarUrl}
          className="h-6 w-6 shrink-0"
          fallbackClassName="text-[9px]"
        />
      ) : (
        <div className="size-6 rounded-full border border-dashed border-border shrink-0" />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CycleDetailPage() {
  const params = useParams()

  const workspaceRaw = params.workspace
  let workspace = ""
  if (typeof workspaceRaw === "string") workspace = workspaceRaw
  else if (Array.isArray(workspaceRaw)) workspace = workspaceRaw[0] ?? ""

  const idRaw = params.id
  let projectId = 0
  if (typeof idRaw === "string") projectId = Number(idRaw)
  else if (Array.isArray(idRaw)) projectId = Number(idRaw[0] ?? "0")

  const cycleIdRaw = params.cycleId
  let cycleId = 0
  if (typeof cycleIdRaw === "string") cycleId = Number(cycleIdRaw)
  else if (Array.isArray(cycleIdRaw)) cycleId = Number(cycleIdRaw[0] ?? "0")

  const { activeCycle: cycle, cycleIssues: issues, isLoading, error, fetchCycle, fetchCycleIssues } = useCycleStore()

  useEffect(() => {
    if (workspace && projectId && cycleId) {
      fetchCycle(workspace, projectId, cycleId)
      fetchCycleIssues(workspace, projectId, cycleId)
    }
  }, [workspace, projectId, cycleId, fetchCycle, fetchCycleIssues])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading cycle…</span>
      </div>
    )
  }

  if (error || !cycle) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
        {error && <p className="flex items-center gap-1.5 text-sm text-destructive"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
        {!cycle && !error && <p className="text-sm">Cycle not found.</p>}
        <Link href={`/${workspace}/projects/${projectId}/cycles`}>
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to cycles
          </Button>
        </Link>
      </div>
    )
  }

  const cfg  = CYCLE_STATUS_CONFIG[cycle.status]
  const left = daysLeft(cycle.endDate)

  // Grouper les issues par catégorie de statut
  const ORDER: IssueStatusCategory[] = ["STARTED", "UNSTARTED", "BACKLOG", "COMPLETED", "CANCELLED"]
  const grouped = new Map<IssueStatusCategory, Issue[]>()
  for (const cat of ORDER) grouped.set(cat, [])
  for (const issue of issues) {
    grouped.get(issue.status.category)?.push(issue)
  }

  const completedCount = issues.filter((i) => i.status.category === "COMPLETED").length
  const totalCount     = issues.length
  const progress       = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Back nav */}
      <Link
        href={`/${workspace}/projects/${projectId}/cycles`}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All cycles
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {cfg.icon}
            <div>
              <h1 className="text-lg font-semibold text-foreground">{cycle.name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <Badge variant="outline" className={cn("text-xs border px-1.5 py-0", cfg.badgeClass)}>
                  {cfg.label}
                </Badge>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatDate(cycle.startDate)} → {formatDate(cycle.endDate)}
                  {left !== null && <span className="text-amber-400 font-medium ml-1">{left}d left</span>}
                </span>
              </div>
              {cycle.description && (
                <p className="mt-2 text-sm text-muted-foreground max-w-lg">{cycle.description}</p>
              )}
            </div>
          </div>

          {totalCount > 0 && (
            <div className="flex items-center gap-4 rounded-lg bg-muted/30 px-4 py-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground tabular-nums">{progress}%</p>
                <p className="text-xs text-muted-foreground">Complete</p>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground tabular-nums">{completedCount}/{totalCount}</p>
                  <p className="text-xs text-muted-foreground">Issues done</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {totalCount > 0 && (
          <div className="mt-4">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", progress === 100 ? "bg-emerald-500" : "bg-primary")}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Issues */}
      {issues.length === 0 ? (
        <div className="rounded-xl border border-border border-dashed bg-card p-12 text-center text-muted-foreground text-sm">
          No issues in this cycle yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {ORDER.map((cat) => {
            const group = grouped.get(cat) ?? []
            if (group.length === 0) return null
            return (
              <div key={cat} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {getCategoryIcon(cat)}
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {getCategoryLabel(cat)}
                  </span>
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{group.length}</Badge>
                </div>
                <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
                  {group.map((issue) => (
                    <IssueRow key={issue.id} issue={issue} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
