"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  CircleDot, CheckCircle2, Clock, RefreshCw, FileText, Layers, Hash, CalendarDays,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { PageContainer, PageHeader } from "@/components/layout/page-shell"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { RefreshControl } from "@/components/ui/refresh-control"
import { IssueSheetLoader, type IssueSheetTarget } from "@/components/sheets/issue-sheet-loader"
import { cn } from "@/lib/utils"
import { useUserStore } from "@/lib/store/user-store"
import { pageService, type WorkspacePage } from "@/lib/api/page-service"
import { listMyIssues } from "@/lib/api/issue-service"
import { listWorkspaceCycles, type WorkspaceCycle } from "@/lib/api/cycle-service"
import type { IssueStatusCategory, IssuePriority as ApiPriority, Issue as ApiIssue } from "@/lib/api/issue-service"
import type { CycleStatus as ApiCycleStatus } from "@/lib/api/cycle-service"

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
  /** Timestamp brut pour le tri chronologique (l'affichage reste `dueDate`). */
  dueTs: number | null
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

/** Ordre logique pour le tri par priorité (urgent en tête). */
const PRIORITY_ORDER: Record<IssuePriority, number> = {
  urgent: 0, high: 1, medium: 2, low: 3, none: 4,
}

const STATUS_ICON: Record<IssueStatus, React.ReactNode> = {
  todo:        <CircleDot className="size-3.5 text-muted-foreground" />,
  in_progress: <RefreshCw className="size-3.5 text-blue-500" />,
  in_review:   <Clock className="size-3.5 text-amber-500" />,
  done:        <CheckCircle2 className="size-3.5 text-emerald-500" />,
  cancelled:   <CheckCircle2 className="size-3.5 text-muted-foreground" />,
}

const STATUS_LABEL: Record<IssueStatus, string> = {
  todo: "To do", in_progress: "In progress", in_review: "In review", done: "Done", cancelled: "Cancelled",
}

const CYCLE_STATUS: Record<CycleStatus, { label: string; dot: string }> = {
  active:    { label: "Active",    dot: "bg-emerald-500" },
  upcoming:  { label: "Upcoming",  dot: "bg-blue-500" },
  completed: { label: "Completed", dot: "bg-muted-foreground" },
}

// ─── Colonnes DataTable (partagées, triables) ────────────────────────────────

const ISSUE_COLUMNS: DataTableColumn<Issue>[] = [
  {
    key: "priority", header: "", align: "center", className: "w-10",
    render: (i) => <span className={cn("inline-block size-2 rounded-full", PRIORITY_DOT[i.priority])} title={i.priority} />,
    sortValue: (i) => PRIORITY_ORDER[i.priority],
  },
  {
    key: "status", header: "Status", icon: <CircleDot className="size-3" />, className: "w-28",
    render: (i) => (
      <span className="flex items-center gap-1.5">
        {STATUS_ICON[i.status]}
        <span className="hidden text-xs text-muted-foreground lg:inline">{STATUS_LABEL[i.status]}</span>
      </span>
    ),
    sortValue: (i) => i.status,
  },
  {
    key: "identifier", header: "ID", icon: <Hash className="size-3" />, className: "w-20",
    render: (i) => <span className="font-mono text-xs tabular-nums text-muted-foreground">{i.identifier}</span>,
    sortValue: (i) => i.identifier,
  },
  {
    key: "title", header: "Title",
    render: (i) => <span className="text-sm text-foreground">{i.title}</span>,
    sortValue: (i) => i.title.toLowerCase(),
  },
  {
    key: "project", header: "Project", icon: <Layers className="size-3" />, className: "hidden w-40 sm:table-cell",
    render: (i) => <span className="block truncate text-xs text-muted-foreground">{i.project}</span>,
    sortValue: (i) => i.project.toLowerCase(),
  },
  {
    key: "due", header: "Due", icon: <CalendarDays className="size-3" />, align: "right", className: "hidden w-24 md:table-cell",
    render: (i) => <span className="text-xs text-muted-foreground">{i.dueDate ?? "—"}</span>,
    sortValue: (i) => i.dueTs ?? Number.POSITIVE_INFINITY,
  },
]

