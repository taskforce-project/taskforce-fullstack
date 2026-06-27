"use client"

import { useState, useMemo, useEffect } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import {
  Plus,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  AlertTriangle,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  CircleDot,
  Star,
  LayoutGrid,
  List as ListIcon,
  ArrowUpDown,
} from "lucide-react"

import { CreateProjectDialog } from "@/components/dialogs/create-project-dialog"
import { EditProjectDialog } from "@/components/dialogs/edit-project-dialog"
import { ProjectIcon } from "@/components/ui/project-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DataTablePagination } from "@/components/ui/data-table-pagination"
import { usePagination } from "@/hooks/use-pagination"
import { SectionCard, MetricSplit, Metric } from "@/components/ui/section-card"
import { PageContainer, PageHeader } from "@/components/layout/page-shell"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ResponsiveContainer, AreaChart, Area } from "recharts"
import { cn } from "@/lib/utils"
import { getAvatarUrl } from "@/lib/utils/avatar"
import { useProjectStore } from "@/lib/store/project-store"
import { getProjectActivity } from "@/lib/api/project-service"
import type { Project } from "@/lib/api/project-service"

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "active" | "archived"
type HealthLevel = "healthy" | "at-risk" | "critical" | "paused"
type SortKey = "health" | "recent" | "name" | "progress" | "open"

const SORT_LABEL: Record<SortKey, string> = {
  health: "Santé",
  recent: "Récent",
  name: "Nom",
  progress: "Progression",
  open: "Tâches ouvertes",
}

// ─── Signal derivation (from real project data) ───────────────────────────────

function deriveHealth(project: Project): HealthLevel {
  if (project.status === "PAUSED" || project.status === "ARCHIVED") return "paused"
  if (project.totalIssues === 0) return "healthy"
  const ratio = project.openIssues / project.totalIssues
  if (ratio > 0.85) return "critical"
  if (ratio > 0.55) return "at-risk"
  return "healthy"
}

