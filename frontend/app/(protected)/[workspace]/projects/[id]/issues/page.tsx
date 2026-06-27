"use client"

import { useState, useMemo, useEffect } from "react"
import { useParams } from "next/navigation"
import { IssueSheet } from "@/components/sheets/issue-sheet"
import type { SheetIssue } from "@/components/sheets/issue-sheet"
import {
  CircleDot,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
  ArrowUpRight,
  Filter,
  X,
  SortAsc,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useIssueStore } from "@/lib/store/issue-store"
import type { Issue, IssuePriority, IssueStatusCategory } from "@/lib/api/issue-service"
import { CreateIssueDialog } from "@/components/dialogs/create-issue-dialog"
import { DataTablePagination } from "@/components/ui/data-table-pagination"
import { Spinner } from "@/components/ui/spinner"
import { usePagination } from "@/hooks/use-pagination"

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

const PRIORITY_DOT: Record<IssuePriority, string> = {
  URGENT: "bg-red-400",
  HIGH:   "bg-orange-400",
  MEDIUM: "bg-yellow-400",
  LOW:    "bg-slate-400",
  NONE:   "bg-muted-foreground/30",
}

const PRIORITY_LABEL: Record<IssuePriority, string> = {
  URGENT: "Urgent",
  HIGH:   "High",
  MEDIUM: "Medium",
  LOW:    "Low",
  NONE:   "None",
}

function getCategoryIcon(category: IssueStatusCategory): React.ReactNode {
  switch (category) {
    case "STARTED":   return <RefreshCw className="size-3.5 text-blue-400" />
    case "COMPLETED": return <CheckCircle2 className="size-3.5 text-emerald-400" />
    case "CANCELLED": return <X className="size-3.5 text-muted-foreground" />
    default:          return <CircleDot className="size-3.5 text-muted-foreground" />
  }
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
]

function emailInitials(email: string): string {
  return email.slice(0, 2).toUpperCase()
}

function emailColor(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch {
    return null
  }
}

function isDueDateOverdue(iso: string | null): boolean {
  if (!iso) return false
  return new Date(iso) < new Date()
}

/** Convertit une Issue API en SheetIssue (format attendu par IssueSheet) */
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
      ? { initials: emailInitials(issue.assignee.email), color: emailColor(issue.assignee.id), name: issue.assignee.email, email: issue.assignee.email, userId: issue.assignee.id }
      : null,
    assigneeId:     issue.assignee?.id ?? null,
    labels:         issue.labels,
    pinned:         issue.pinned,
    archived:       issue.archived,
    dueDate:        formatDate(issue.dueDate),
    storyPoints:    null,
    cycle:          null,
    createdAt:      formatDate(issue.createdAt) ?? issue.createdAt,
  }
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type CategoryFilter = "all" | IssueStatusCategory

const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "UNSTARTED", label: "Todo" },
  { key: "BACKLOG",   label: "Backlog" },
  { key: "STARTED",   label: "In Progress" },
  { key: "COMPLETED", label: "Done" },
  { key: "CANCELLED", label: "Cancelled" },
]

// ---------------------------------------------------------------------------
// IssueRow
// ---------------------------------------------------------------------------