const CYCLE_COLUMNS: DataTableColumn<Cycle>[] = [
  {
    key: "title", header: "Sprint", icon: <RefreshCw className="size-3" />,
    render: (c) => <span className="text-sm font-medium text-foreground">{c.title}</span>,
    sortValue: (c) => c.title.toLowerCase(),
  },
  {
    key: "project", header: "Project", icon: <Layers className="size-3" />, className: "hidden w-40 sm:table-cell",
    render: (c) => <span className="block truncate text-xs text-muted-foreground">{c.project}</span>,
    sortValue: (c) => c.project.toLowerCase(),
  },
  {
    key: "period", header: "Period", className: "hidden w-40 md:table-cell",
    render: (c) => <span className="text-xs text-muted-foreground">{c.startDate} → {c.endDate}</span>,
  },
  {
    key: "status", header: "Status", className: "w-28",
    render: (c) => {
      const sc = CYCLE_STATUS[c.status]
      return (
        <Badge variant="secondary" className="gap-1.5 font-normal text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", sc.dot)} /> {sc.label}
        </Badge>
      )
    },
    sortValue: (c) => c.status,
  },
  {
    key: "progress", header: "Progress", className: "hidden w-32 lg:table-cell",
    render: (c) => c.status === "upcoming"
      ? <span className="text-xs text-muted-foreground">—</span>
      : (
        <span className="flex items-center gap-2">
          <Progress value={c.progress} className="h-1.5 flex-1" />
          <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{c.progress}%</span>
        </span>
      ),
    sortValue: (c) => c.progress,
  },
  {
    key: "count", header: "Issues", align: "right", className: "hidden w-16 lg:table-cell",
    render: (c) => <span className="text-xs tabular-nums text-muted-foreground">{c.completedIssues}/{c.totalIssues}</span>,
    sortValue: (c) => c.totalIssues,
  },
]

const PAGE_COLUMNS: DataTableColumn<Page>[] = [
  {
    key: "title", header: "Page", icon: <FileText className="size-3" />,
    render: (p) => <span className="text-sm text-foreground">{p.title}</span>,
    sortValue: (p) => p.title.toLowerCase(),
  },
  {
    key: "project", header: "Project", icon: <Layers className="size-3" />, className: "hidden w-40 sm:table-cell",
    render: (p) => <span className="block truncate text-xs text-muted-foreground">{p.project}</span>,
    sortValue: (p) => p.project.toLowerCase(),
  },
  {
    key: "edited", header: "Last edited", align: "right", className: "w-40",
    render: (p) => (
      <span className="flex items-center justify-end gap-1.5">
        <Avatar className="size-5">
          <AvatarFallback className="text-[8px] font-semibold">{p.lastEditedByInitials}</AvatarFallback>
        </Avatar>
        <span className="text-xs text-muted-foreground">{p.lastEditedAt}</span>
      </span>
    ),
  },
]

// ─── Section (titre + compteur au-dessus d'une table) ────────────────────────

function QueueSection({ label, count, children }: Readonly<{ label: string; count: number; children: React.ReactNode }>) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>
      {children}
    </section>
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
    dueTs:      i.dueDate ? new Date(i.dueDate).getTime() : null,
    // Board + sheet ouverte (`?issue=`), plutôt que la page détail isolée.
    url:        `${baseUrl}/projects/${i.projectId}?issue=${i.id}`,
  }
}

function mapWorkspaceCycle({ cycle: c, projectId, projectName }: WorkspaceCycle, baseUrl: string): Cycle {
  const daysLeftMs = c.endDate ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000) : null
  return {
    id:              String(c.id),
    title:           c.name,
    project:         projectName,
    projectId:       String(projectId),
    status:          CYCLE_STATUS_MAP[c.status],
    progress:        0,
    totalIssues:     c.issueCount,
    completedIssues: 0,
    startDate:       c.startDate ? new Date(c.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—",
    endDate:         c.endDate   ? new Date(c.endDate).toLocaleDateString("en-US",   { month: "short", day: "numeric" }) : "—",
    daysLeft:        daysLeftMs !== null && daysLeftMs > 0 ? daysLeftMs : null,
    url:             `${baseUrl}/projects/${projectId}/cycles/${c.id}`,
  }
}