function deriveVelocity(project: Project): number | null {
  if (project.totalIssues === 0) return null
  const completedIssues = project.totalIssues - project.openIssues
  const ageWeeks = Math.max(1, (Date.now() - new Date(project.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 7))
  const rate = completedIssues / ageWeeks
  const target = (project.totalIssues / 10) * 2
  if (target === 0) return null
  const pct = Math.round(((rate - target) / target) * 100)
  const daysSinceUpdate = (Date.now() - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  if (daysSinceUpdate > 7 && pct > 0) return 0
  return Math.max(-99, Math.min(99, pct))
}

function deriveRiskSignal(project: Project): string | null {
  const health = deriveHealth(project)
  if (health === "healthy" || health === "paused") return null
  const ratio = project.totalIssues > 0 ? project.openIssues / project.totalIssues : 0
  const daysSinceUpdate = (Date.now() - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  if (ratio > 0.85) return `${Math.round(ratio * 100)}% of issues still open`
  if (daysSinceUpdate > 14) return `No updates in ${Math.round(daysSinceUpdate)} days`
  if (daysSinceUpdate > 7) return "No updates in 7+ days"
  if (ratio > 0.7) return "High open-issue ratio"
  return "Sprint at risk"
}

function progressPct(project: Project): number {
  return project.totalIssues > 0
    ? Math.round(((project.totalIssues - project.openIssues) / project.totalIssues) * 100)
    : 0
}

const HEALTH_META: Record<HealthLevel, { label: string; dot: string }> = {
  healthy:   { label: "Healthy",  dot: "bg-emerald-500" },
  "at-risk": { label: "At risk",  dot: "bg-amber-500" },
  critical:  { label: "Critical", dot: "bg-rose-500" },
  paused:    { label: "Paused",   dot: "bg-muted-foreground" },
}

// ─── Small cells ──────────────────────────────────────────────────────────────

function HealthBadge({ level }: { readonly level: HealthLevel }) {
  const meta = HEALTH_META[level]
  return (
    <Badge variant="secondary" className="gap-1.5 font-normal text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  )
}

function VelocityCell({ delta }: { readonly delta: number | null }) {
  if (delta === null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" /> {delta === null ? "N/A" : "—"}
      </span>
    )
  }
  const positive = delta > 0
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium tabular-nums", positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
      {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {positive ? "+" : ""}{delta}%
    </span>
  )
}

function MemberStack({ project }: { readonly project: Project }) {
  const visible = project.members.slice(0, 3)
  const extra = project.members.length - 3
  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((m) => (
        <Avatar key={m.id} className="size-5 ring-1 ring-background">
          <AvatarImage src={getAvatarUrl({ email: m.email, avatarUrl: m.avatarUrl })} />
          <AvatarFallback className="text-[8px]">
            {(m.displayName ?? m.email).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ))}
      {extra > 0 && (
        <div className="flex size-5 items-center justify-center rounded-full bg-muted text-[8px] font-medium text-muted-foreground ring-1 ring-background">
          +{extra}
        </div>
      )}
    </div>
  )
}

// ─── Stats strip ──────────────────────────────────────────────────────────────

function StatsStrip({ projects }: { readonly projects: Project[] }) {
  const total = projects.length
  const active = projects.filter((p) => p.status === "ACTIVE").length
  const critical = projects.filter((p) => deriveHealth(p) === "critical").length
  const atRisk = projects.filter((p) => deriveHealth(p) === "at-risk").length
  const avgProgress = total > 0 ? Math.round(projects.reduce((acc, p) => acc + progressPct(p), 0) / total) : 0

  return (
    <SectionCard title="Overview" bodyClassName="p-0">
      <MetricSplit>
        <Metric label="Total operations" value={total} />
        <Metric label="Active" value={active} valueClassName="text-emerald-600 dark:text-emerald-400" />
        <Metric label="At risk" value={atRisk} valueClassName={atRisk > 0 ? "text-amber-600 dark:text-amber-400" : undefined} />
        <Metric label="Critical" value={critical} valueClassName={critical > 0 ? "text-rose-600 dark:text-rose-400" : undefined} />
        <Metric label="Avg progress" value={`${avgProgress}%`} />
      </MetricSplit>
    </SectionCard>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function OperationRow({ project, slug }: { readonly project: Project; readonly slug: string }) {
  const router = useRouter()
  const archiveProject = useProjectStore((s) => s.archiveProject)
  const updateProject = useProjectStore((s) => s.updateProject)
  const toggleFavorite = useProjectStore((s) => s.toggleFavorite)
  const [editOpen, setEditOpen] = useState(false)

  const health = deriveHealth(project)
  const velocity = deriveVelocity(project)
  const riskSignal = deriveRiskSignal(project)
  const pct = progressPct(project)

  return (
    <>
    <TableRow
      className="cursor-pointer"
      onClick={() => router.push(`/${slug}/projects/${project.id}`)}
    >
      <TableCell>
        <div className="flex items-center gap-2.5">
          <span className={cn("size-2 shrink-0 rounded-full", HEALTH_META[health].dot)} />
          <ProjectIcon iconUrl={project.iconUrl} name={project.name} color={project.color} size={20} className="shrink-0 rounded" />
          <span className="font-medium text-foreground">{project.name}</span>
        </div>
      </TableCell>
      <TableCell><HealthBadge level={health} /></TableCell>
      <TableCell className="hidden md:table-cell">
        {riskSignal ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="size-3 shrink-0 text-amber-500" />
            {riskSignal}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60">No signals</span>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex items-center gap-2">
          <Progress value={pct} className="h-1.5 w-16" />
          <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell"><VelocityCell delta={velocity} /></TableCell>
      <TableCell className="hidden xl:table-cell"><MemberStack project={project} /></TableCell>
      <TableCell className="text-right">
        <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
          <CircleDot className="size-3.5" />
          {project.openIssues}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-0.5">
          {/* Pin (favori) — épinglé en tête de liste (QA2-22) */}
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(project.isFavorite ? "text-amber-500" : "text-muted-foreground")}
            title={project.isFavorite ? "Désépingler" : "Épingler"}
            onClick={(e) => { e.stopPropagation(); toggleFavorite(slug, project.id, !project.isFavorite) }}
          >
            <Star className={cn("size-4", project.isFavorite && "fill-amber-400 text-amber-400")} />
          </Button>
          {/* Archive / Réactiver — action directe (QA2-22 : plus cachée dans le « … ») */}
          {project.status === "ARCHIVED" ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              title="Réactiver le projet"
              onClick={(e) => { e.stopPropagation(); updateProject(slug, project.id, { status: "ACTIVE" }) }}
            >
              <ArchiveRestore className="size-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              title="Archiver le projet"
              onClick={(e) => { e.stopPropagation(); archiveProject(slug, project.id) }}
            >
              <Archive className="size-4" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                Edit operation
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/${slug}/projects/${project.id}/settings`)}>
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
    <EditProjectDialog project={project} slug={slug} open={editOpen} onOpenChange={setEditOpen} />
    </>
  )
}

// ─── Card (cards view) ──────────────────────────────────────────────────────────

function ProjectCard({ project, slug }: { readonly project: Project; readonly slug: string }) {
  const router = useRouter()
  const toggleFavorite = useProjectStore((s) => s.toggleFavorite)
  const health = deriveHealth(project)
  const pct = progressPct(project)

  // Activité du projet (réel) — issues créées/jour sur 14 j, façon GitHub (QA2-32).
  const [activity, setActivity] = useState<{ date: string; activity: number }[]>([])
  useEffect(() => {
    let alive = true
    getProjectActivity(slug, project.id, 14)
      .then((pts) => { if (alive) setActivity(pts.map((p) => ({ date: p.date, activity: p.count }))) })
      .catch(() => { /* indispo → pas de sparkline */ })
    return () => { alive = false }
  }, [slug, project.id])

  const hasActivity = activity.some((p) => p.activity > 0)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/${slug}/projects/${project.id}`)}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/${slug}/projects/${project.id}`)}
      className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-foreground/15 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("size-2 shrink-0 rounded-full", HEALTH_META[health].dot)} />
          <ProjectIcon iconUrl={project.iconUrl} name={project.name} color={project.color} size={28} className="shrink-0 rounded" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
            <HealthBadge level={health} />
          </div>
        </div>
        <button
          type="button"
          title={project.isFavorite ? "Désépingler" : "Épingler"}
          onClick={(e) => { e.stopPropagation(); toggleFavorite(slug, project.id, !project.isFavorite) }}
          className={cn(
            "shrink-0 rounded p-1 transition-colors hover:bg-muted",
            project.isFavorite ? "text-amber-500" : "text-muted-foreground/50 hover:text-foreground"
          )}
        >
          <Star className={cn("size-4", project.isFavorite && "fill-amber-400 text-amber-400")} />
        </button>
      </div>

      {project.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
      )}

      {/* Activité (sparkline bleu, façon GitHub) — remplace la barre de progression */}
      <div className="mt-auto">
        <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">Activité</p>
        {hasActivity ? (
          <ResponsiveContainer width="100%" height={36}>
            <AreaChart data={activity} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
              <defs>
                <linearGradient id={`act-${project.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="activity" stroke="#3b82f6" strokeWidth={1.5} fill={`url(#act-${project.id})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-9 items-center text-[10px] text-muted-foreground/50">Pas d&apos;activité récente</div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
        <MemberStack project={project} />
        <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
          <span title="Progression">{pct}%</span>
          <span className="inline-flex items-center gap-1" title="Tâches ouvertes">
            <CircleDot className="size-3.5" /> {project.openIssues}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function ProjectsSkeleton({ cards }: { readonly cards: boolean }) {
  if (cards) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-7 rounded" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <Card className="gap-0 overflow-hidden py-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-4 last:border-0">
          <Skeleton className="size-5 rounded" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </Card>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ isSearch }: { readonly isSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {isSearch ? (
        <>
          <Search className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">No operations match your search</p>
        </>
      ) : (
        <>
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <Zap className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">No active operations</p>
            <p className="text-xs text-muted-foreground">Create your first operation to start tracking work</p>
          </div>
          <CreateProjectDialog>
            <Button size="sm" className="gap-1.5"><Plus className="size-3.5" /> New Operation</Button>
          </CreateProjectDialog>
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const params = useParams<{ workspace: string }>()
  const slug = params.workspace
  // « New project » depuis la sidebar → ?new=1 ouvre le modal d'emblée (PROD-8.7)
  const autoNew = useSearchParams().get("new") === "1"

  const { projects, isLoading, fetchProjects } = useProjectStore()
  const [filter, setFilter] = useState<FilterTab>("active")
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"list" | "cards">("cards")
  const [sortBy, setSortBy] = useState<SortKey>("health")

  useEffect(() => {
    if (slug) fetchProjects(slug)
  }, [slug, fetchProjects])

  const filtered = useMemo(() => {
    let list = projects
    if (filter === "active") list = list.filter((p) => p.status === "ACTIVE" || p.status === "PAUSED")
    if (filter === "archived") list = list.filter((p) => p.status === "ARCHIVED")
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q))
    }
    return list
  }, [projects, filter, search])

  const sorted = useMemo(() => {
    const healthOrder: Record<HealthLevel, number> = { critical: 0, "at-risk": 1, healthy: 2, paused: 3 }
    const comparators: Record<SortKey, (a: Project, b: Project) => number> = {
      health: (a, b) => healthOrder[deriveHealth(a)] - healthOrder[deriveHealth(b)],
      recent: (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      name: (a, b) => a.name.localeCompare(b.name),
      progress: (a, b) => progressPct(b) - progressPct(a),
      open: (a, b) => b.openIssues - a.openIssues,
    }
    // Épinglés (favoris) toujours en tête, puis tri choisi.
    return [...filtered].sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
      return comparators[sortBy](a, b)
    })
  }, [filtered, sortBy])

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === "ACTIVE" || p.status === "PAUSED"),
    [projects]
  )

  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = usePagination(sorted)

  return (
    <PageContainer>
      <PageHeader
        title="Active Operations"
        description="Real-time health and velocity across all workstreams"
        actions={
          <CreateProjectDialog defaultOpen={autoNew}>
            <Button size="sm" className="gap-1.5"><Plus className="size-4" /> New Operation</Button>
          </CreateProjectDialog>
        }
      />

      {/* Stats */}
      {!isLoading && activeProjects.length > 0 && <StatsStrip projects={activeProjects} />}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search operations…"
            className="h-9 pl-8"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!isLoading && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {sorted.length} operation{sorted.length !== 1 ? "s" : ""}
            </span>
          )}
          {/* Tri */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                <ArrowUpDown className="size-3.5" /> {SORT_LABEL[sortBy]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <DropdownMenuItem key={k} onClick={() => setSortBy(k)}>
                  {SORT_LABEL[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Vue liste / cartes */}
          <div className="flex items-center rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="Vue liste"
              className={cn("flex size-7 items-center justify-center rounded transition-colors", view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <ListIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("cards")}
              aria-label="Vue cartes"
              className={cn("flex size-7 items-center justify-center rounded transition-colors", view === "cards" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Liste / cartes */}
      {isLoading ? (
        <ProjectsSkeleton cards={view === "cards"} />
      ) : sorted.length === 0 ? (
        <Card className="gap-0 overflow-hidden py-0">
          <EmptyState isSearch={search.trim().length > 0} />
        </Card>
      ) : view === "cards" ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((project) => (
              <ProjectCard key={project.id} project={project} slug={slug} />
            ))}
          </div>
          {total > pageSize && (
            <Card className="gap-0 overflow-hidden py-0">
              <DataTablePagination
                page={page}
                pageCount={pageCount}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                className="border-t-0"
              />
            </Card>
          )}
        </>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Operation</TableHead>
                <TableHead>Health</TableHead>
                <TableHead className="hidden md:table-cell">Signal</TableHead>
                <TableHead className="hidden lg:table-cell">Progress</TableHead>
                <TableHead className="hidden lg:table-cell">Velocity</TableHead>
                <TableHead className="hidden xl:table-cell">Team</TableHead>
                <TableHead className="text-right">Open</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((project) => (
                <OperationRow key={project.id} project={project} slug={slug} />
              ))}
            </TableBody>
          </Table>
          <DataTablePagination
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </Card>
      )}
    </PageContainer>
  )
}