function IssueRow({ issue, onOpen }: { readonly issue: Issue; readonly onOpen: (issue: Issue) => void }) {
  const overdue = isDueDateOverdue(issue.dueDate)

  return (
    <button
      type="button"
      onClick={() => onOpen(issue)}
      className="group flex w-full items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0 text-left"
    >
      {/* Priority dot */}
      <div className={cn("size-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />

      {/* Status icon */}
      <div className="shrink-0">{getCategoryIcon(issue.status.category)}</div>

      {/* Identifier */}
      <span className="text-xs text-muted-foreground font-mono w-16 shrink-0">{issue.identifier}</span>

      {/* Title */}
      <span className="flex-1 text-sm text-foreground truncate group-hover:text-primary transition-colors">
        {issue.title}
      </span>

      {/* Status name */}
      <span className="hidden xl:block text-xs text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 shrink-0">
        {issue.status.name}
      </span>

      {/* Labels */}
      <div className="hidden md:flex gap-1 shrink-0">
        {issue.labels.slice(0, 2).map((l) => (
          <Badge key={l.id} variant="secondary" className="text-[10px] px-1.5 h-4 bg-muted/60 border-0 text-muted-foreground">
            {l.name}
          </Badge>
        ))}
      </div>

      {/* Due date */}
      <span className={cn("hidden md:flex items-center gap-1 text-xs w-20 text-right shrink-0", overdue ? "text-red-400 font-medium" : "text-muted-foreground")}>
        {overdue && <AlertTriangle className="size-3" />}
        {formatDate(issue.dueDate) ?? "—"}
      </span>

      {/* Assignee */}
      <div className="hidden lg:flex items-center justify-center w-8 shrink-0">
        {issue.assignee ? (
          <UserAvatar
            email={issue.assignee.email}
            name={issue.assignee.email}
            className="size-5"
            fallbackClassName="text-[9px]"
          />
        ) : (
          <div className="size-5 rounded-full border border-dashed border-border" />
        )}
      </div>

      <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function IssueStats({ issues }: { readonly issues: Issue[] }) {
  const started   = issues.filter((i) => i.status.category === "STARTED").length
  const unstarted = issues.filter((i) => i.status.category === "UNSTARTED" || i.status.category === "BACKLOG").length
  const completed = issues.filter((i) => i.status.category === "COMPLETED").length
  const total     = issues.length
  const donePercent = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
      <span>
        <span className="font-semibold text-foreground text-sm">{total}</span> issues
      </span>
      <span>·</span>
      <span className="flex items-center gap-1">
        <CircleDot className="size-3 text-muted-foreground" />
        {unstarted} not started
      </span>
      <span className="flex items-center gap-1">
        <RefreshCw className="size-3 text-blue-400" />
        {started} in progress
      </span>
      <span className="flex items-center gap-1">
        <CheckCircle2 className="size-3 text-emerald-400" />
        {completed} done
      </span>

      {/* Progress bar */}
      <div className="hidden sm:flex items-center gap-2 ml-2">
        <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${donePercent}%` }}
          />
        </div>
        <span>{donePercent}% done</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectIssuesPage() {
  const params = useParams()
  const workspaceRaw = params.workspace
  let workspace = ""
  if (typeof workspaceRaw === "string") workspace = workspaceRaw
  else if (Array.isArray(workspaceRaw)) workspace = workspaceRaw[0] ?? ""

  const idRaw = params.id
  let projectId = 0
  if (typeof idRaw === "string") projectId = Number(idRaw)
  else if (Array.isArray(idRaw)) projectId = Number(idRaw[0] ?? "0")

  const { issues, isLoading, fetchIssues } = useIssueStore()

  const [search, setSearch]               = useState("")
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "all">("all")
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)

  useEffect(() => {
    if (workspace && projectId) {
      fetchIssues(workspace, projectId)
    }
  }, [workspace, projectId, fetchIssues])

  const filtered = useMemo(() => {
    let list = issues
    if (categoryFilter !== "all") list = list.filter((i) => i.status.category === categoryFilter)
    if (priorityFilter !== "all") list = list.filter((i) => i.priority === priorityFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((i) => i.title.toLowerCase().includes(q) || i.identifier.toLowerCase().includes(q))
    }
    return list
  }, [issues, search, categoryFilter, priorityFilter])

  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = usePagination(filtered)

  const hasFilters = categoryFilter !== "all" || priorityFilter !== "all" || search.trim()

  function clearFilters() {
    setSearch("")
    setCategoryFilter("all")
    setPriorityFilter("all")
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <IssueStats issues={issues} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Category tabs */}
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setCategoryFilter(tab.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-all border-b-2 whitespace-nowrap",
                categoryFilter === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Priority filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Filter className="size-3.5" />
              {priorityFilter === "all" ? "Priority" : PRIORITY_LABEL[priorityFilter]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setPriorityFilter("all")}>All priorities</DropdownMenuItem>
            <DropdownMenuSeparator />
            {(["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"] as IssuePriority[]).map((p) => (
              <DropdownMenuItem key={p} onClick={() => setPriorityFilter(p)} className="gap-2">
                <div className={cn("size-2 rounded-full", PRIORITY_DOT[p])} />
                {PRIORITY_LABEL[p]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <SortAsc className="size-3.5" />
              Sort
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Priority (high → low)</DropdownMenuItem>
            <DropdownMenuItem>Created date</DropdownMenuItem>
            <DropdownMenuItem>Due date</DropdownMenuItem>
            <DropdownMenuItem>Assignee</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search */}
        <div className="relative max-w-xs w-full sm:w-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search issues…"
            className="pl-7 h-8 text-xs w-full sm:w-52"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground" onClick={clearFilters}>
            <X className="size-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/20 text-xs text-muted-foreground">
          <div className="size-2 shrink-0" />
          <div className="size-3.5 shrink-0" />
          <div className="w-16 shrink-0">ID</div>
          <div className="flex-1">Title</div>
          <div className="hidden xl:block w-24 text-right shrink-0">Status</div>
          <div className="hidden md:block w-24 text-right shrink-0">Labels</div>
          <div className="hidden md:block w-20 text-right shrink-0">Due</div>
          <div className="hidden lg:block w-8 text-center shrink-0">Who</div>
          <div className="size-3.5 shrink-0" />
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Spinner className="size-6 text-muted-foreground/60 mb-3" />
            <p className="text-sm text-muted-foreground">Loading issues…</p>
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="size-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">No issues found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {hasFilters ? "Try adjusting your filters" : "Create the first issue for this project"}
            </p>
            {!hasFilters && (
              <CreateIssueDialog workspaceSlug={workspace} projectId={projectId}>
                <Button size="sm" className="mt-4 gap-2" variant="outline">
                  <Plus className="size-4" />
                  New issue
                </Button>
              </CreateIssueDialog>
            )}
          </div>
        )}
        {!isLoading && filtered.length > 0 && (
          pageItems.map((issue) => (
            <IssueRow key={issue.id} issue={issue} onOpen={setSelectedIssue} />
          ))
        )}

        {!isLoading && total > 0 && (
          <DataTablePagination
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}

        {/* Add issue row */}
        <CreateIssueDialog workspaceSlug={workspace} projectId={projectId}>
          <button type="button" className="flex w-full items-center gap-2 px-4 py-2.5 text-muted-foreground hover:bg-muted/20 transition-colors cursor-pointer">
            <Plus className="size-3.5" />
            <span className="text-xs">Add issue</span>
          </button>
        </CreateIssueDialog>
      </div>

      <IssueSheet
        issue={selectedIssue ? toSheetIssue(selectedIssue) : null}
        open={selectedIssue !== null}
        onOpenChange={(open) => { if (!open) setSelectedIssue(null) }}
        workspaceSlug={workspace}
        projectId={projectId}
      />
    </div>
  )
}
