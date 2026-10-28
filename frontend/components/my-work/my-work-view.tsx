"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  CircleDot, CheckCircle2, Clock, RefreshCw, Layers, Hash, CalendarDays, Check, X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { PageContainer, PageHeader } from "@/components/layout/page-shell"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { RefreshControl } from "@/components/ui/refresh-control"
import { IssueSheetLoader, type IssueSheetTarget } from "@/components/sheets/issue-sheet-loader"
import { cn } from "@/lib/utils"
import { PRIORITY_DOT as DOT } from "@/lib/palette"
import { useUserStore } from "@/lib/store/user-store"
import { listMyIssues } from "@/lib/api/issue-service"
import { acceptAssignment, declineAssignment } from "@/lib/api/assignment-service"
import { listWorkspaceCycles, type WorkspaceCycle } from "@/lib/api/cycle-service"
import type { IssueStatusCategory, IssuePriority as ApiPriority, Issue as ApiIssue } from "@/lib/api/issue-service"
import type { CycleStatus as ApiCycleStatus } from "@/lib/api/cycle-service"
import { parseServerDate } from "@/lib/utils/server-date"

// ─── Types ────────────────────────────────────────────────────────────────────

export type MyWorkTab = "issues" | "cycles"

type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"
type IssueStatus   = "todo" | "in_progress" | "in_review" | "done" | "cancelled"
type CycleStatus   = "active" | "upcoming" | "completed"

interface Issue {
  id: string
  /** Id numérique (pour les appels API accept/decline). */
  issueId: number
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
  /** Acceptation de l'assignation : "PENDING" (à valider) | "ACCEPTED" | null. */
  assignmentStatus: "PENDING" | "ACCEPTED" | null
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
  urgent: DOT.URGENT,
  high:   DOT.HIGH,
  medium: DOT.MEDIUM,
  low:    DOT.LOW,
  none:   DOT.NONE,
}

/** Ordre logique pour le tri par priorité (urgent en tête). */
const PRIORITY_ORDER: Record<IssuePriority, number> = {
  urgent: 0, high: 1, medium: 2, low: 3, none: 4,
}

const STATUS_ICON: Record<IssueStatus, React.ReactNode> = {
  todo:        <CircleDot className="size-3.5 text-muted-foreground" />,
  in_progress: <RefreshCw className="size-3.5 text-ink-blue" />,
  in_review:   <Clock className="size-3.5 text-ink-yellow" />,
  done:        <CheckCircle2 className="size-3.5 text-ink-green" />,
  cancelled:   <CheckCircle2 className="size-3.5 text-muted-foreground" />,
}

const STATUS_LABEL: Record<IssueStatus, string> = {
  todo: "To do", in_progress: "In progress", in_review: "In review", done: "Done", cancelled: "Cancelled",
}

