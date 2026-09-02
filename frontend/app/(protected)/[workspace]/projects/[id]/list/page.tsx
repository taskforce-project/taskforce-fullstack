"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import {
  Circle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { cn } from "@/lib/utils"
import { useIssueStore } from "@/lib/store/issue-store"
import { IssueSheet, type SheetIssue } from "@/components/sheets/issue-sheet"
import { InlineIssueFilters } from "@/components/issues/issue-filters"
import { Skeleton } from "@/components/ui/skeleton"
import { type IssueFilterState, EMPTY_ISSUE_FILTERS, applyIssueFilters } from "@/lib/issue-filters"
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
// toSheetIssue
// ---------------------------------------------------------------------------

function toSheetIssue(issue: Issue): SheetIssue {
  return {
    id:             String(issue.id),
    identifier:     issue.identifier,
    title:          issue.title,
    description:    issue.description ?? undefined,
    priority:       issue.priority as SheetIssue["priority"],
    statusId:       issue.status.id,
    statusName:     issue.status.name,
    statusCategory: issue.status.category,
    assignee:       issue.assignee
      ? { initials: issue.assignee.email.slice(0, 2).toUpperCase(), color: AVATAR_COLORS[issue.assignee.id % AVATAR_COLORS.length], name: issue.assignee.displayName ?? issue.assignee.email, email: issue.assignee.email, userId: issue.assignee.id }
      : null,
    assigneeId:     issue.assignee?.id ?? null,
    labels:         issue.labels,
    pinned:         issue.pinned,
    archived:       issue.archived,
    dueDate:        issue.dueDate,
    storyPoints:    null,
    createdAt:      issue.createdAt,
  }
}

// ---------------------------------------------------------------------------
// IssueRow
// ---------------------------------------------------------------------------

function IssueRow({ issue, onOpen, onToggleDone }: { readonly issue: Issue; readonly onOpen: (issue: Issue) => void; readonly onToggleDone: (issue: Issue) => void }) {
  const isDone = issue.status.category === "COMPLETED"
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(issue)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(issue)}
      className="group flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0 text-left"
    >
      <div className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority as IssuePriority] ?? "bg-muted-foreground/30")} />
      {/* Icône cliquable → marque la tâche terminée (QA3-9) */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleDone(issue) }}
        title={isDone ? "Rouvrir la tâche" : "Marquer comme terminée"}
        className={cn("shrink-0 rounded transition-colors", isDone ? "text-emerald-500" : "text-muted-foreground hover:text-emerald-500")}
      >
        {isDone ? <CheckCircle2 className="size-3.5" /> : getCategoryIcon(issue.status.category, issue.status.color)}
      </button>
      <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">{issue.identifier}</span>
      <span className={cn("flex-1 text-sm truncate transition-colors group-hover:text-primary", isDone ? "text-muted-foreground line-through" : "text-foreground")}>{issue.title}</span>
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
        {issue.dueDate ? new Date(issue.dueDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "-"}
      </span>
      <div className="hidden lg:flex items-center justify-center w-8 shrink-0">
        {issue.assignee && (
          <UserAvatar
            email={issue.assignee.email}
            name={issue.assignee.displayName ?? issue.assignee.email}
            avatarUrl={issue.assignee.avatarUrl}
            className="h-5 w-5"
            fallbackClassName="text-[9px]"
          />
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
  onOpenIssue,
  onToggleDone,
}: {
  readonly status: IssueStatus
  readonly issues: Issue[]
  readonly onOpenIssue: (issue: Issue) => void
  readonly onToggleDone: (issue: Issue) => void
}) {
  // QA: groupes repliables (Backlog & co.)
  const [open, setOpen] = useState(true)
  return (
    <div>
      {/* Group header - cliquable pour replier/déplier */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2 bg-muted border-b border-border/50 sticky top-9 z-10 text-left hover:bg-muted/80 transition-colors"
      >
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        {getCategoryIcon(status.category, status.color)}
        <span className="text-xs font-medium" style={{ color: status.color }}>{status.name}</span>
        <span className="text-xs text-muted-foreground ml-1">{issues.length}</span>
      </button>

      {open && issues.map((issue) => (
        <IssueRow key={issue.id} issue={issue} onOpen={onOpenIssue} onToggleDone={onToggleDone} />
      ))}
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

  const { issues, statuses, isLoading, fetchIssues, fetchStatuses, updateIssue } = useIssueStore()
  const [selectedIssue, setSelectedIssue] = useState<SheetIssue | null>(null)
  const [filters, setFilters] = useState<IssueFilterState>(EMPTY_ISSUE_FILTERS)

  // QA3-9 : clic sur l'icône → bascule terminé / rouvert
  async function handleToggleDone(issue: Issue) {
    const done   = statuses.find((s) => s.category === "COMPLETED")
    const reopen = statuses.find((s) => s.isDefault)
      ?? statuses.find((s) => s.category === "UNSTARTED")
      ?? statuses.find((s) => s.category === "BACKLOG")
    const target = issue.status.category === "COMPLETED" ? reopen : done
    if (target && target.id !== issue.status.id) {
      // Succès muet : la ligne bascule (barré / coché). On ne signale que l'échec (updateIssue → null).
      const ok = await updateIssue(workspace, projectId, issue.id, { statusId: target.id })
      if (!ok) toast.error("Couldn't update status")
    }
  }

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
    for (const issue of applyIssueFilters(issues, filters)) {
      const col = map.get(issue.status.id)
      if (col) col.push(issue)
    }
    return map
  }, [issues, statuses, filters])

  if (isLoading && statuses.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-20" />
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0">
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="size-3.5 rounded-full" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 flex-1 max-w-md" />
              <Skeleton className="ml-auto size-5 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Filtres en ligne - restent fixes pendant le scroll (QA2-30) */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <InlineIssueFilters issues={issues} value={filters} onChange={setFilters} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)]">
      {/* Header row - sticky en haut du scroll */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card text-xs text-muted-foreground">
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
            onOpenIssue={(issue) => setSelectedIssue(toSheetIssue(issue))}
            onToggleDone={handleToggleDone}
          />
        )
      })}

      <IssueSheet
        issue={selectedIssue}
        open={selectedIssue !== null}
        onOpenChange={(open) => { if (!open) setSelectedIssue(null) }}
        workspaceSlug={workspace}
        projectId={projectId}
      />
      </div>
    </div>
  )
}