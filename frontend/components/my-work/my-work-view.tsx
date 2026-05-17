"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  CircleDot, CheckCircle2, Clock, AlertTriangle,
  RefreshCw, FileText, ArrowUpRight, Layers,
} from "lucide-react"

import { useTranslation } from "@/lib/i18n"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export type MyWorkTab = "issues" | "cycles" | "pages"

type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"
type IssueStatus   = "todo" | "in_progress" | "in_review" | "done" | "cancelled"
type CycleStatus   = "active" | "upcoming" | "completed"

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

// ─── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_ISSUES: Issue[] = [
  { id: "1", identifier: "TF-43", title: "Fix login screen crash on iOS 17",           priority: "urgent", status: "in_progress", project: "Mobile App",       projectId: "2", dueDate: "Today",     url: "/projects/2/issues/43" },
  { id: "2", identifier: "TF-41", title: "Update hero section copy",                   priority: "high",   status: "todo",        project: "Website Redesign", projectId: "1", dueDate: "Tomorrow",  url: "/projects/1/issues/41" },
  { id: "3", identifier: "TF-38", title: "Implement push notification service",        priority: "high",   status: "in_review",   project: "Mobile App",       projectId: "2", dueDate: "Mar 29",    url: "/projects/2/issues/38" },
  { id: "4", identifier: "TF-35", title: "Dark mode inconsistencies in dashboard",     priority: "medium", status: "todo",        project: "Website Redesign", projectId: "1", dueDate: "Overdue",   url: "/projects/1/issues/35" },
  { id: "5", identifier: "TF-29", title: "API rate limiting — implement token bucket", priority: "high",   status: "in_progress", project: "API v2",           projectId: "3", dueDate: "Apr 2",     url: "/projects/1/issues/29" },
  { id: "6", identifier: "TF-61", title: "Profile settings page — avatar upload",      priority: "medium", status: "todo",        project: "Mobile App",       projectId: "2", dueDate: null,        url: "/projects/2/issues/61" },
]

const MOCK_CYCLES: Cycle[] = [
  { id: "1", title: "Sprint 4 — Mobile hardening",    project: "Mobile App", projectId: "2", status: "active",    progress: 62,  totalIssues: 14, completedIssues: 9, startDate: "Mar 24", endDate: "Apr 4",  daysLeft: 6,    url: "/projects/2/cycles/1" },
  { id: "2", title: "Sprint 3 — API foundations",     project: "API v2",     projectId: "3", status: "active",    progress: 45,  totalIssues: 11, completedIssues: 5, startDate: "Mar 20", endDate: "Apr 2",  daysLeft: 4,    url: "/projects/3/cycles/2" },
  { id: "3", title: "Sprint 5 — Onboarding flow",     project: "Mobile App", projectId: "2", status: "upcoming",  progress: 0,   totalIssues: 0,  completedIssues: 0, startDate: "Apr 7",  endDate: "Apr 18", daysLeft: null, url: "/projects/2/cycles/3" },
  { id: "4", title: "Sprint 2 — Auth & security",     project: "API v2",     projectId: "3", status: "completed", progress: 100, totalIssues: 9,  completedIssues: 9, startDate: "Mar 3",  endDate: "Mar 14", daysLeft: null, url: "/projects/3/cycles/4" },
]

const MOCK_PAGES: Page[] = [
  { id: "1", title: "Architecture Decision Records — Auth Service",  project: "API v2",     projectId: "3", lastEditedAt: "2 hours ago", lastEditedBy: "You",           lastEditedByInitials: "ME", lastEditedByColor: "#8b5cf6", url: "/projects/3/pages/1" },
  { id: "2", title: "Mobile App — Design System Guidelines",         project: "Mobile App", projectId: "2", lastEditedAt: "Yesterday",   lastEditedBy: "Sophie Martin", lastEditedByInitials: "SM", lastEditedByColor: "#8b5cf6", url: "/projects/2/pages/2" },
  { id: "3", title: "Sprint 4 — Team retrospective notes",           project: "Mobile App", projectId: "2", lastEditedAt: "3 days ago",  lastEditedBy: "You",           lastEditedByInitials: "ME", lastEditedByColor: "#8b5cf6", url: "/projects/2/pages/3" },
  { id: "4", title: "API v2 — Rate limiting strategy",               project: "API v2",     projectId: "3", lastEditedAt: "Last week",   lastEditedBy: "Thomas Bernard",lastEditedByInitials: "TB", lastEditedByColor: "#f97316", url: "/projects/3/pages/4" },
]

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<IssuePriority, string> = {
  urgent: "#f87171",
  high:   "#fb923c",
  medium: "#fbbf24",
  low:    "var(--label-quaternary)",
  none:   "var(--fill-primary)",
}

