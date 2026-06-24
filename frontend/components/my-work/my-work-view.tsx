"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  CircleDot, CheckCircle2, Clock, AlertTriangle,
  RefreshCw, FileText, ArrowUpRight, Layers,
} from "lucide-react"

import { useTranslation } from "@/lib/i18n"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { SectionCard, CardSubSection } from "@/components/ui/section-card"
import { PageContainer, PageHeader } from "@/components/layout/page-shell"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useProjectStore } from "@/lib/store/project-store"
import { useCycleStore } from "@/lib/store/cycle-store"
import { useUserStore } from "@/lib/store/user-store"
import { pageService, type PageSummary } from "@/lib/api/page-service"
import { listMyIssues } from "@/lib/api/issue-service"
import type { IssueStatusCategory, IssuePriority as ApiPriority, Issue as ApiIssue } from "@/lib/api/issue-service"
import type { CycleStatus as ApiCycleStatus, Cycle as ApiCycle } from "@/lib/api/cycle-service"
import type { Project } from "@/lib/api/project-service"

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
  url: string
}

// ─── API → local mapping ────────────────────────────────────────────────────

const STATUS_MAP: Record<IssueStatusCategory, IssueStatus> = {
  BACKLOG:   "todo",
  UNSTARTED: "todo",
  STARTED:   "in_progress",
  COMPLETED: "done",
  CANCELLED: "cancelled",
}

const PRIORITY_MAP: Record<ApiPriority, IssuePriority> = {
  NONE: "none", URGENT: "urgent", HIGH: "high", MEDIUM: "medium", LOW: "low",
}

const CYCLE_STATUS_MAP: Record<ApiCycleStatus, CycleStatus> = {
  ACTIVE: "active", DRAFT: "upcoming", COMPLETED: "completed",
}

// ─── Presentation config (Tailwind utilities only) ───────────────────────────

const PRIORITY_DOT: Record<IssuePriority, string> = {
  urgent: "bg-rose-500",
  high:   "bg-orange-500",
  medium: "bg-amber-500",
  low:    "bg-muted-foreground/40",
  none:   "bg-muted-foreground/20",
}

const STATUS_ICON: Record<IssueStatus, React.ReactNode> = {
  todo:        <CircleDot className="size-3.5 text-muted-foreground" />,
  in_progress: <RefreshCw className="size-3.5 text-blue-500" />,
  in_review:   <Clock className="size-3.5 text-amber-500" />,
  done:        <CheckCircle2 className="size-3.5 text-emerald-500" />,
  cancelled:   <CheckCircle2 className="size-3.5 text-muted-foreground" />,
}

const CYCLE_STATUS: Record<CycleStatus, { label: string; dot: string }> = {
  active:    { label: "Active",    dot: "bg-emerald-500" },
  upcoming:  { label: "Upcoming",  dot: "bg-blue-500" },
  completed: { label: "Completed", dot: "bg-muted-foreground" },
}

const ROW = "group flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 transition-colors"

// ─── Rows ──────────────────────────────────────────────────────────────────

function IssueRow({ issue }: Readonly<{ issue: Issue }>) {
  const isOverdue = issue.dueDate === "Overdue"
  return (
    <Link href={issue.url} className={ROW}>
      <span className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT[issue.priority])} />
      <span className="shrink-0">{STATUS_ICON[issue.status]}</span>
      <span className="w-14 shrink-0 truncate font-mono text-xs tabular-nums text-muted-foreground">{issue.identifier}</span>
      <span className="flex-1 truncate text-sm text-foreground">{issue.title}</span>
      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
        <Layers className="size-3" /> {issue.project}
      </span>
      <span className={cn("hidden items-center gap-1 text-xs md:flex", isOverdue ? "text-rose-500" : "text-muted-foreground")}>
        {isOverdue && <AlertTriangle className="size-3" />} {issue.dueDate ?? "—"}
      </span>
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
    </Link>
  )
}

function CycleRow({ cycle }: Readonly<{ cycle: Cycle }>) {
  const sc = CYCLE_STATUS[cycle.status]
  return (
    <Link href={cycle.url} className={cn(ROW, "py-3")}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <RefreshCw className="size-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{cycle.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{cycle.project}</span>
          <span>·</span>
          <span>{cycle.startDate} → {cycle.endDate}</span>
          {cycle.daysLeft !== null && (
            <>
              <span>·</span>
              <span className="font-medium text-amber-500">{cycle.daysLeft}d left</span>
            </>
          )}
        </div>
      </div>
      <Badge variant="secondary" className="hidden gap-1.5 font-normal text-muted-foreground sm:flex">
        <span className={cn("size-1.5 rounded-full", sc.dot)} /> {sc.label}
      </Badge>
      {cycle.status !== "upcoming" && (
        <div className="hidden w-28 items-center gap-2 md:flex">
          <Progress value={cycle.progress} className="h-1.5 flex-1" />
          <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{cycle.progress}%</span>
        </div>
      )}
      <span className="hidden shrink-0 text-xs text-muted-foreground lg:block">{cycle.completedIssues}/{cycle.totalIssues}</span>
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
    </Link>
  )
}

