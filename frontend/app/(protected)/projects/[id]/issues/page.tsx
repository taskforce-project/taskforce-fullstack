"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  CircleDot,
  RefreshCw,
  Clock,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"
type IssueStatus = "todo" | "in_progress" | "in_review" | "done" | "cancelled"
type StatusFilter = "all" | IssueStatus
type PriorityFilter = "all" | IssuePriority

interface Issue {
  id: string
  identifier: string
  title: string
  priority: IssuePriority
  status: IssueStatus
  assignee: { initials: string; color: string; name: string } | null
  labels: string[]
  dueDate: string | null
  storyPoints: number | null
  cycle: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRIORITY_DOT: Record<IssuePriority, string> = {
  urgent: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-slate-400",
  none: "bg-muted-foreground/30",
}

const PRIORITY_LABEL: Record<IssuePriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
}

const STATUS_ICON: Record<IssueStatus, React.ReactNode> = {
  todo: <CircleDot className="size-3.5 text-muted-foreground" />,
  in_progress: <RefreshCw className="size-3.5 text-blue-400" />,
  in_review: <Clock className="size-3.5 text-yellow-400" />,
  done: <CheckCircle2 className="size-3.5 text-emerald-400" />,
  cancelled: <X className="size-3.5 text-muted-foreground" />,
}


const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "todo", label: "Todo" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
  { key: "done", label: "Done" },
]

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const ALL_ISSUES: Issue[] = [
  { id: "1", identifier: "TF-001", title: "Implement JWT refresh token rotation", priority: "high", status: "in_progress", assignee: { initials: "SM", color: "bg-violet-500", name: "Sophie Martin" }, labels: ["security", "auth"], dueDate: "Apr 15", storyPoints: 5, cycle: "Sprint 4", createdAt: "Feb 14" },
  { id: "2", identifier: "TF-029", title: "Implement dark mode toggle", priority: "low", status: "in_progress", assignee: { initials: "ME", color: "bg-primary", name: "You" }, labels: ["ui"], dueDate: "Apr 2", storyPoints: 2, cycle: "Sprint 4", createdAt: "Mar 1" },
  { id: "3", identifier: "TF-032", title: "Responsive navigation redesign", priority: "high", status: "in_progress", assignee: { initials: "SM", color: "bg-violet-500", name: "Sophie Martin" }, labels: ["ui", "mobile"], dueDate: "Apr 1", storyPoints: 8, cycle: "Sprint 4", createdAt: "Mar 5" },
  { id: "4", identifier: "TF-038", title: "SEO meta tags refactor", priority: "medium", status: "in_progress", assignee: { initials: "EP", color: "bg-emerald-500", name: "Emma Petit" }, labels: ["seo"], dueDate: null, storyPoints: 3, cycle: "Sprint 4", createdAt: "Mar 10" },
  { id: "5", identifier: "TF-041", title: "Update hero section copy", priority: "high", status: "todo", assignee: { initials: "ME", color: "bg-primary", name: "You" }, labels: ["copy"], dueDate: "Mar 31", storyPoints: 1, cycle: null, createdAt: "Mar 15" },
  { id: "6", identifier: "TF-044", title: "Add social proof section with testimonials", priority: "medium", status: "todo", assignee: null, labels: ["design"], dueDate: null, storyPoints: 5, cycle: null, createdAt: "Mar 18" },
  { id: "7", identifier: "TF-047", title: "Implement cookie consent banner", priority: "low", status: "todo", assignee: { initials: "EP", color: "bg-emerald-500", name: "Emma Petit" }, labels: ["legal"], dueDate: null, storyPoints: 3, cycle: null, createdAt: "Mar 20" },
  { id: "8", identifier: "TF-022", title: "Analytics integration with Plausible", priority: "medium", status: "in_review", assignee: { initials: "SM", color: "bg-violet-500", name: "Sophie Martin" }, labels: ["analytics"], dueDate: "Mar 30", storyPoints: 5, cycle: "Sprint 4", createdAt: "Mar 2" },
  { id: "9", identifier: "TF-025", title: "Accessibility audit — WCAG 2.1 AA", priority: "high", status: "in_review", assignee: { initials: "ME", color: "bg-primary", name: "You" }, labels: ["a11y"], dueDate: "Overdue", storyPoints: 8, cycle: "Sprint 4", createdAt: "Mar 3" },
  { id: "10", identifier: "TF-011", title: "Set up Next.js 15 project", priority: "none", status: "done", assignee: { initials: "ME", color: "bg-primary", name: "You" }, labels: [], dueDate: null, storyPoints: 3, cycle: "Sprint 1", createdAt: "Feb 10" },
  { id: "11", identifier: "TF-012", title: "Design system tokens (colors, typography)", priority: "none", status: "done", assignee: { initials: "EP", color: "bg-emerald-500", name: "Emma Petit" }, labels: ["design"], dueDate: null, storyPoints: 5, cycle: "Sprint 1", createdAt: "Feb 10" },
  { id: "12", identifier: "TF-014", title: "CI/CD pipeline with GitHub Actions", priority: "none", status: "done", assignee: { initials: "SM", color: "bg-violet-500", name: "Sophie Martin" }, labels: ["devops"], dueDate: null, storyPoints: 5, cycle: "Sprint 1", createdAt: "Feb 11" },
]

// ---------------------------------------------------------------------------
// IssueRow
// ---------------------------------------------------------------------------

