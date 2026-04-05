"use client"

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
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

type CycleStatus = "active" | "upcoming" | "completed"
type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"

interface CycleIssue {
  id: string
  identifier: string
  title: string
  status: "todo" | "in_progress" | "in_review" | "done"
  priority: IssuePriority
  assignee: { initials: string; color: string } | null
}

interface ProjectCycle {
  id: string
  title: string
  status: CycleStatus
  progress: number
  totalIssues: number
  completedIssues: number
  startDate: string
  endDate: string
  daysLeft: number | null
  issues: CycleIssue[]
}

const CYCLES: Record<string, ProjectCycle> = {
  "1": {
    id: "1",
    title: "Sprint 4 — Mobile hardening",
    status: "active",
    progress: 62,
    totalIssues: 14,
    completedIssues: 9,
    startDate: "Mar 24",
    endDate: "Apr 4",
    daysLeft: 6,
    issues: [
      { id: "i1", identifier: "TF-28", title: "Fix login screen crash on iOS 17", status: "done", priority: "urgent", assignee: { initials: "ME", color: "bg-primary" } },
      { id: "i2", identifier: "TF-29", title: "Implement dark mode toggle", status: "in_progress", priority: "low", assignee: { initials: "ME", color: "bg-primary" } },
      { id: "i3", identifier: "TF-32", title: "Responsive navigation redesign", status: "in_progress", priority: "high", assignee: { initials: "SM", color: "bg-violet-500" } },
      { id: "i4", identifier: "TF-35", title: "Optimize image loading for mobile", status: "done", priority: "medium", assignee: { initials: "EP", color: "bg-emerald-500" } },
      { id: "i5", identifier: "TF-38", title: "SEO meta tags refactor", status: "in_review", priority: "medium", assignee: { initials: "EP", color: "bg-emerald-500" } },
      { id: "i6", identifier: "TF-41", title: "Update hero section copy", status: "todo", priority: "high", assignee: { initials: "ME", color: "bg-primary" } },
      { id: "i7", identifier: "TF-44", title: "Add social proof section with testimonials", status: "todo", priority: "medium", assignee: null },
    ],
  },
  "2": {
    id: "2",
    title: "Sprint 5 — Onboarding flow",
    status: "upcoming",
    progress: 0,
    totalIssues: 0,
    completedIssues: 0,
    startDate: "Apr 7",
    endDate: "Apr 18",
    daysLeft: null,
    issues: [],
  },
  "3": {
    id: "3",
    title: "Sprint 3 — Auth foundations",
    status: "completed",
    progress: 100,
    totalIssues: 11,
    completedIssues: 11,
    startDate: "Mar 10",
    endDate: "Mar 21",
    daysLeft: null,
    issues: [
      { id: "j1", identifier: "TF-14", title: "Implement JWT refresh token flow", status: "done", priority: "urgent", assignee: { initials: "TB", color: "bg-orange-500" } },
      { id: "j2", identifier: "TF-16", title: "Set up OAuth2 with Keycloak", status: "done", priority: "high", assignee: { initials: "TB", color: "bg-orange-500" } },
      { id: "j3", identifier: "TF-18", title: "Add 2FA support", status: "done", priority: "high", assignee: { initials: "ME", color: "bg-primary" } },
      { id: "j4", identifier: "TF-19", title: "Password reset email flow", status: "done", priority: "medium", assignee: { initials: "EP", color: "bg-emerald-500" } },
    ],
  },
}