const STATUS_CONFIG: Record<IssueStatus, { icon: React.ReactNode; color: string }> = {
  todo:        { icon: <CircleDot  className="size-3.5" />, color: "var(--label-quaternary)" },
  in_progress: { icon: <RefreshCw  className="size-3.5" />, color: "#60a5fa" },
  in_review:   { icon: <Clock      className="size-3.5" />, color: "#fbbf24" },
  done:        { icon: <CheckCircle2 className="size-3.5" />, color: "#34d399" },
  cancelled:   { icon: <CheckCircle2 className="size-3.5" />, color: "var(--label-quaternary)" },
}

const CYCLE_STATUS: Record<CycleStatus, { label: string; color: string; bg: string }> = {
  active:    { label: "Active",    color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  upcoming:  { label: "Upcoming",  color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  completed: { label: "Completed", color: "var(--label-tertiary)", bg: "var(--fill-secondary)" },
}

function useTabHref(): Record<MyWorkTab, string> {
  const params = useParams()
  const ws = params?.workspace as string | undefined
  const base = ws ? `/${ws}` : ""
  return {
    issues: `${base}/my-work/issues`,
    cycles: `${base}/my-work/cycles`,
    pages:  `${base}/my-work/pages`,
  }
}

// ─── Row components ───────────────────────────────────────────────────────────

function IssueRow({ issue, index }: { issue: Issue; index: number }) {
  const sc = STATUS_CONFIG[issue.status]
  const isOverdue = issue.dueDate === "Overdue"

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: index * 0.04 }}
    >
      <Link
        href={issue.url}
        className="group flex items-center gap-3 px-4 py-2.5 transition-colors"
        style={{ borderBottom: "1px solid var(--separator)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--fill-tertiary)" }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
      >
        {/* Priority dot */}
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: PRIORITY_DOT[issue.priority] }} />

        {/* Status icon */}
        <span className="shrink-0" style={{ color: sc.color }}>
          {sc.icon}
        </span>

        {/* Identifier */}
        <span
          className="text-[10px] shrink-0 w-12 tabular-nums"
          style={{ color: "var(--label-quaternary)", fontFamily: "var(--font-mono)" }}
        >
          {issue.identifier}
        </span>

        {/* Title */}
        <span className="flex-1 text-sm truncate" style={{ color: "var(--label-primary)" }}>
          {issue.title}
        </span>

        {/* Project */}
        <span
          className="hidden sm:flex items-center gap-1 text-[11px] shrink-0"
          style={{ color: "var(--label-tertiary)" }}
        >
          <Layers className="size-3" />
          {issue.project}
        </span>

        {/* Due date */}
        <span
          className={cn("text-[11px] shrink-0 hidden md:flex items-center gap-1")}
          style={{ color: isOverdue ? "#f87171" : "var(--label-quaternary)" }}
        >
          {isOverdue && <AlertTriangle className="size-3" />}
          {issue.dueDate ?? "—"}
        </span>

        <ArrowUpRight className="size-3.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" style={{ color: "var(--label-secondary)" }} />
      </Link>
    </motion.div>
  )
}

