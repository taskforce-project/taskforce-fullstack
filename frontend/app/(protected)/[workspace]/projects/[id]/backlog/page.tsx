"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import {
  CircleDot,
  Plus,
  ArrowUpRight,
} from "lucide-react"

import { IssueSheet, type SheetIssue } from "@/components/sheets/issue-sheet"
import { CreateIssueDialog } from "@/components/dialogs/create-issue-dialog"
import { InlineIssueFilters } from "@/components/issues/issue-filters"
import { type IssueFilterState, EMPTY_ISSUE_FILTERS, applyIssueFilters } from "@/lib/issue-filters"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useIssueStore } from "@/lib/store/issue-store"
import type { Issue, IssuePriority } from "@/lib/api/issue-service"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRIORITY_DOT: Record<IssuePriority, string> = {
  URGENT: "bg-red-400",
  HIGH:   "bg-orange-400",
  MEDIUM: "bg-yellow-400",
  LOW:    "bg-slate-400",
  NONE:   "bg-muted-foreground/30",
}

const AVATAR_COLORS = ["bg-violet-500","bg-blue-500","bg-emerald-500","bg-orange-500","bg-pink-500","bg-cyan-500","bg-amber-500","bg-indigo-500"]

function emailInitials(email: string): string {
  return email.slice(0, 2).toUpperCase()
}

function assigneeColor(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}

function formatDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch { return iso }
}

function toSheetIssue(issue: Issue): SheetIssue {
  const priorityMap: Record<IssuePriority, SheetIssue["priority"]> = {
    NONE: "NONE", URGENT: "URGENT", HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW",
  }
  return {
    id:             String(issue.id),
    identifier:     issue.identifier,
    title:          issue.title,
    description:    issue.description ?? undefined,
    priority:       priorityMap[issue.priority],
    statusId:       issue.status.id,
    statusName:     issue.status.name,
    statusCategory: issue.status.category,
    assignee:       issue.assignee
      ? { initials: emailInitials(issue.assignee.email), color: assigneeColor(issue.assignee.id), name: issue.assignee.displayName ?? issue.assignee.email, email: issue.assignee.email, userId: issue.assignee.id }
      : null,
    assigneeId:     issue.assignee?.id ?? null,
    labels:         issue.labels,
    pinned:         issue.pinned,
    archived:       issue.archived,
    dueDate:        formatDate(issue.dueDate) ?? null,
    storyPoints:    null,
    createdAt:      formatDate(issue.createdAt) ?? issue.createdAt,
  }
}

/** Taille de page pour l'infinite-scroll du backlog (QA2-33). */
const PAGE_SIZE = 25

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectBacklogPage() {
  const params    = useParams()
  const workspace = typeof params.workspace === "string" ? params.workspace : ""
  const projectId = typeof params.id        === "string" ? Number(params.id)  : 0

  const { fetchIssues, issues, isLoading, statuses, fetchStatuses, updateIssue } = useIssueStore()
  const [selectedIssue, setSelectedIssue] = useState<SheetIssue | null>(null)
  const [filters, setFilters] = useState<IssueFilterState>(EMPTY_ISSUE_FILTERS)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!workspace || !projectId) return
    if (statuses.length === 0) fetchStatuses(workspace, projectId)
    fetchIssues(workspace, projectId)
  }, [workspace, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // QA3-9 : clic sur l'icône → marque la tâche terminée (sort du backlog)
  async function handleToggleDone(issue: Issue) {
    const done = statuses.find((s) => s.category === "COMPLETED")
    if (done) await updateIssue(workspace, projectId, issue.id, { statusId: done.id })
  }

  // Backlog = issues with BACKLOG status category (puis filtres avancés)
  const backlogIssues = applyIssueFilters(
    issues.filter((i) => i.status.category === "BACKLOG"),
    filters
  )
  const visibleIssues = backlogIssues.slice(0, visible)
  const hasMore = visible < backlogIssues.length

  // Infinite-scroll : révèle la page suivante quand le sentinel entre dans le viewport (QA2-33)
  useEffect(() => {
    if (!hasMore) return
    const node = sentinelRef.current
    if (!node) return
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setVisible((v) => v + PAGE_SIZE) },
      { rootMargin: "200px" }
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [hasMore, visibleIssues.length])

  if (isLoading && backlogIssues.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0">
              <Skeleton className="size-3.5 rounded-full" />
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 flex-1 max-w-md" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtres en ligne + stats */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <InlineIssueFilters issues={issues} value={filters} onChange={(f) => { setFilters(f); setVisible(PAGE_SIZE) }} />
        <span className="ml-auto"><span className="font-medium text-foreground">{backlogIssues.length}</span> issues</span>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
        {/* Header de colonnes (QA3-9) */}
        <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="h-2 w-2 shrink-0" aria-hidden />
          <span className="w-3.5 shrink-0" aria-hidden />
          <span className="w-14 shrink-0">ID</span>
          <span className="flex-1">Title</span>
          <span className="hidden md:block w-36 shrink-0 text-right">Labels</span>
          <span className="hidden lg:block w-8 shrink-0 text-center">Owner</span>
          <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </div>
        {visibleIssues.map((issue) => (
          <div
            key={issue.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedIssue(toSheetIssue(issue))}
            onKeyDown={(e) => e.key === "Enter" && setSelectedIssue(toSheetIssue(issue))}
            className="group flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0 text-left"
          >
            <div className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleToggleDone(issue) }}
              title="Marquer comme terminée"
              className="shrink-0 text-muted-foreground transition-colors hover:text-emerald-500"
            >
              <CircleDot className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">{issue.identifier}</span>
            <span className="flex-1 text-sm text-foreground truncate group-hover:text-primary transition-colors">{issue.title}</span>

            <div className="hidden md:flex w-36 shrink-0 justify-end gap-1 overflow-hidden">
              {issue.labels.slice(0, 2).map((l) => (
                <Badge key={l.id} variant="secondary" className="text-[10px] px-1.5 h-4 bg-muted/60 border-0 text-muted-foreground">{l.name}</Badge>
              ))}
            </div>

            <div className="hidden lg:flex items-center justify-center w-8">
              {issue.assignee && (
                <UserAvatar
                  email={issue.assignee.email}
                  name={issue.assignee.displayName ?? issue.assignee.email}
                  className="h-5 w-5"
                  fallbackClassName="text-[9px]"
                />
              )}
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        ))}

        {/* Sentinel infinite-scroll (QA2-33) */}
        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center gap-2 px-4 py-3 text-xs text-muted-foreground/60 border-b border-border/50">
            <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-transparent" />
            Chargement… ({visibleIssues.length}/{backlogIssues.length})
          </div>
        )}

        <CreateIssueDialog workspaceSlug={workspace} projectId={projectId} defaultStatusId={undefined}>
          <button type="button" className="flex w-full items-center gap-2 px-4 py-2.5 text-muted-foreground hover:bg-muted/20 transition-colors cursor-pointer">
            <Plus className="h-3.5 w-3.5" />
            <span className="text-xs">Add to backlog</span>
          </button>
        </CreateIssueDialog>
      </div>

      <IssueSheet
        issue={selectedIssue}
        open={selectedIssue !== null}
        onOpenChange={(open) => { if (!open) setSelectedIssue(null) }}
        workspaceSlug={workspace}
        projectId={projectId}
      />
    </div>
  )
}