function PageRow({ page }: Readonly<{ page: Page }>) {
  return (
    <Link href={page.url} className={ROW}>
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate text-sm text-foreground">{page.title}</span>
      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
        <Layers className="size-3" /> {page.project}
      </span>
      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        <Avatar className="size-5">
          <AvatarFallback className="text-[8px] font-semibold">{page.lastEditedByInitials}</AvatarFallback>
        </Avatar>
        <span className="text-xs text-muted-foreground">{page.lastEditedAt}</span>
      </div>
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
    </Link>
  )
}

// ─── Data mapping ─────────────────────────────────────────────────────────────

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
    url:                  `${baseUrl}/projects/${proj.id}/pages/${p.id}`,
  }
}

function flattenPages(results: { proj: Project; pages: PageSummary[] }[], baseUrl: string): Page[] {
  return results.flatMap(({ proj, pages }) => pages.map((p) => mapApiPage(p, proj, baseUrl)))
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MyWorkViewProps {
  readonly defaultTab?: MyWorkTab
}

type QueueTab = "all" | "issues" | "sprints" | "pages"

export function MyWorkView({ defaultTab }: MyWorkViewProps) {
  useTranslation()

  const initialTab: QueueTab =
    defaultTab === "cycles" ? "sprints" : defaultTab === "issues" ? "issues" : defaultTab === "pages" ? "pages" : "all"
  const [tab, setTab] = useState<QueueTab>(initialTab)

  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""

  const { user, fetchMe } = useUserStore()
  const { fetchProjects } = useProjectStore()
  const { fetchCycles } = useCycleStore()

  const [myIssues, setMyIssues] = useState<Issue[]>([])
  const [myCycles, setMyCycles] = useState<Cycle[]>([])
  const [myPages, setMyPages] = useState<Page[]>([])

  useEffect(() => {
    fetchMe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!slug || !user) return
    const baseUrl = `/${slug}`

    async function load() {
      // Issues : un seul appel cross-projets (mes issues assignées) — plus de N+1
      const [myIssuesRaw, projs] = await Promise.all([listMyIssues(slug), fetchProjects(slug)])
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

  const activeSprints = myCycles.filter((c) => c.status === "active").length

  return (
    <PageContainer>
      <PageHeader
        title="My Queue"
        description="Issues, sprints, and pages assigned to or recently edited by you"
      />

      {/* Onglets de tri (All / Issues / Sprints / Pages) — QA2-23 */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as QueueTab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="issues" className="gap-1.5">Issues<span className="text-muted-foreground">{myIssues.length}</span></TabsTrigger>
          <TabsTrigger value="sprints" className="gap-1.5">Sprints<span className="text-muted-foreground">{activeSprints}</span></TabsTrigger>
          <TabsTrigger value="pages" className="gap-1.5">Pages<span className="text-muted-foreground">{myPages.length}</span></TabsTrigger>
        </TabsList>
      </Tabs>

      <SectionCard title="My Queue" bodyClassName="p-0">
        {(tab === "all" || tab === "issues") && (
          <CardSubSection label="Issues" count={myIssues.length}>
            {myIssues.length === 0
              ? <p className="px-4 py-3 text-sm text-muted-foreground">Aucune tâche ouverte qui vous est assignée.</p>
              : myIssues.map((i) => <IssueRow key={i.id} issue={i} />)}
          </CardSubSection>
        )}
        {(tab === "all" || tab === "sprints") && (
          <CardSubSection label="Sprints" count={activeSprints}>
            {myCycles.length === 0
              ? <p className="px-4 py-3 text-sm text-muted-foreground">Aucun sprint actif.</p>
              : myCycles.map((c) => <CycleRow key={c.id} cycle={c} />)}
          </CardSubSection>
        )}
        {(tab === "all" || tab === "pages") && (
          <CardSubSection label="Pages" count={myPages.length}>
            {myPages.length === 0
              ? <p className="px-4 py-3 text-sm text-muted-foreground">Aucune page récente.</p>
              : myPages.map((p) => <PageRow key={p.id} page={p} />)}
          </CardSubSection>
        )}
      </SectionCard>
    </PageContainer>
  )
}
