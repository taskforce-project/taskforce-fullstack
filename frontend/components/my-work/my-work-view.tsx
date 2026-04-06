"use client"

import Link from "next/link"
import {
  CircleDot,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FolderKanban,
  RefreshCw,
  FileText,
  ArrowUpRight,
} from "lucide-react"

import { useTranslation } from "@/lib/i18n"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MyWorkTab = "issues" | "cycles" | "pages"

type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"
type IssueStatus = "todo" | "in_progress" | "in_review" | "done" | "cancelled"
type CycleStatus = "active" | "upcoming" | "completed"

interface Issue {
  id: string
  identifier: string
  title: string
  priority: IssuePriority
  status: IssueStatus
  project: string
  projectId: string
  dueDate: string | null
  url: string
}

interface Cycle {
  id: string
  title: string
  project: string
  projectId: string
  status: CycleStatus
  progress: number
  totalIssues: number
  completedIssues: number
  startDate: string
  endDate: string
  daysLeft: number | null
  url: string
}

interface Page {
  id: string
  title: string
  project: string
  projectId: string
  lastEditedAt: string
  lastEditedBy: string
  lastEditedByInitials: string
  lastEditedByColor: string
  url: string
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_ISSUES: Issue[] = [
  {
    id: "1",
    identifier: "TF-43",
    title: "Fix login screen crash on iOS 17",
    priority: "urgent",
    status: "in_progress",
    project: "Mobile App",
    projectId: "2",
    dueDate: "Today",
    url: "/projects/2/issues/43",
  },
  {
    id: "2",
    identifier: "TF-41",
    title: "Update hero section copy",
    priority: "high",
    status: "todo",
    project: "Website Redesign",
    projectId: "1",
    dueDate: "Tomorrow",
    url: "/projects/1/issues/41",
  },
  {
    id: "3",
    identifier: "TF-38",
    title: "Implement push notification service",
    priority: "high",
    status: "in_review",
    project: "Mobile App",
    projectId: "2",
    dueDate: "Mar 29",
    url: "/projects/2/issues/38",
  },
  {
    id: "4",
    identifier: "TF-35",
    title: "Dark mode inconsistencies in dashboard",
    priority: "medium",
    status: "todo",
    project: "Website Redesign",
    projectId: "1",
    dueDate: "Overdue",
    url: "/projects/1/issues/35",
  },
  {
    id: "5",
    identifier: "TF-29",
    title: "API rate limiting — implement token bucket",
    priority: "high",
    status: "in_progress",
    project: "API v2",
    projectId: "3",
    dueDate: "Apr 2",
    url: "/projects/1/issues/29",
  },
  {
    id: "6",
    identifier: "TF-61",
    title: "Profile settings page — avatar upload",
    priority: "medium",
    status: "todo",
    project: "Mobile App",
    projectId: "2",
    dueDate: null,
    url: "/projects/2/issues/61",
  },
]

const MOCK_CYCLES: Cycle[] = [
  {
    id: "1",
    title: "Sprint 4 — Mobile hardening",
    project: "Mobile App",
    projectId: "2",
    status: "active",
    progress: 62,
    totalIssues: 14,
    completedIssues: 9,
    startDate: "Mar 24",
    endDate: "Apr 4",
    daysLeft: 6,
    url: "/projects/2/cycles/1",
  },
  {
    id: "2",
    title: "Sprint 3 — API foundations",
    project: "API v2",
    projectId: "3",
    status: "active",
    progress: 45,
    totalIssues: 11,
    completedIssues: 5,
    startDate: "Mar 20",
    endDate: "Apr 2",
    daysLeft: 4,
    url: "/projects/3/cycles/2",
  },
  {
    id: "3",
    title: "Sprint 5 — Onboarding flow",
    project: "Mobile App",
    projectId: "2",
    status: "upcoming",
    progress: 0,
    totalIssues: 0,
    completedIssues: 0,
    startDate: "Apr 7",
    endDate: "Apr 18",
    daysLeft: null,
    url: "/projects/2/cycles/3",
  },
  {
    id: "4",
    title: "Sprint 2 — Auth & security",
    project: "API v2",
    projectId: "3",
    status: "completed",
    progress: 100,
    totalIssues: 9,
    completedIssues: 9,
    startDate: "Mar 3",
    endDate: "Mar 14",
    daysLeft: null,
    url: "/projects/3/cycles/4",
  },
]

const MOCK_PAGES: Page[] = [
  {
    id: "1",
    title: "Architecture Decision Records — Auth Service",
    project: "API v2",
    projectId: "3",
    lastEditedAt: "2 hours ago",
    lastEditedBy: "You",
    lastEditedByInitials: "ME",
    lastEditedByColor: "bg-primary",
    url: "/projects/3/pages/1",
  },
  {
    id: "2",
    title: "Mobile App — Design System Guidelines",
    project: "Mobile App",
    projectId: "2",
    lastEditedAt: "Yesterday",
    lastEditedBy: "Sophie Martin",
    lastEditedByInitials: "SM",
    lastEditedByColor: "bg-violet-500",
    url: "/projects/2/pages/2",
  },
  {
    id: "3",
    title: "Sprint 4 — Team retrospective notes",
    project: "Mobile App",
    projectId: "2",
    lastEditedAt: "3 days ago",
    lastEditedBy: "You",
    lastEditedByInitials: "ME",
    lastEditedByColor: "bg-primary",
    url: "/projects/2/pages/3",
  },
  {
    id: "4",
    title: "API v2 — Rate limiting strategy",
    project: "API v2",
    projectId: "3",
    lastEditedAt: "Last week",
    lastEditedBy: "Thomas Bernard",
    lastEditedByInitials: "TB",
    lastEditedByColor: "bg-orange-500",
    url: "/projects/3/pages/4",
  },
]

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRIORITY_CONFIG: Record<IssuePriority, { label: string; className: string; dotClass: string }> = {
  urgent: { label: "Urgent", className: "text-red-400", dotClass: "bg-red-400" },
  high: { label: "High", className: "text-orange-400", dotClass: "bg-orange-400" },
  medium: { label: "Medium", className: "text-yellow-400", dotClass: "bg-yellow-400" },
  low: { label: "Low", className: "text-slate-400", dotClass: "bg-slate-400" },
  none: { label: "None", className: "text-muted-foreground", dotClass: "bg-muted-foreground/30" },
}

const STATUS_CONFIG: Record<IssueStatus, { icon: React.ReactNode; label: string }> = {
  todo: { icon: <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />, label: "To Do" },
  in_progress: { icon: <RefreshCw className="h-3.5 w-3.5 text-blue-400" />, label: "In Progress" },
  in_review: { icon: <Clock className="h-3.5 w-3.5 text-yellow-400" />, label: "In Review" },
  done: { icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />, label: "Done" },
  cancelled: { icon: <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />, label: "Cancelled" },
}

const CYCLE_STATUS_CONFIG: Record<CycleStatus, { label: string; badgeClass: string }> = {
  active: { label: "Active", badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  upcoming: { label: "Upcoming", badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  completed: { label: "Completed", badgeClass: "bg-muted text-muted-foreground border-border" },
}

const TAB_HREF: Record<MyWorkTab, string> = {
  issues: "/my-work/issues",
  cycles: "/my-work/cycles",
  pages: "/my-work/pages",
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function IssueRow({ issue, t }: Readonly<{ issue: Issue; t: (k: string) => string }>) {
  const priority = PRIORITY_CONFIG[issue.priority]
  const status = STATUS_CONFIG[issue.status]
  const isOverdue = issue.dueDate === "Overdue"

  return (
    <Link
      href={issue.url}
      className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0"
    >
      <div className={cn("h-2 w-2 rounded-full shrink-0", priority.dotClass)} title={priority.label} />
      <div className="shrink-0">{status.icon}</div>
      <span className="text-xs text-muted-foreground font-mono shrink-0 w-12">{issue.identifier}</span>
      <span className="flex-1 text-sm text-foreground truncate group-hover:text-primary transition-colors">
        {issue.title}
      </span>
      <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground shrink-0">
        <FolderKanban className="h-3 w-3" />
        {issue.project}
      </span>
      <span
        className={cn(
          "text-xs shrink-0 hidden md:block",
          isOverdue ? "text-red-400 font-medium" : "text-muted-foreground"
        )}
      >
        {isOverdue ? <AlertTriangle className="h-3.5 w-3.5 inline mr-1" /> : null}
        {issue.dueDate ?? t("myWork.issues.noDue")}
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  )
}

function CycleCard({ cycle, t }: Readonly<{ cycle: Cycle; t: (k: string) => string }>) {
  const statusCfg = CYCLE_STATUS_CONFIG[cycle.status]

  return (
    <Link
      href={cycle.url}
      className="group flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0"
    >
      <div className="shrink-0 h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
        <RefreshCw className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
            {cycle.title}
          </span>
          <Badge variant="outline" className={cn("text-xs border px-1.5 py-0", statusCfg.badgeClass)}>
            {statusCfg.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <FolderKanban className="h-3 w-3" />
            {cycle.project}
          </span>
          <span className="text-xs text-muted-foreground/60">·</span>
          <span className="text-xs text-muted-foreground">
            {cycle.startDate} → {cycle.endDate}
          </span>
          {cycle.daysLeft !== null && (
            <>
              <span className="text-xs text-muted-foreground/60">·</span>
              <span className="text-xs text-amber-400">{cycle.daysLeft}d left</span>
            </>
          )}
        </div>
      </div>
      {cycle.status !== "upcoming" && (
        <div className="flex items-center gap-2 shrink-0 sm:w-36">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                cycle.progress === 100 ? "bg-emerald-500" : "bg-primary"
              )}
              style={{ width: `${cycle.progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-8 text-right">{cycle.progress}%</span>
        </div>
      )}
      <span className="text-xs text-muted-foreground shrink-0 hidden md:block">
        {cycle.completedIssues}/{cycle.totalIssues} {t("myWork.cycles.issues")}
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  )
}

function PageRow({ page, t }: Readonly<{ page: Page; t: (k: string) => string }>) {
  return (
    <Link
      href={page.url}
      className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0"
    >
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm text-foreground truncate group-hover:text-primary transition-colors">
        {page.title}
      </span>
      <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground shrink-0">
        <FolderKanban className="h-3 w-3" />
        {page.project}
      </span>
      <div className="hidden md:flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
        <Avatar className="h-5 w-5">
          <AvatarFallback className={cn("text-[9px] text-white", page.lastEditedByColor)}>
            {page.lastEditedByInitials}
          </AvatarFallback>
        </Avatar>
        <span>{t("myWork.pages.lastEdited")} {page.lastEditedAt}</span>
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  )
}

function EmptyState({ tab, t }: Readonly<{ tab: MyWorkTab; t: (k: string) => string }>) {
  const messages: Record<MyWorkTab, string> = {
    issues: t("myWork.empty.issues"),
    cycles: t("myWork.empty.cycles"),
    pages: t("myWork.empty.pages"),
  }
  const icons: Record<MyWorkTab, React.ReactNode> = {
    issues: <CircleDot className="h-6 w-6 text-muted-foreground/50" />,
    cycles: <RefreshCw className="h-6 w-6 text-muted-foreground/50" />,
    pages: <FileText className="h-6 w-6 text-muted-foreground/50" />,
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
        {icons[tab]}
      </div>
      <p className="text-base font-medium text-foreground">{messages[tab]}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("myWork.empty.description")}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tabs config
// ---------------------------------------------------------------------------

const TABS: { key: MyWorkTab; icon: React.ElementType; countFn: () => number }[] = [
  { key: "issues", icon: CircleDot, countFn: () => MOCK_ISSUES.length },
  { key: "cycles", icon: RefreshCw, countFn: () => MOCK_CYCLES.filter((c) => c.status === "active").length },
  { key: "pages", icon: FileText, countFn: () => MOCK_PAGES.length },
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface MyWorkViewProps {
  defaultTab?: MyWorkTab
}

export function MyWorkView({ defaultTab = "issues" }: Readonly<MyWorkViewProps>) {
  const { t } = useTranslation()
  const activeTab = defaultTab

  const tabLabelMap: Record<MyWorkTab, string> = {
    issues: t("myWork.tabs.issues"),
    cycles: t("myWork.tabs.cycles"),
    pages: t("myWork.tabs.pages"),
  }

  return (
    <div className="flex flex-col gap-0 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("myWork.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("myWork.subtitle")}</p>
      </div>

      {/* Panel */}
      <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
        {/* Tabs — URL-based navigation */}
        <div className="flex items-center border-b border-border bg-muted/30">
          {TABS.map(({ key, icon: Icon, countFn }) => {
            const count = countFn()
            const isActive = activeTab === key
            return (
              <Link
                key={key}
                href={TAB_HREF[key]}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 -mb-px",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="h-4 w-4" />
                {tabLabelMap[key]}
                {count > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-5 min-w-5 px-1.5 text-xs bg-muted text-muted-foreground border-0"
                  >
                    {count}
                  </Badge>
                )}
              </Link>
            )
          })}
        </div>

        {/* Content */}
        <div>
          {activeTab === "issues" && (
            <>
              <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-muted/20">
                <div className="w-2 shrink-0" />
                <div className="w-3.5 shrink-0" />
                <div className="w-12 shrink-0" />
                <span className="flex-1 text-xs text-muted-foreground">{t("myWork.issues.status")}</span>
                <span className="hidden sm:block text-xs text-muted-foreground w-24 text-right">{t("myWork.issues.project")}</span>
                <span className="hidden md:block text-xs text-muted-foreground w-24 text-right">{t("myWork.issues.dueDate")}</span>
                <div className="w-3.5 shrink-0" />
              </div>
              {MOCK_ISSUES.length === 0 ? (
                <EmptyState tab="issues" t={t} />
              ) : (
                MOCK_ISSUES.map((issue) => <IssueRow key={issue.id} issue={issue} t={t} />)
              )}
            </>
          )}

          {activeTab === "cycles" && (
            <>
              {MOCK_CYCLES.length === 0 ? (
                <EmptyState tab="cycles" t={t} />
              ) : (
                MOCK_CYCLES.map((cycle) => <CycleCard key={cycle.id} cycle={cycle} t={t} />)
              )}
            </>
          )}

          {activeTab === "pages" && (
            <>
              {MOCK_PAGES.length === 0 ? (
                <EmptyState tab="pages" t={t} />
              ) : (
                MOCK_PAGES.map((page) => <PageRow key={page.id} page={page} t={t} />)
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
