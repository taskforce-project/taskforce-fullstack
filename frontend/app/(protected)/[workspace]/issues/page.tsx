"use client"

import { useState, useMemo } from "react"
import {
  Search,
  Plus,
  Filter,
  ChevronDown,
  CircleDot,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Minus,
  FolderKanban,
  MoreHorizontal,
  SlidersHorizontal,
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
import { CreateIssueDialog } from "@/components/dialogs/create-issue-dialog"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"
type IssueStatus   = "todo" | "in_progress" | "in_review" | "done" | "cancelled"

interface Issue {
  id: string
  identifier: string
  title: string
  status: IssueStatus
  priority: IssuePriority
  project: { id: string; name: string; color: string; emoji: string }
  assignee: { name: string; initials: string; color: string } | null
  labels: string[]
  dueDate: string | null
  createdAt: string
  storyPoints: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_ISSUES: Issue[] = [
  { id: "1",  identifier: "TF-001", title: "Fix authentication token refresh on mobile",    status: "in_progress", priority: "urgent", project: { id: "1", name: "Mobile App",    color: "bg-blue-500",    emoji: "📱" }, assignee: { name: "You",            initials: "ME", color: "bg-primary"     }, labels: ["bug", "auth"],      dueDate: "2026-04-07", createdAt: "3 days ago", storyPoints: 3  },
  { id: "2",  identifier: "TF-002", title: "Implement dark mode for dashboard",              status: "todo",        priority: "high",   project: { id: "1", name: "Website",       color: "bg-violet-500",  emoji: "🎨" }, assignee: { name: "Sophie Martin", initials: "SM", color: "bg-violet-500"  }, labels: ["feature", "ui"],    dueDate: "2026-04-10", createdAt: "2 days ago", storyPoints: 5  },
  { id: "3",  identifier: "TF-003", title: "Set up rate limiting on public API endpoints",  status: "in_review",   priority: "high",   project: { id: "3", name: "API v2",        color: "bg-emerald-500", emoji: "⚡" }, assignee: { name: "Thomas Bernard",initials: "TB", color: "bg-orange-500"  }, labels: ["security"],         dueDate: "2026-04-08", createdAt: "1 day ago",  storyPoints: 8  },
  { id: "4",  identifier: "TF-004", title: "Add pagination to GET /issues endpoint",        status: "todo",        priority: "medium", project: { id: "3", name: "API v2",        color: "bg-emerald-500", emoji: "⚡" }, assignee: { name: "You",            initials: "ME", color: "bg-primary"     }, labels: ["backend"],          dueDate: null,         createdAt: "4 days ago", storyPoints: 2  },
  { id: "5",  identifier: "TF-005", title: "Redesign onboarding flow for new users",        status: "todo",        priority: "medium", project: { id: "1", name: "Mobile App",    color: "bg-blue-500",    emoji: "📱" }, assignee: { name: "Emma Petit",    initials: "EP", color: "bg-emerald-500" }, labels: ["ux", "feature"],    dueDate: "2026-04-15", createdAt: "5 days ago", storyPoints: 13 },
  { id: "6",  identifier: "TF-006", title: "Fix chart rendering on Safari 16",              status: "in_progress", priority: "high",   project: { id: "4", name: "Analytics",     color: "bg-amber-500",   emoji: "📊" }, assignee: { name: "You",            initials: "ME", color: "bg-primary"     }, labels: ["bug"],              dueDate: "2026-04-06", createdAt: "1 day ago",  storyPoints: 3  },
  { id: "7",  identifier: "TF-007", title: "Create button component documentation",         status: "done",        priority: "low",    project: { id: "5", name: "Design System", color: "bg-slate-500",   emoji: "💎" }, assignee: { name: "Emma Petit",    initials: "EP", color: "bg-emerald-500" }, labels: ["docs"],             dueDate: null,         createdAt: "1 week ago", storyPoints: 1  },
  { id: "8",  identifier: "TF-008", title: "Optimize Postgres indexes for issues table",    status: "done",        priority: "high",   project: { id: "3", name: "API v2",        color: "bg-emerald-500", emoji: "⚡" }, assignee: { name: "Thomas Bernard",initials: "TB", color: "bg-orange-500"  }, labels: ["performance", "db"],dueDate: null,         createdAt: "1 week ago", storyPoints: 5  },
  { id: "9",  identifier: "TF-009", title: "Integrate Stripe billing for Pro plan",         status: "in_progress", priority: "urgent", project: { id: "2", name: "Mobile App",    color: "bg-blue-500",    emoji: "📱" }, assignee: { name: "Sophie Martin", initials: "SM", color: "bg-violet-500"  }, labels: ["billing", "feature"],dueDate: "2026-04-09", createdAt: "2 days ago", storyPoints: 8  },
  { id: "10", identifier: "TF-010", title: "Write E2E tests for auth flow",                 status: "todo",        priority: "medium", project: { id: "1", name: "Website",       color: "bg-violet-500",  emoji: "🎨" }, assignee: null,                                                                  labels: ["test"],             dueDate: "2026-04-20", createdAt: "3 days ago", storyPoints: 5  },
  { id: "11", identifier: "TF-011", title: "Fix mobile keyboard pushing layout up",         status: "in_review",   priority: "medium", project: { id: "1", name: "Mobile App",    color: "bg-blue-500",    emoji: "📱" }, assignee: { name: "Emma Petit",    initials: "EP", color: "bg-emerald-500" }, labels: ["bug", "mobile"],    dueDate: "2026-04-11", createdAt: "2 days ago", storyPoints: 2  },
  { id: "12", identifier: "TF-012", title: "Add CSV export to analytics reports",           status: "todo",        priority: "low",    project: { id: "4", name: "Analytics",     color: "bg-amber-500",   emoji: "📊" }, assignee: { name: "Sophie Martin", initials: "SM", color: "bg-violet-500"  }, labels: ["feature"],          dueDate: null,         createdAt: "4 days ago", storyPoints: 3  },
  { id: "13", identifier: "TF-013", title: "Migrate remaining pages to App Router",         status: "cancelled",   priority: "low",    project: { id: "1", name: "Website",       color: "bg-violet-500",  emoji: "🎨" }, assignee: { name: "You",            initials: "ME", color: "bg-primary"     }, labels: ["refactor"],         dueDate: null,         createdAt: "2 weeks ago",storyPoints: 8  },
  { id: "14", identifier: "TF-014", title: "Localize app for French and German markets",    status: "todo",        priority: "medium", project: { id: "2", name: "Mobile App",    color: "bg-blue-500",    emoji: "📱" }, assignee: null,                                                                  labels: ["i18n"],             dueDate: "2026-04-30", createdAt: "5 days ago", storyPoints: 13 },
  { id: "15", identifier: "TF-015", title: "Set up Sentry error tracking in production",    status: "done",        priority: "high",   project: { id: "3", name: "API v2",        color: "bg-emerald-500", emoji: "⚡" }, assignee: { name: "Thomas Bernard",initials: "TB", color: "bg-orange-500"  }, labels: ["devops", "monitoring"],dueDate: null,       createdAt: "1 week ago", storyPoints: 3  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<IssueStatus, { label: string; icon: React.ReactNode; color: string }> = {
  todo:        { label: "Todo",        icon: <CircleDot  className="h-3.5 w-3.5 text-muted-foreground" />,  color: "text-muted-foreground" },
  in_progress: { label: "In Progress", icon: <RefreshCw  className="h-3.5 w-3.5 text-blue-400"          />, color: "text-blue-400"          },
  in_review:   { label: "In Review",   icon: <Clock      className="h-3.5 w-3.5 text-amber-400"          />, color: "text-amber-400"         },
  done:        { label: "Done",        icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400"      />, color: "text-emerald-400"       },
  cancelled:   { label: "Cancelled",   icon: <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground/50"/>, color: "text-muted-foreground/50"},
}

const PRIORITY_CONFIG: Record<IssuePriority, { label: string; icon: React.ReactNode }> = {
  urgent: { label: "Urgent", icon: <AlertTriangle className="h-3.5 w-3.5 text-red-400"  /> },
  high:   { label: "High",   icon: <ArrowUp       className="h-3.5 w-3.5 text-orange-400"/> },
  medium: { label: "Medium", icon: <ArrowRight    className="h-3.5 w-3.5 text-amber-400" /> },
  low:    { label: "Low",    icon: <ArrowDown     className="h-3.5 w-3.5 text-blue-400"  /> },
  none:   { label: "None",   icon: <Minus         className="h-3.5 w-3.5 text-muted-foreground"/> },
}

const LABEL_COLORS: Record<string, string> = {
  bug:          "border-red-500/30 bg-red-500/10 text-red-400",
  feature:      "border-primary/30 bg-primary/10 text-primary",
  ui:           "border-violet-500/30 bg-violet-500/10 text-violet-400",
  ux:           "border-violet-500/30 bg-violet-500/10 text-violet-400",
  auth:         "border-amber-500/30 bg-amber-500/10 text-amber-400",
  security:     "border-red-500/30 bg-red-500/10 text-red-400",
  backend:      "border-slate-500/30 bg-slate-500/10 text-slate-400",
  docs:         "border-sky-500/30 bg-sky-500/10 text-sky-400",
  performance:  "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  db:           "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  billing:      "border-amber-500/30 bg-amber-500/10 text-amber-400",
  test:         "border-sky-500/30 bg-sky-500/10 text-sky-400",
  mobile:       "border-blue-500/30 bg-blue-500/10 text-blue-400",
  refactor:     "border-slate-500/30 bg-slate-500/10 text-slate-400",
  i18n:         "border-purple-500/30 bg-purple-500/10 text-purple-400",
  devops:       "border-orange-500/30 bg-orange-500/10 text-orange-400",
  monitoring:   "border-orange-500/30 bg-orange-500/10 text-orange-400",
}

// ─────────────────────────────────────────────────────────────────────────────
// IssueRow
// ─────────────────────────────────────────────────────────────────────────────

function IssueRow({ issue }: Readonly<{ issue: Issue }>) {
  const status   = STATUS_CONFIG[issue.status]
  const priority = PRIORITY_CONFIG[issue.priority]

  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 border-b border-border/50 last:border-0 transition-colors cursor-pointer">
      {/* Priority */}
      <div className="flex items-center justify-center w-5 shrink-0" title={priority.label}>
        {priority.icon}
      </div>

      {/* Status */}
      <div className="flex items-center justify-center w-5 shrink-0" title={status.label}>
        {status.icon}
      </div>

      {/* Identifier */}
      <span className="text-xs text-muted-foreground font-mono shrink-0 w-16">{issue.identifier}</span>

      {/* Title */}
      <span className={cn(
        "flex-1 text-sm text-foreground truncate",
        issue.status === "done" && "line-through text-muted-foreground",
        issue.status === "cancelled" && "line-through text-muted-foreground/50"
      )}>
        {issue.title}
      </span>

      {/* Labels */}
      <div className="hidden lg:flex items-center gap-1 shrink-0">
        {issue.labels.slice(0, 2).map((label) => (
          <Badge
            key={label}
            variant="outline"
            className={cn("text-[10px] h-4 px-1.5 font-normal border", LABEL_COLORS[label] ?? "border-border text-muted-foreground")}
          >
            {label}
          </Badge>
        ))}
        {issue.labels.length > 2 && (
          <span className="text-[10px] text-muted-foreground">+{issue.labels.length - 2}</span>
        )}
      </div>

      {/* Project */}
      <div className="hidden md:flex items-center gap-1.5 shrink-0 w-36">
        <span className="text-base leading-none">{issue.project.emoji}</span>
        <span className="text-xs text-muted-foreground truncate">{issue.project.name}</span>
      </div>

      {/* Due date */}
      <div className="hidden sm:block w-20 shrink-0 text-right">
        {issue.dueDate ? (
          <span className={cn(
            "text-xs",
            new Date(issue.dueDate) < new Date() && issue.status !== "done" ? "text-red-400 font-medium" : "text-muted-foreground"
          )}>
            {new Date(issue.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Assignee */}
      <div className="shrink-0 w-7">
        {issue.assignee ? (
          <Avatar className="h-6 w-6">
            <AvatarFallback className={cn("text-[9px] text-white font-semibold", issue.assignee.color)}>
              {issue.assignee.initials}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="h-6 w-6 rounded-full border-2 border-dashed border-border/60" />
        )}
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem>Edit</DropdownMenuItem>
          <DropdownMenuItem>Assign to me</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GroupedSection
// ─────────────────────────────────────────────────────────────────────────────

function GroupedSection({ status, issues }: Readonly<{ status: IssueStatus; issues: Issue[] }>) {
  const [open, setOpen] = useState(true)
  const cfg = STATUS_CONFIG[status]

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-4 py-3 w-full bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", !open && "-rotate-90")} />
        {cfg.icon}
        <span className="text-sm font-medium text-foreground">{cfg.label}</span>
        <Badge variant="outline" className="h-4 min-w-4 px-1.5 text-[10px] font-semibold ml-1">
          {issues.length}
        </Badge>
      </button>
      {open && (
        <div>
          {issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type GroupBy    = "status" | "priority" | "project"
type FilterStatus   = IssueStatus | "all"
type FilterPriority = IssuePriority | "all"

const STATUS_ORDER: IssueStatus[] = ["in_progress", "in_review", "todo", "done", "cancelled"]

export default function IssuesPage() {
  const [search,         setSearch]         = useState("")
  const [filterStatus,   setFilterStatus]   = useState<FilterStatus>("all")
  const [filterPriority, setFilterPriority] = useState<FilterPriority>("all")
  const [groupBy,        setGroupBy]        = useState<GroupBy>("status")

  const filtered = useMemo(() => {
    let list = MOCK_ISSUES
    if (filterStatus   !== "all") list = list.filter((i) => i.status   === filterStatus)
    if (filterPriority !== "all") list = list.filter((i) => i.priority === filterPriority)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((i) =>
        i.title.toLowerCase().includes(q) ||
        i.identifier.toLowerCase().includes(q) ||
        i.project.name.toLowerCase().includes(q)
      )
    }
    return list
  }, [search, filterStatus, filterPriority])

  const grouped = useMemo(() => {
    if (groupBy === "status") {
      return STATUS_ORDER
        .map((status) => ({ key: status, issues: filtered.filter((i) => i.status === status) }))
        .filter((g) => g.issues.length > 0)
    }
    if (groupBy === "priority") {
      const order: IssuePriority[] = ["urgent", "high", "medium", "low", "none"]
      return order
        .map((p) => ({ key: p, issues: filtered.filter((i) => i.priority === p) }))
        .filter((g) => g.issues.length > 0)
    }
    // group by project
    const projectMap = new Map<string, Issue[]>()
    for (const issue of filtered) {
      const key = issue.project.id
      if (!projectMap.has(key)) projectMap.set(key, [])
      const bucket = projectMap.get(key)
      if (bucket) bucket.push(issue)
    }
    return Array.from(projectMap.entries()).map(([key, issues]) => ({ key, issues }))
  }, [filtered, groupBy])

  const openCount = filtered.filter((i) => i.status !== "done" && i.status !== "cancelled").length

  return (
    <div className="flex flex-col gap-0 w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Issues</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {openCount} open · {filtered.length} total
          </p>
        </div>
        <CreateIssueDialog>
          <Button size="sm" className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            New issue
          </Button>
        </CreateIssueDialog>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search issues…"
            className="pl-9 h-8 text-sm"
          />
        </div>

        {/* Status filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Filter className="h-3.5 w-3.5" />
              {filterStatus === "all" ? "Status" : STATUS_CONFIG[filterStatus]?.label}
              <ChevronDown className="h-3 w-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={() => setFilterStatus("all")}>All statuses</DropdownMenuItem>
            <DropdownMenuSeparator />
            {(Object.keys(STATUS_CONFIG) as IssueStatus[]).map((s) => (
              <DropdownMenuItem key={s} onClick={() => setFilterStatus(s)} className="gap-2">
                {STATUS_CONFIG[s].icon}{STATUS_CONFIG[s].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Priority filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />
              {filterPriority === "all" ? "Priority" : PRIORITY_CONFIG[filterPriority]?.label}
              <ChevronDown className="h-3 w-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={() => setFilterPriority("all")}>All priorities</DropdownMenuItem>
            <DropdownMenuSeparator />
            {(Object.keys(PRIORITY_CONFIG) as IssuePriority[]).map((p) => (
              <DropdownMenuItem key={p} onClick={() => setFilterPriority(p)} className="gap-2">
                {PRIORITY_CONFIG[p].icon}{PRIORITY_CONFIG[p].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        {/* Group by */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Group: {groupBy}
              <ChevronDown className="h-3 w-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setGroupBy("status")}   className={cn(groupBy === "status"   && "font-medium")}>Status</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setGroupBy("priority")} className={cn(groupBy === "priority" && "font-medium")}>Priority</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setGroupBy("project")}  className={cn(groupBy === "project"  && "font-medium")}>Project</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 pb-2 border-b border-border mb-4">
        <div className="w-5 shrink-0" />
        <div className="w-5 shrink-0" />
        <div className="w-16 shrink-0 text-xs text-muted-foreground font-medium">ID</div>
        <div className="flex-1 text-xs text-muted-foreground font-medium">Title</div>
        <div className="hidden lg:block w-28 shrink-0 text-xs text-muted-foreground font-medium">Labels</div>
        <div className="hidden md:block w-36 shrink-0 text-xs text-muted-foreground font-medium">Project</div>
        <div className="hidden sm:block w-20 shrink-0 text-right text-xs text-muted-foreground font-medium">Due</div>
        <div className="w-7 shrink-0" />
        <div className="w-6 shrink-0" />
      </div>

      {/* Issue groups */}
      {grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderKanban className="h-10 w-10 text-muted-foreground/30 mb-4" />
          <p className="text-base font-medium text-foreground">No issues found</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupBy === "status"
            ? grouped.map((g) => (
                <GroupedSection key={g.key} status={g.key as IssueStatus} issues={g.issues} />
              ))
            : grouped.map((g) => (
                <div key={g.key} className="border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-muted/30">
                    {groupBy === "priority"
                      ? PRIORITY_CONFIG[g.key as IssuePriority]?.icon
                      : <span className="text-base">{g.issues[0]?.project.emoji}</span>
                    }
                    <span className="text-sm font-medium text-foreground">
                      {groupBy === "priority"
                        ? PRIORITY_CONFIG[g.key as IssuePriority]?.label
                        : g.issues[0]?.project.name}
                    </span>
                    <Badge variant="outline" className="h-4 min-w-4 px-1.5 text-[10px] font-semibold ml-1">
                      {g.issues.length}
                    </Badge>
                  </div>
                  {g.issues.map((issue) => <IssueRow key={issue.id} issue={issue} />)}
                </div>
              ))
          }
        </div>
      )}
    </div>
  )
}