function CycleRow({ cycle, index }: { cycle: Cycle; index: number }) {
  const sc = CYCLE_STATUS[cycle.status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: index * 0.04 }}
    >
      <Link
        href={cycle.url}
        className="group flex items-center gap-3 px-4 py-3 transition-colors"
        style={{ borderBottom: "1px solid var(--separator)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--fill-tertiary)" }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
      >
        {/* Icon */}
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: sc.bg }}
        >
          <RefreshCw className="size-3.5" style={{ color: sc.color }} />
        </div>

        {/* Meta */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--label-primary)" }}>
            {cycle.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px]" style={{ color: "var(--label-quaternary)" }}>
              {cycle.project}
            </span>
            <span style={{ color: "var(--label-quaternary)" }}>·</span>
            <span className="text-[10px]" style={{ color: "var(--label-quaternary)" }}>
              {cycle.startDate} → {cycle.endDate}
            </span>
            {cycle.daysLeft !== null && (
              <>
                <span style={{ color: "var(--label-quaternary)" }}>·</span>
                <span className="text-[10px] font-medium" style={{ color: "#fbbf24" }}>
                  {cycle.daysLeft}d left
                </span>
              </>
            )}
          </div>
        </div>

        {/* Status chip */}
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0 hidden sm:block"
          style={{ background: sc.bg, color: sc.color }}
        >
          {sc.label}
        </span>

        {/* Progress */}
        {cycle.status !== "upcoming" && (
          <div className="flex items-center gap-2 shrink-0 w-28 hidden md:flex">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--fill-secondary)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${cycle.progress}%`,
                  background: cycle.progress === 100 ? "#34d399" : "#a78bfa",
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums w-8 text-right" style={{ color: "var(--label-quaternary)" }}>
              {cycle.progress}%
            </span>
          </div>
        )}

        {/* Issues count */}
        <span className="text-[11px] shrink-0 hidden lg:block" style={{ color: "var(--label-quaternary)" }}>
          {cycle.completedIssues}/{cycle.totalIssues}
        </span>

        <ArrowUpRight className="size-3.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" style={{ color: "var(--label-secondary)" }} />
      </Link>
    </motion.div>
  )
}

function PageRow({ page, index }: { page: Page; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: index * 0.04 }}
    >
      <Link
        href={page.url}
        className="group flex items-center gap-3 px-4 py-2.5 transition-colors"
        style={{ borderBottom: "1px solid var(--separator)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--fill-tertiary)" }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
      >
        <FileText className="size-4 shrink-0" style={{ color: "var(--label-tertiary)" }} />

        <span className="flex-1 text-sm truncate" style={{ color: "var(--label-primary)" }}>
          {page.title}
        </span>

        <span className="hidden sm:flex items-center gap-1 text-[11px] shrink-0" style={{ color: "var(--label-tertiary)" }}>
          <Layers className="size-3" />
          {page.project}
        </span>

        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          <Avatar className="h-5 w-5">
            <AvatarFallback
              className="text-[8px] font-semibold"
              style={{
                background: `${page.lastEditedByColor}22`,
                color: page.lastEditedByColor,
              }}
            >
              {page.lastEditedByInitials}
            </AvatarFallback>
          </Avatar>
          <span className="text-[10px]" style={{ color: "var(--label-quaternary)" }}>
            {page.lastEditedAt}
          </span>
        </div>

        <ArrowUpRight className="size-3.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" style={{ color: "var(--label-secondary)" }} />
      </Link>
    </motion.div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: MyWorkTab }) {
  const cfg: Record<MyWorkTab, { icon: React.ElementType; title: string; sub: string }> = {
    issues: { icon: CircleDot,  title: "No open issues",  sub: "Issues assigned to you will appear here." },
    cycles: { icon: RefreshCw,  title: "No active sprints", sub: "Your sprint memberships will appear here." },
    pages:  { icon: FileText,   title: "No recent pages",  sub: "Pages you've edited will appear here." },
  }
  const { icon: Icon, title, sub } = cfg[tab]

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-4" style={{ background: "var(--fill-secondary)" }}>
        <Icon className="size-5" style={{ color: "var(--label-tertiary)" }} />
      </div>
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--label-primary)" }}>{title}</p>
      <p className="text-xs" style={{ color: "var(--label-tertiary)" }}>{sub}</p>
    </div>
  )
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { key: MyWorkTab; icon: React.ElementType; label: string; count: number }[] = [
  { key: "issues", icon: CircleDot, label: "Issues",  count: MOCK_ISSUES.length },
  { key: "cycles", icon: RefreshCw, label: "Sprints", count: MOCK_CYCLES.filter((c) => c.status === "active").length },
  { key: "pages",  icon: FileText,  label: "Pages",   count: MOCK_PAGES.length },
]

// ─── Main component ───────────────────────────────────────────────────────────

interface MyWorkViewProps {
  defaultTab?: MyWorkTab
}

export function MyWorkView({ defaultTab = "issues" }: Readonly<MyWorkViewProps>) {
  const { t } = useTranslation()
  const TAB_HREF = useTabHref()
  const activeTab = defaultTab

  return (
    <div className="flex flex-col gap-0 max-w-4xl mx-auto w-full">

      {/* ── Header ── */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--label-primary)" }}>
          My Queue
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--label-tertiary)" }}>
          Issues, sprints, and pages assigned to or recently edited by you
        </p>
      </div>

      {/* ── Panel ── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--card)",
          border: "1px solid var(--separator)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, var(--shadow)",
          backdropFilter: "blur(16px) saturate(180%)",
          WebkitBackdropFilter: "blur(16px) saturate(180%)",
        }}
      >
        {/* Tab bar */}
        <div
          className="flex items-center overflow-x-auto"
          style={{ borderBottom: "1px solid var(--separator)", background: "var(--fill-tertiary)" }}
        >
          {TABS.map(({ key, icon: Icon, label, count }) => {
            const isActive = activeTab === key
            return (
              <Link
                key={key}
                href={TAB_HREF[key]}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px whitespace-nowrap"
                style={{
                  borderBottomColor: isActive ? "var(--label-primary)" : "transparent",
                  color: isActive ? "var(--label-primary)" : "var(--label-tertiary)",
                }}
              >
                <Icon className="size-3.5" />
                {label}
                {count > 0 && (
                  <span
                    className="h-4 min-w-4 px-1 rounded text-[9px] font-bold flex items-center justify-center"
                    style={{ background: "var(--fill-primary)", color: "var(--label-secondary)" }}
                  >
                    {count}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Column header — issues only */}
        {activeTab === "issues" && (
          <div
            className="flex items-center gap-3 px-4 py-1.5"
            style={{ borderBottom: "1px solid var(--separator)", background: "var(--fill-tertiary)" }}
          >
            <span className="w-2 shrink-0" />
            <span className="w-3.5 shrink-0" />
            <span className="w-12 text-[9px] font-semibold uppercase tracking-widest shrink-0" style={{ color: "var(--label-quaternary)" }}>ID</span>
            <span className="flex-1 text-[9px] font-semibold uppercase tracking-widest" style={{ color: "var(--label-quaternary)" }}>Task</span>
            <span className="hidden sm:block text-[9px] font-semibold uppercase tracking-widest shrink-0" style={{ color: "var(--label-quaternary)" }}>Operation</span>
            <span className="hidden md:block text-[9px] font-semibold uppercase tracking-widest shrink-0" style={{ color: "var(--label-quaternary)" }}>Due</span>
            <span className="w-3.5 shrink-0" />
          </div>
        )}

        {/* Content */}
        <div>
          {activeTab === "issues" && (
            MOCK_ISSUES.length === 0
              ? <EmptyState tab="issues" />
              : MOCK_ISSUES.map((issue, i) => <IssueRow key={issue.id} issue={issue} index={i} />)
          )}
          {activeTab === "cycles" && (
            MOCK_CYCLES.length === 0
              ? <EmptyState tab="cycles" />
              : MOCK_CYCLES.map((cycle, i) => <CycleRow key={cycle.id} cycle={cycle} index={i} />)
          )}
          {activeTab === "pages" && (
            MOCK_PAGES.length === 0
              ? <EmptyState tab="pages" />
              : MOCK_PAGES.map((page, i) => <PageRow key={page.id} page={page} index={i} />)
          )}
        </div>
      </div>
    </div>
  )
}
