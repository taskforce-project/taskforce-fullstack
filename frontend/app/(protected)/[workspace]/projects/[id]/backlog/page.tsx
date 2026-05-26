"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import {
  CircleDot,
  Plus,
  ArrowUpRight,
  GripVertical,
  Loader2,
} from "lucide-react"

import { IssueSheet, type SheetIssue } from "@/components/sheets/issue-sheet"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
      ? { initials: emailInitials(issue.assignee.email), color: assigneeColor(issue.assignee.id), name: issue.assignee.displayName ?? issue.assignee.email, userId: issue.assignee.id }
      : null,
    assigneeId:     issue.assignee?.id ?? null,
    labels:         issue.labels.map((l) => l.name),
    dueDate:        formatDate(issue.dueDate),
    storyPoints:    null,
    cycle:          null,
    createdAt:      formatDate(issue.createdAt) ?? issue.createdAt,
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectBacklogPage() {
  const params    = useParams()
  const workspace = typeof params.workspace === "string" ? params.workspace : ""
  const projectId = typeof params.id        === "string" ? Number(params.id)  : 0

  const { fetchIssues, issues, isLoading } = useIssueStore()
  const [selectedIssue, setSelectedIssue] = useState<SheetIssue | null>(null)

  useEffect(() => {
    if (!workspace || !projectId) return
    fetchIssues(workspace, projectId)
  }, [workspace, projectId, fetchIssues])

  // Backlog = issues with BACKLOG status category
  const backlogIssues = issues.filter((i) => i.status.category === "BACKLOG")

  if (isLoading && backlogIssues.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span><span className="font-medium text-foreground">{backlogIssues.length}</span> issues</span>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
        {backlogIssues.map((issue) => (
          <button
            key={issue.id}
            type="button"
            onClick={() => setSelectedIssue(toSheetIssue(issue))}
            className="group flex w-full items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0 text-left"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 shrink-0 transition-colors" />
            <div className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />
            <CircleDot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">{issue.identifier}</span>
            <span className="flex-1 text-sm text-foreground truncate group-hover:text-primary transition-colors">{issue.title}</span>

            <div className="hidden md:flex gap-1">
              {issue.labels.slice(0, 2).map((l) => (
                <Badge key={l.id} variant="secondary" className="text-[10px] px-1.5 h-4 bg-muted/60 border-0 text-muted-foreground">{l.name}</Badge>
              ))}
            </div>

            <div className="hidden lg:flex items-center justify-center w-8">
              {issue.assignee && (
                <Avatar className="h-5 w-5">
                  <AvatarFallback className={cn("text-[9px] text-white", assigneeColor(issue.assignee.id))}>
                    {emailInitials(issue.assignee.email)}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        ))}

        <div className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground hover:bg-muted/20 transition-colors cursor-pointer">
          <Plus className="h-3.5 w-3.5" />
          <span className="text-xs">Add to backlog</span>
        </div>
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