const CYCLE_STATUS: Record<CycleStatus, { label: string; dot: string }> = {
  active:    { label: "Active",    dot: "bg-shape-green" },
  upcoming:  { label: "Upcoming",  dot: "bg-primary" },
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
    render: (i) => <span className="text-xs text-muted-foreground">{i.dueDate ?? "-"}</span>,
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
      ? <span className="text-xs text-muted-foreground">-</span>
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
    issueId:    i.id,
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
    assignmentStatus: i.assignmentStatus,
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
    progress:        c.issueCount > 0 ? Math.round((c.completedCount / c.issueCount) * 100) : 0,
    totalIssues:     c.issueCount,
    completedIssues: c.completedCount,
    startDate:       c.startDate ? new Date(c.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-",
    endDate:         c.endDate   ? new Date(c.endDate).toLocaleDateString("en-US",   { month: "short", day: "numeric" }) : "-",
    daysLeft:        daysLeftMs !== null && daysLeftMs > 0 ? daysLeftMs : null,
    url:             `${baseUrl}/projects/${projectId}/cycles/${c.id}`,
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MyWorkViewProps {
  readonly defaultTab?: MyWorkTab
}

type QueueTab = "all" | "issues" | "sprints"

export function MyWorkView({ defaultTab }: MyWorkViewProps) {
  const router = useRouter()

  const initialTab: QueueTab =
    defaultTab === "cycles" ? "sprints" : defaultTab === "issues" ? "issues" : "all"
  const [tab, setTab] = useState<QueueTab>(initialTab)

  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""

  const { user, fetchMe } = useUserStore()

  const [myIssues, setMyIssues] = useState<Issue[]>([])
  const [myCycles, setMyCycles] = useState<Cycle[]>([])
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
      // Deux appels agrégés, quel que soit le nombre de projets (auparavant un appel par projet, ce qui vidait
      // le quota de rate limiting en quelques navigations).
      //
      // Mode tolérant conservé : une section en échec (droits, indispo ponctuelle) ne doit pas
      // faire tomber toute la vue - `allSettled`, on ne garde que les succès.
      const [issuesRes, cyclesRes] = await Promise.allSettled([
        listMyIssues(slug),
        listWorkspaceCycles(slug),
      ])

      if (issuesRes.status === "fulfilled") setMyIssues(issuesRes.value.map((i) => mapMyIssue(i, baseUrl)))
      if (cyclesRes.status === "fulfilled") setMyCycles(cyclesRes.value.map((c) => mapWorkspaceCycle(c, baseUrl)))

      // Horodaté APRÈS les appels : c'est l'heure de l'état affiché, pas celle de la demande.
      setLastSyncAt(Date.now())

      const failed = [issuesRes, cyclesRes].filter((r) => r.status === "rejected")
      if (failed.length > 0) console.warn("My Queue: partial load", failed)
    }
    void load()
  // Dépendance sur l'id (primitif) et non sur l'objet `user` : `fetchMe` en renvoie une nouvelle
  // référence à chaque appel, ce qui relançait le chargement complet à chaque fois.
  // `refreshToken` : incrémenté par le bouton Refresh pour rejouer le même effet.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user?.id, refreshToken])

  // Acceptation / refus d'une assignation en attente (mise à jour optimiste).
  async function handleAccept(issue: Issue) {
    try {
      await acceptAssignment(issue.issueId)
      setMyIssues((prev) => prev.map((it) => (it.id === issue.id ? { ...it, assignmentStatus: "ACCEPTED" } : it)))
      toast.success("Assignment accepted")
    } catch {
      toast.error("Couldn't accept the assignment.")
    }
  }
  async function handleDecline(issue: Issue) {
    try {
      await declineAssignment(issue.issueId)
      // Désassignée → elle sort de ma file.
      setMyIssues((prev) => prev.filter((it) => it.id !== issue.id))
      toast.success("Assignment declined")
    } catch {
      toast.error("Couldn't decline the assignment.")
    }
  }

  // Colonnes de base + une colonne Accept/Decline quand l'assignation est en attente (PENDING).
  const issueColumns: DataTableColumn<Issue>[] = [
    ...ISSUE_COLUMNS,
    {
      key: "assignment",
      header: "Assignment",
      className: "w-[150px]",
      render: (issue) =>
        issue.assignmentStatus === "PENDING" ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => handleAccept(issue)}>
              <Check className="size-3.5" /> Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => handleDecline(issue)}
            >
              <X className="size-3.5" /> Decline
            </Button>
          </div>
        ) : null,
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title="My Queue"
        description="Issues and sprints assigned to you"
        actions={
          <RefreshControl
            lastSyncAt={lastSyncAt}
            onRefresh={async () => { setRefreshToken((n) => n + 1) }}
          />
        }
      />

      {/* Onglets de tri (All / Issues / Sprints) - QA2-23 */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as QueueTab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="issues" className="gap-1.5">Issues<span className="text-muted-foreground">{myIssues.length}</span></TabsTrigger>
          {/* Compteur = nombre de lignes affichées, comme les deux autres onglets. Il montrait le
              nombre de sprints ACTIFS alors que la table les liste tous : « Sprints 2 » au-dessus
              d'une liste de 12. */}
          <TabsTrigger value="sprints" className="gap-1.5">Sprints<span className="text-muted-foreground">{myCycles.length}</span></TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Tables homogènes (DataTable : tri + pagination paramétrable) */}
      <div className="space-y-6">
        {(tab === "all" || tab === "issues") && (
          <QueueSection label="Issues" count={myIssues.length}>
            <DataTable
              columns={issueColumns}
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
      </div>

      {/* Sheet ouvert en place depuis la file (les sprints restent une redirection : c'est un contexte avec sa
          propre navigation). */}
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