const CYCLE_STATUS_CONFIG: Record<CycleStatus, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  active:    { label: "Active",    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", icon: <RefreshCw className="h-3.5 w-3.5 text-emerald-400" /> },
  upcoming:  { label: "Upcoming",  badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/20",         icon: <Clock className="h-3.5 w-3.5 text-blue-400" /> },
  completed: { label: "Completed", badgeClass: "bg-muted text-muted-foreground border-border",             icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> },
}

const ISSUE_STATUS_CONFIG = {
  todo:        { label: "To Do",      icon: <CircleDot className="h-3.5 w-3.5 text-muted-foreground" /> },
  in_progress: { label: "In Progress", icon: <RefreshCw className="h-3.5 w-3.5 text-blue-400" /> },
  in_review:   { label: "In Review",  icon: <Clock className="h-3.5 w-3.5 text-yellow-400" /> },
  done:        { label: "Done",       icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> },
}

const PRIORITY_DOT: Record<IssuePriority, string> = {
  urgent: "bg-red-400",
  high:   "bg-orange-400",
  medium: "bg-yellow-400",
  low:    "bg-slate-400",
  none:   "bg-muted-foreground/30",
}

export default function CycleDetailPage() {
  const params = useParams()
  const projectId = typeof params.id === "string" ? params.id : "1"
  const cycleId   = typeof params.cycleId === "string" ? params.cycleId : "1"

  const cycle = CYCLES[cycleId]

  if (!cycle) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
        <p className="text-sm">Cycle introuvable</p>
        <Link href={`/projects/${projectId}/cycles`}>
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to cycles
          </Button>
        </Link>
      </div>
    )
  }

  const cfg = CYCLE_STATUS_CONFIG[cycle.status]

  const issueGroups = {
    todo:        cycle.issues.filter((i) => i.status === "todo"),
    in_progress: cycle.issues.filter((i) => i.status === "in_progress"),
    in_review:   cycle.issues.filter((i) => i.status === "in_review"),
    done:        cycle.issues.filter((i) => i.status === "done"),
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Back nav */}
      <Link
        href={`/projects/${projectId}/cycles`}
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
              <h1 className="text-lg font-semibold text-foreground">{cycle.title}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <Badge variant="outline" className={cn("text-xs border px-1.5 py-0", cfg.badgeClass)}>
                  {cfg.label}
                </Badge>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {cycle.startDate} → {cycle.endDate}
                  {cycle.daysLeft !== null && (
                    <span className="text-amber-400 font-medium">{cycle.daysLeft}d left</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {cycle.status !== "upcoming" && (
            <div className="flex items-center gap-4 rounded-lg bg-muted/30 px-4 py-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground tabular-nums">{cycle.progress}%</p>
                <p className="text-xs text-muted-foreground">Complete</p>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground tabular-nums">{cycle.completedIssues}/{cycle.totalIssues}</p>
                  <p className="text-xs text-muted-foreground">Issues done</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {cycle.status !== "upcoming" && cycle.totalIssues > 0 && (
          <div className="mt-4">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", cycle.progress === 100 ? "bg-emerald-500" : "bg-primary")}
                style={{ width: `${cycle.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Issues */}
      {cycle.issues.length === 0 ? (
        <div className="rounded-xl border border-border border-dashed bg-card p-12 text-center text-muted-foreground text-sm">
          No issues in this cycle yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {(["in_progress", "in_review", "todo", "done"] as const).map((statusKey) => {
            const group = issueGroups[statusKey]
            if (group.length === 0) return null
            const statusCfg = ISSUE_STATUS_CONFIG[statusKey]
            return (
              <div key={statusKey} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {statusCfg.icon}
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{statusCfg.label}</span>
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{group.length}</Badge>
                </div>
                <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
                  {group.map((issue, i) => (
                    <div
                      key={issue.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors",
                        i < group.length - 1 && "border-b border-border/50"
                      )}
                    >
                      <div className={cn("size-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />
                      <span className="text-xs text-muted-foreground font-mono shrink-0">{issue.identifier}</span>
                      <span className="text-sm text-foreground flex-1 min-w-0 truncate">{issue.title}</span>
                      {issue.assignee && (
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarFallback className={cn("text-[9px] text-white", issue.assignee.color)}>
                            {issue.assignee.initials}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
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
