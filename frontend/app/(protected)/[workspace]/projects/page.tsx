"use client"

import { useState, useMemo, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Plus,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  AlertTriangle,
  MoreHorizontal,
  Loader2,
  CircleDot,
} from "lucide-react"

import { CreateProjectDialog } from "@/components/dialogs/create-project-dialog"
import { ProjectIcon } from "@/components/ui/project-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Card } from "@/components/ui/card"
import { SectionCard, MetricSplit, Metric } from "@/components/ui/section-card"
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
import { cn } from "@/lib/utils"
import { getAvatarUrl } from "@/lib/utils/avatar"
import { useProjectStore } from "@/lib/store/project-store"
import type { Project } from "@/lib/api/project-service"

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "active" | "archived"
type HealthLevel = "healthy" | "at-risk" | "critical" | "paused"

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

  const health = deriveHealth(project)
  const velocity = deriveVelocity(project)
  const riskSignal = deriveRiskSignal(project)
  const pct = progressPct(project)

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => router.push(`/${slug}/projects/${project.id}`)}
    >
      <TableCell>
        <div className="flex items-center gap-2.5">
          <span className={cn("size-2 shrink-0 rounded-full", HEALTH_META[health].dot)} />
          <ProjectIcon iconUrl={project.iconUrl} name={project.name} size={20} className="shrink-0 rounded" />
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
            <DropdownMenuItem onClick={() => router.push(`/${slug}/projects/${project.id}/settings`)}>
              Edit operation
            </DropdownMenuItem>
            {project.status === "ARCHIVED" ? (
              <DropdownMenuItem onClick={() => updateProject(slug, project.id, { status: "ACTIVE" })}>
                Reactivate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => archiveProject(slug, project.id)}>
                Archive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
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

  const { projects, isLoading, fetchProjects } = useProjectStore()
  const [filter, setFilter] = useState<FilterTab>("active")
  const [search, setSearch] = useState("")

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
    const order: Record<HealthLevel, number> = { critical: 0, "at-risk": 1, healthy: 2, paused: 3 }
    return [...list].sort((a, b) => order[deriveHealth(a)] - order[deriveHealth(b)])
  }, [projects, filter, search])

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === "ACTIVE" || p.status === "PAUSED"),
    [projects]
  )

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Active Operations</h1>
          <p className="text-sm text-muted-foreground">Real-time health and velocity across all workstreams</p>
        </div>
        <CreateProjectDialog>
          <Button size="sm" className="gap-1.5"><Plus className="size-4" /> New Operation</Button>
        </CreateProjectDialog>
      </div>

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
        {!isLoading && (
          <span className="ml-auto text-sm text-muted-foreground">
            {filtered.length} operation{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      <Card className="gap-0 overflow-hidden py-0">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState isSearch={search.trim().length > 0} />
        ) : (
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
              {filtered.map((project) => (
                <OperationRow key={project.id} project={project} slug={slug} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