function IssueRow({ issue, projectId }: { readonly issue: Issue; readonly projectId: string }) {
  const isOverdue = issue.dueDate === "Overdue"

  return (
    <Link
      href={`/projects/${projectId}/issues/${issue.identifier.toLowerCase().replace("-", "")}`}
      className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0"
    >
      {/* Priority dot */}
      <div className={cn("size-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />

      {/* Status icon */}
      <div className="shrink-0">{STATUS_ICON[issue.status]}</div>

      {/* Identifier */}
      <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">{issue.identifier}</span>

      {/* Title */}
      <span className="flex-1 text-sm text-foreground truncate group-hover:text-primary transition-colors">
        {issue.title}
      </span>

      {/* Cycle */}
      {issue.cycle && (
        <span className="hidden xl:block text-xs text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 shrink-0">
          {issue.cycle}
        </span>
      )}

      {/* Labels */}
      <div className="hidden md:flex gap-1 shrink-0">
        {issue.labels.slice(0, 2).map((l) => (
          <Badge key={l} variant="secondary" className="text-[10px] px-1.5 h-4 bg-muted/60 border-0 text-muted-foreground">
            {l}
          </Badge>
        ))}
      </div>

      {/* Story points */}
      {issue.storyPoints !== null && (
        <span className="hidden sm:block text-xs text-muted-foreground font-medium bg-muted rounded px-1.5 py-0.5 shrink-0">
          {issue.storyPoints}p
        </span>
      )}

      {/* Due date */}
      <span className={cn("hidden md:block text-xs w-20 text-right shrink-0", isOverdue ? "text-red-400 font-medium" : "text-muted-foreground")}>
        {isOverdue && <AlertTriangle className="size-3 inline mr-1" />}
        {issue.dueDate ?? "—"}
      </span>

      {/* Assignee */}
      <div className="hidden lg:flex items-center justify-center w-8 shrink-0">
        {issue.assignee ? (
          <Avatar className="size-5">
            <AvatarFallback className={cn("text-[9px] text-white", issue.assignee.color)}>
              {issue.assignee.initials}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="size-5 rounded-full border border-dashed border-border" />
        )}
      </div>

      <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function IssueStats({ issues }: { readonly issues: Issue[] }) {
  const counts = {
    todo: issues.filter((i) => i.status === "todo").length,
    in_progress: issues.filter((i) => i.status === "in_progress").length,
    in_review: issues.filter((i) => i.status === "in_review").length,
    done: issues.filter((i) => i.status === "done").length,
  }

  const total = issues.length
  const donePercent = total > 0 ? Math.round((counts.done / total) * 100) : 0

  return (
    <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
      <span>
        <span className="font-semibold text-foreground text-sm">{total}</span> issues
      </span>
      <span>·</span>
      <span className="flex items-center gap-1">
        <CircleDot className="size-3 text-muted-foreground" />
        {counts.todo} todo
      </span>
      <span className="flex items-center gap-1">
        <RefreshCw className="size-3 text-blue-400" />
        {counts.in_progress} in progress
      </span>
      <span className="flex items-center gap-1">
        <Clock className="size-3 text-yellow-400" />
        {counts.in_review} in review
      </span>
      <span className="flex items-center gap-1">
        <CheckCircle2 className="size-3 text-emerald-400" />
        {counts.done} done
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
  const projectId = typeof params.id === "string" ? params.id : "1"

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all")

  const filtered = useMemo(() => {
    let list = ALL_ISSUES
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter)
    if (priorityFilter !== "all") list = list.filter((i) => i.priority === priorityFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((i) => i.title.toLowerCase().includes(q) || i.identifier.toLowerCase().includes(q))
    }
    return list
  }, [search, statusFilter, priorityFilter])

  const hasFilters = statusFilter !== "all" || priorityFilter !== "all" || search.trim()

  function clearFilters() {
    setSearch("")
    setStatusFilter("all")
    setPriorityFilter("all")
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <IssueStats issues={ALL_ISSUES} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status tabs */}
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-all border-b-2 whitespace-nowrap",
                statusFilter === tab.key
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
            {(["urgent", "high", "medium", "low", "none"] as IssuePriority[]).map((p) => (
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
          <div className="w-14 shrink-0">ID</div>
          <div className="flex-1">Title</div>
          <div className="hidden xl:block w-20 text-right shrink-0">Cycle</div>
          <div className="hidden md:block w-24 text-right shrink-0">Labels</div>
          <div className="hidden sm:block w-8 text-right shrink-0">Pts</div>
          <div className="hidden md:block w-20 text-right shrink-0">Due</div>
          <div className="hidden lg:block w-8 text-center shrink-0">Who</div>
          <div className="size-3.5 shrink-0" />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="size-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">No issues found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {hasFilters ? "Try adjusting your filters" : "Create the first issue for this project"}
            </p>
            {!hasFilters && (
              <Button size="sm" className="mt-4 gap-2" variant="outline">
                <Plus className="size-4" />
                New issue
              </Button>
            )}
          </div>
        ) : (
          filtered.map((issue) => (
            <IssueRow key={issue.id} issue={issue} projectId={projectId} />
          ))
        )}

        {/* Add issue row */}
        <div className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground hover:bg-muted/20 transition-colors cursor-pointer">
          <Plus className="size-3.5" />
          <span className="text-xs">Add issue</span>
        </div>
      </div>
    </div>
  )
}