function mapWorkspacePage({ page: p, projectId, projectName }: WorkspacePage, baseUrl: string): Page {
  return {
    id:                   String(p.id),
    title:                p.title,
    project:              projectName,
    projectId:            String(projectId),
    lastEditedAt:         new Date(p.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    lastEditedBy:         p.createdByName,
    lastEditedByInitials: p.createdByInitials,
    url:                  `${baseUrl}/projects/${projectId}/pages/${p.id}`,
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MyWorkViewProps {
  readonly defaultTab?: MyWorkTab
}

type QueueTab = "all" | "issues" | "sprints" | "pages"

export function MyWorkView({ defaultTab }: MyWorkViewProps) {
  const router = useRouter()

  const initialTab: QueueTab =
    defaultTab === "cycles" ? "sprints" : defaultTab === "issues" ? "issues" : defaultTab === "pages" ? "pages" : "all"
  const [tab, setTab] = useState<QueueTab>(initialTab)

  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""

  const { user, fetchMe } = useUserStore()

  const [myIssues, setMyIssues] = useState<Issue[]>([])
  const [myCycles, setMyCycles] = useState<Cycle[]>([])
  const [myPages, setMyPages] = useState<Page[]>([])
  const [sheetTarget, setSheetTarget] = useState<IssueSheetTarget | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    fetchMe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!slug || !user) return
    const baseUrl = `/${slug}`

    async function load() {
      // Trois appels agrégés, quel que soit le nombre de projets. Auparavant : `3 + 2N`
      // (un appel cycles + un appel pages PAR projet), ce qui vidait le quota de rate limiting
      // en quelques navigations et donnait une application figée.
      //
      // Mode tolérant conservé : une section en échec (droits, indispo ponctuelle) ne doit pas
      // faire tomber toute la vue — `allSettled`, on ne garde que les succès.
      const [issuesRes, cyclesRes, pagesRes] = await Promise.allSettled([
        listMyIssues(slug),
        listWorkspaceCycles(slug),
        pageService.listWorkspaceRecent(slug),
      ])

      if (issuesRes.status === "fulfilled") setMyIssues(issuesRes.value.map((i) => mapMyIssue(i, baseUrl)))
      if (cyclesRes.status === "fulfilled") setMyCycles(cyclesRes.value.map((c) => mapWorkspaceCycle(c, baseUrl)))
      if (pagesRes.status  === "fulfilled") setMyPages(pagesRes.value.map((p) => mapWorkspacePage(p, baseUrl)))

      // Horodaté APRÈS les appels : c'est l'heure de l'état affiché, pas celle de la demande.
      setLastSyncAt(Date.now())

      const failed = [issuesRes, cyclesRes, pagesRes].filter((r) => r.status === "rejected")
      if (failed.length > 0) console.warn("My Queue: partial load", failed)
    }
    void load()
  // Dépendance sur l'id (primitif) et non sur l'objet `user` : `fetchMe` en renvoie une nouvelle
  // référence à chaque appel, ce qui relançait le chargement complet à chaque fois.
  // `refreshToken` : incrémenté par le bouton Refresh pour rejouer le même effet.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user?.id, refreshToken])


  return (
    <PageContainer>
      <PageHeader
        title="My Queue"
        description="Issues, sprints, and pages assigned to or recently edited by you"
        actions={
          <RefreshControl
            lastSyncAt={lastSyncAt}
            onRefresh={async () => { setRefreshToken((n) => n + 1) }}
          />
        }
      />

      {/* Onglets de tri (All / Issues / Sprints / Pages) — QA2-23 */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as QueueTab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="issues" className="gap-1.5">Issues<span className="text-muted-foreground">{myIssues.length}</span></TabsTrigger>
          {/* Compteur = nombre de lignes affichées, comme les deux autres onglets. Il montrait le
              nombre de sprints ACTIFS alors que la table les liste tous : « Sprints 2 » au-dessus
              d'une liste de 12. */}
          <TabsTrigger value="sprints" className="gap-1.5">Sprints<span className="text-muted-foreground">{myCycles.length}</span></TabsTrigger>
          <TabsTrigger value="pages" className="gap-1.5">Pages<span className="text-muted-foreground">{myPages.length}</span></TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Tables homogènes (DataTable : tri + pagination paramétrable) */}
      <div className="space-y-6">
        {(tab === "all" || tab === "issues") && (
          <QueueSection label="Issues" count={myIssues.length}>
            <DataTable
              columns={ISSUE_COLUMNS}
              data={myIssues}
              rowKey={(i) => i.id}
              // Une issue est une entité qu'on consulte/édite : sheet en place, la file reste derrière.
              onRowClick={(i) => setSheetTarget({ projectId: Number(i.projectId), issueId: Number(i.id) })}
              emptyMessage="No open issues assigned to you."
            />
          </QueueSection>
        )}
        {(tab === "all" || tab === "sprints") && (
          <QueueSection label="Sprints" count={myCycles.length}>
            <DataTable
              columns={CYCLE_COLUMNS}
              data={myCycles}
              rowKey={(c) => c.id}
              onRowClick={(c) => router.push(c.url)}
              emptyMessage="No sprints in your projects."
            />
          </QueueSection>
        )}
        {(tab === "all" || tab === "pages") && (
          <QueueSection label="Pages" count={myPages.length}>
            <DataTable
              columns={PAGE_COLUMNS}
              data={myPages}
              rowKey={(p) => p.id}
              onRowClick={(p) => router.push(p.url)}
              emptyMessage="No recent pages."
            />
          </QueueSection>
        )}
      </div>

      {/* Sheet ouvert en place depuis la file (Sprints et Pages restent des redirections :
          ce sont des contextes avec leur propre navigation). */}
      {slug && (
        <IssueSheetLoader
          slug={slug}
          target={sheetTarget}
          onClose={() => setSheetTarget(null)}
        />
      )}
    </PageContainer>
  )
}
