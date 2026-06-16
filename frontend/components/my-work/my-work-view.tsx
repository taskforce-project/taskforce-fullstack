"use client"

import { useState, useEffect } from "react"
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
import { useProjectStore } from "@/lib/store/project-store"
import { useCycleStore } from "@/lib/store/cycle-store"
import { useUserStore } from "@/lib/store/user-store"
import { pageService, type PageSummary } from "@/lib/api/page-service"
import { listMyIssues } from "@/lib/api/issue-service"
import type { IssueStatusCategory, IssuePriority as ApiPriority, Issue as ApiIssue } from "@/lib/api/issue-service"
import type { CycleStatus as ApiCycleStatus, Cycle as ApiCycle } from "@/lib/api/cycle-service"

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

// ─── Mapping helpers ──────────────────────────────────────────────────────────

const STATUS_MAP: Record<IssueStatusCategory, IssueStatus> = {
  BACKLOG:   "todo",
  UNSTARTED: "todo",
  STARTED:   "in_progress",
  COMPLETED: "done",
  CANCELLED: "cancelled",
}

const PRIORITY_MAP: Record<ApiPriority, IssuePriority> = {
  NONE:   "none",
  URGENT: "urgent",
  HIGH:   "high",
  MEDIUM: "medium",
  LOW:    "low",
}

const CYCLE_STATUS_MAP: Record<ApiCycleStatus, CycleStatus> = {
  ACTIVE:    "active",
  DRAFT:     "upcoming",
  COMPLETED: "completed",
}

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

function IssueRow({ issue, index }: Readonly<{ issue: Issue; index: number }>) {
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

function CycleRow({ cycle, index }: Readonly<{ cycle: Cycle; index: number }>) {
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
          <div className="items-center gap-2 shrink-0 w-28 hidden md:flex">
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

function PageRow({ page, index }: Readonly<{ page: Page; index: number }>) {
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

function EmptyState({ tab }: Readonly<{ tab: MyWorkTab }>) {
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

import type { Project } from "@/lib/api/project-service"

function mapMyIssue(i: ApiIssue, baseUrl: string): Issue {
  return {
    id:         String(i.id),
    identifier: i.identifier,
    title:      i.title,
    priority:   PRIORITY_MAP[i.priority],
    status:     STATUS_MAP[i.status.category],
    project:    i.projectName,
    projectId:  String(i.projectId),
    dueDate:    i.dueDate ? new Date(i.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null,
    url:        `${baseUrl}/projects/${i.projectId}/issues/${i.id}`,
  }
}

function mapApiCycle(c: ApiCycle, proj: Project, baseUrl: string): Cycle {
  const daysLeftMs = c.endDate ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000) : null
  return {
    id:              String(c.id),
    title:           c.name,
    project:         proj.name,
    projectId:       String(proj.id),
    status:          CYCLE_STATUS_MAP[c.status],
    progress:        0,
    totalIssues:     c.issueCount,
    completedIssues: 0,
    startDate:       c.startDate ? new Date(c.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—",
    endDate:         c.endDate   ? new Date(c.endDate).toLocaleDateString("en-US",   { month: "short", day: "numeric" }) : "—",
    daysLeft:        daysLeftMs !== null && daysLeftMs > 0 ? daysLeftMs : null,
    url:             `${baseUrl}/projects/${proj.id}/cycles/${c.id}`,
  }
}

function flattenCycles(results: { proj: Project; cycles: ApiCycle[] }[], baseUrl: string): Cycle[] {
  return results.flatMap(({ proj, cycles }) => cycles.map((c) => mapApiCycle(c, proj, baseUrl)))
}

function mapApiPage(p: PageSummary, proj: Project, baseUrl: string): Page {
  return {
    id:                   String(p.id),
    title:                p.title,
    project:              proj.name,
    projectId:            String(proj.id),
    lastEditedAt:         new Date(p.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    lastEditedBy:         p.createdByName,
    lastEditedByInitials: p.createdByInitials,
    lastEditedByColor:    "#a78bfa",
    url:                  `${baseUrl}/projects/${proj.id}/pages/${p.id}`,
  }
}

function flattenPages(results: { proj: Project; pages: PageSummary[] }[], baseUrl: string): Page[] {
  return results.flatMap(({ proj, pages }) => pages.map((p) => mapApiPage(p, proj, baseUrl)))
}

const TAB_KEYS: { key: MyWorkTab; icon: React.ElementType; label: string }[] = [
  { key: "issues", icon: CircleDot, label: "Issues"  },
  { key: "cycles", icon: RefreshCw, label: "Sprints" },
  { key: "pages",  icon: FileText,  label: "Pages"   },
]

// ─── Main component ───────────────────────────────────────────────────────────

interface MyWorkViewProps {
  defaultTab?: MyWorkTab
}

export function MyWorkView({ defaultTab = "issues" }: Readonly<MyWorkViewProps>) {
  useTranslation()
  const TAB_HREF = useTabHref()
  const activeTab = defaultTab

  const params = useParams()
  const slug   = typeof params?.workspace === "string" ? params.workspace : ""

  const { user, fetchMe }           = useUserStore()
  const { fetchProjects }           = useProjectStore()
  const { fetchCycles }             = useCycleStore()

  const [myIssues, setMyIssues] = useState<Issue[]>([])
  const [myCycles, setMyCycles] = useState<Cycle[]>([])
  const [myPages,  setMyPages]  = useState<Page[]>([])

  useEffect(() => {
    fetchMe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!slug || !user) return
    const baseUrl = `/${slug}`

    async function load() {
      // Issues : un seul appel cross-projets (mes issues assignées) — plus de N+1
      const [myIssuesRaw, projs] = await Promise.all([
        listMyIssues(slug),
        fetchProjects(slug),
      ])
      setMyIssues(myIssuesRaw.map((i) => mapMyIssue(i, baseUrl)))

      // Cycles & pages restent agrégés par projet
      const [cycleResults, pageResults] = await Promise.all([
        Promise.all(projs.map(async (p) => ({ proj: p, cycles: await fetchCycles(slug, p.id) }))),
        Promise.all(projs.map(async (p) => ({ proj: p, pages: await pageService.list(slug, String(p.id)) }))),
      ])

      setMyCycles(flattenCycles(cycleResults, baseUrl))
      setMyPages(flattenPages(pageResults, baseUrl))
    }

    void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user])

  function tabCount(key: MyWorkTab): number {
    if (key === "issues") return myIssues.length
    if (key === "cycles") return myCycles.filter((c) => c.status === "active").length
    if (key === "pages")  return myPages.length
    return 0
  }
  const TABS = TAB_KEYS.map((tk) => ({ ...tk, count: tabCount(tk.key) }))

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
            myIssues.length === 0
              ? <EmptyState tab="issues" />
              : myIssues.map((issue, i) => <IssueRow key={issue.id} issue={issue} index={i} />)
          )}
          {activeTab === "cycles" && (
            myCycles.length === 0
              ? <EmptyState tab="cycles" />
              : myCycles.map((cycle, i) => <CycleRow key={cycle.id} cycle={cycle} index={i} />)
          )}
          {activeTab === "pages" && (
            myPages.length === 0
              ? <EmptyState tab="pages" />
              : myPages.map((page, i) => <PageRow key={page.id} page={page} index={i} />)
          )}
        </div>
      </div>
    </div>
  )
}
