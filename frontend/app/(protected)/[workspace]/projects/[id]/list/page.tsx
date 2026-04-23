"use client"

import { useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import {
  Circle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ChevronDown,
  Plus,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useIssueStore } from "@/lib/store/issue-store"
import { CreateIssueDialog } from "@/components/dialogs/create-issue-dialog"
import type { Issue, IssueStatus, IssueStatusCategory } from "@/lib/api/issue-service"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type IssuePriority = "URGENT" | "HIGH" | "MEDIUM" | "LOW" | "NONE"

const PRIORITY_DOT: Record<IssuePriority, string> = {
  URGENT: "bg-red-400",
  HIGH:   "bg-orange-400",
  MEDIUM: "bg-yellow-400",
  LOW:    "bg-slate-400",
  NONE:   "bg-muted-foreground/30",
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
]

function getMemberColor(userId: number): string {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length]
}

function getMemberInitials(displayName: string | null, email: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return ((parts[0][0] ?? "") + (parts.at(-1)![0] ?? "")).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function getCategoryIcon(category: IssueStatusCategory, color: string) {
  switch (category) {
    case "BACKLOG":   return <Circle       className="size-3.5" style={{ color }} />
    case "UNSTARTED": return <Circle       className="size-3.5" style={{ color }} />
    case "STARTED":   return <RefreshCw   className="size-3.5" style={{ color }} />
    case "COMPLETED": return <CheckCircle2 className="size-3.5" style={{ color }} />
    case "CANCELLED": return <XCircle     className="size-3.5" style={{ color }} />
  }
}

function extractParam(p: string | string[] | undefined): string {
  if (typeof p === "string") return p
  if (Array.isArray(p)) return p[0] ?? ""
  return ""
}

// ---------------------------------------------------------------------------
// IssueRow
// ---------------------------------------------------------------------------

function IssueRow({ issue }: { readonly issue: Issue }) {
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0">
      <div className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority as IssuePriority] ?? "bg-muted-foreground/30")} />
      <div className="shrink-0">{getCategoryIcon(issue.status.category, issue.status.color)}</div>
      <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">{issue.identifier}</span>
      <span className="flex-1 text-sm text-foreground truncate group-hover:text-primary transition-colors">{issue.title}</span>
      <div className="hidden md:flex gap-1 w-36 justify-end shrink-0">
        {issue.labels.slice(0, 2).map((l) => (
          <Badge
            key={l.id}
            variant="secondary"
            className="text-[10px] px-1.5 h-4 bg-muted/60 border-0 font-normal"
            style={{ color: l.color }}
          >
            <span className="size-1.5 rounded-full mr-1 inline-block" style={{ backgroundColor: l.color }} />
            {l.name}
          </Badge>
        ))}
      </div>
      <span className="hidden md:block text-xs text-muted-foreground w-20 text-right shrink-0">
        {issue.dueDate ? new Date(issue.dueDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—"}
      </span>
      <div className="hidden lg:flex items-center justify-center w-8 shrink-0">
        {issue.assignee && (
          <Avatar className="h-5 w-5">
            {issue.assignee.avatarUrl && <AvatarImage src={issue.assignee.avatarUrl} />}
            <AvatarFallback className={cn("text-[9px] text-white", getMemberColor(Number(issue.assignee.id)))}>
              {getMemberInitials(issue.assignee.displayName, issue.assignee.email)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatusGroup
// ---------------------------------------------------------------------------

function StatusGroup({
  status,
  issues,
  workspaceSlug,
  projectId,
}: {
  readonly status: IssueStatus
  readonly issues: Issue[]
  readonly workspaceSlug: string
  readonly projectId: number
}) {
  return (
    <div>
      {/* Group header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/10 border-b border-border/50 sticky top-0 z-10">
        <ChevronDown className="size-3.5 text-muted-foreground" />
        {getCategoryIcon(status.category, status.color)}
        <span className="text-xs font-medium" style={{ color: status.color }}>{status.name}</span>
        <span className="text-xs text-muted-foreground ml-1">{issues.length}</span>
      </div>

      {issues.map((issue) => (
        <IssueRow key={issue.id} issue={issue} />
      ))}

      {/* Add issue in this group */}
      <CreateIssueDialog projectId={projectId} workspaceSlug={workspaceSlug} defaultStatusId={status.id}>
        <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:bg-muted/20 transition-colors cursor-pointer border-b border-border/50">
          <Plus className="h-3.5 w-3.5" />
          <span className="text-xs">Add issue</span>
        </div>
      </CreateIssueDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------

export default function ProjectListPage() {
  const params = useParams()
  const workspace = extractParam(params.workspace)
  const projectId = Number(extractParam(params.id))

  const { issues, statuses, isLoading, fetchIssues, fetchStatuses } = useIssueStore()

  useEffect(() => {
    if (!workspace || !projectId) return
    if (statuses.length === 0) fetchStatuses(workspace, projectId)
    fetchIssues(workspace, projectId)
  }, [workspace, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.position - b.position),
    [statuses]
  )

  const issuesByStatus = useMemo(() => {
    const map = new Map<number, Issue[]>()
    for (const s of statuses) map.set(s.id, [])
    for (const issue of issues) {
      const col = map.get(issue.status.id)
      if (col) col.push(issue)
    }
    return map
  }, [issues, statuses])

  if (isLoading && statuses.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/20 text-xs text-muted-foreground">
        <div className="w-2 shrink-0" />
        <div className="w-3.5 shrink-0" />
        <div className="w-14 shrink-0">ID</div>
        <div className="flex-1">Title</div>
        <div className="hidden md:block w-36 text-right">Labels</div>
        <div className="hidden md:block w-20 text-right">Due</div>
        <div className="hidden lg:block w-8" />
        <div className="w-3.5 shrink-0" />
      </div>

      {sortedStatuses.map((status) => {
        const groupIssues = issuesByStatus.get(status.id) ?? []
        return (
          <StatusGroup
            key={status.id}
            status={status}
            issues={groupIssues}
            workspaceSlug={workspace}
            projectId={projectId}
          />
        )
      })}
    </div>
  )
}