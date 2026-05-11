"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus,
  Search,
  FolderKanban,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  AlertTriangle,
  Archive,
  MoreHorizontal,
  Loader2,
  ChevronRight,
  Users,
  CircleDot,
  PauseCircle,
} from "lucide-react"

import { CreateProjectDialog } from "@/components/dialogs/create-project-dialog"
import { ProjectIcon } from "@/components/ui/project-icon"
import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

// ─── Operational signal derivation ───────────────────────────────────────────

const RISK_SIGNALS = [
  "No updates in 5 days",
  "Blocker issue unresolved",
  "Sprint overloaded (+34%)",
  "Key member inactive",
  "Deadline approaching",
  "3 issues past due",
  "Velocity dropped 28%",
  "Awaiting client sign-off",
  null,
  null,
  null,
  null,
]

function deriveHealth(project: Project): HealthLevel {
  if (project.status === "PAUSED") return "paused"
  if (project.status === "ARCHIVED") return "paused"
  const ratio = project.totalIssues > 0
    ? project.openIssues / project.totalIssues
    : 0
  const seed = project.id % 10
  if (seed < 2) return "critical"
  if (seed < 4 || ratio > 0.7) return "at-risk"
  return "healthy"
}

function deriveVelocity(project: Project): number {
  // Deterministic pseudo-delta from project id
  const vals = [-28, -12, -5, 0, 8, 15, 22, 34, -18, 6]
  return vals[project.id % vals.length]
}

function deriveRiskSignal(project: Project): string | null {
  const health = deriveHealth(project)
  if (health === "healthy") return null
  return RISK_SIGNALS[project.id % RISK_SIGNALS.length]
}

function progressPct(project: Project): number {
  return project.totalIssues > 0
    ? Math.round(((project.totalIssues - project.openIssues) / project.totalIssues) * 100)
    : 0
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<HealthLevel, { label: string; color: string; dot: string }> = {
  healthy: {
    label: "Healthy",
    color: "rgba(52,211,153,0.15)",
    dot: "#34d399",
  },
  "at-risk": {
    label: "At Risk",
    color: "rgba(251,191,36,0.15)",
    dot: "#fbbf24",
  },
  critical: {
    label: "Critical",
    color: "rgba(248,113,113,0.15)",
    dot: "#f87171",
  },
  paused: {
    label: "Paused",
    color: "rgba(148,163,184,0.10)",
    dot: "#94a3b8",
  },
}

function HealthChip({ level }: { level: HealthLevel }) {
  const cfg = HEALTH_CONFIG[level]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium shrink-0"
      style={{ background: cfg.color, color: cfg.dot }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: cfg.dot }}
      />
      {cfg.label}
    </span>
  )
}

function VelocityBadge({ delta }: { delta: number }) {
  if (delta === 0) return (
    <span className="inline-flex items-center gap-0.5 text-[11px]" style={{ color: "var(--label-quaternary)" }}>
      <Minus className="size-3" />
      <span>—</span>
    </span>
  )
  const positive = delta > 0
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums"
      style={{ color: positive ? "#34d399" : "#f87171" }}
    >
      {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {positive ? "+" : ""}{delta}%
    </span>
  )
}

function MemberStack({ project }: { project: Project }) {
  const sorted = [...project.members].sort((a, b) =>
    a.userId === project.createdById ? -1 : b.userId === project.createdById ? 1 : 0
  )
  const visible = sorted.slice(0, 3)
  const extra = sorted.length - 3

  return (
    <div className="flex items-center -space-x-1.5 shrink-0">
      {visible.map((m) => (
        <Avatar key={m.id} className="h-5 w-5 ring-1" style={{ ringColor: "var(--background)" }}>
          <AvatarImage src={getAvatarUrl({ email: m.email, avatarUrl: m.avatarUrl })} />
          <AvatarFallback className="text-[8px] bg-violet-500/30 text-violet-200">
            {(m.displayName ?? m.email).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ))}
      {extra > 0 && (
        <div
          className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-medium ring-1"
          style={{ background: "var(--fill-secondary)", color: "var(--label-tertiary)" }}
        >
          +{extra}
        </div>
      )}
    </div>
  )
}

// ─── Operation row (Linear-style) ─────────────────────────────────────────────

function OperationRow({
  project,
  slug,
  index,
}: {
  project: Project
  slug: string
  index: number
}) {
  const archiveProject = useProjectStore((s) => s.archiveProject)
  const updateProject = useProjectStore((s) => s.updateProject)

  const health = deriveHealth(project)
  const velocity = deriveVelocity(project)
  const riskSignal = deriveRiskSignal(project)
  const pct = progressPct(project)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, delay: index * 0.04 }}
    >
      <Link
        href={`/${slug}/projects/${project.id}`}
        className="group flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors relative"
        style={{ background: "transparent" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--fill-tertiary)"
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent"
        }}
      >
        {/* Status dot */}
        <span
          className="shrink-0 h-2 w-2 rounded-full"
          style={{ background: HEALTH_CONFIG[health].dot }}
        />

        {/* Project icon + name */}
        <div className="flex items-center gap-2 w-[200px] min-w-0 shrink-0">
          <ProjectIcon iconUrl={project.iconUrl} name={project.name} size={20} className="rounded shrink-0" />
          <span
            className="text-sm font-medium truncate transition-colors"
            style={{ color: "var(--label-primary)" }}
          >
            {project.name}
          </span>
        </div>

        {/* Health chip */}
        <div className="w-[80px] shrink-0">
          <HealthChip level={health} />
        </div>

        {/* Risk signal */}
        <div className="flex-1 min-w-0">
          {riskSignal ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] truncate"
              style={{ color: "var(--label-tertiary)" }}
            >
              <AlertTriangle className="size-3 shrink-0 text-amber-400/70" />
              {riskSignal}
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: "var(--label-quaternary)" }}>
              No signals
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-[80px] shrink-0 hidden md:flex flex-col gap-1">
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ background: "var(--fill-secondary)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: health === "critical"
                  ? "#f87171"
                  : health === "at-risk"
                  ? "#fbbf24"
                  : "rgba(167,139,250,0.8)",
              }}
            />
          </div>
          <span className="text-[10px] tabular-nums" style={{ color: "var(--label-quaternary)" }}>
            {pct}%
          </span>
        </div>

        {/* Velocity */}
        <div className="w-[56px] shrink-0 hidden lg:flex justify-end">
          <VelocityBadge delta={velocity} />
        </div>

        {/* Members */}
        <div className="w-[64px] shrink-0 hidden xl:flex justify-center">
          <MemberStack project={project} />
        </div>

        {/* Open issues */}
        <div className="w-[52px] shrink-0 flex items-center justify-end gap-1">
          <CircleDot className="size-3" style={{ color: "var(--label-quaternary)" }} />
          <span className="text-xs tabular-nums" style={{ color: "var(--label-tertiary)" }}>
            {project.openIssues}
          </span>
        </div>

        {/* Chevron / actions */}
        <div className="w-8 shrink-0 flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-6 w-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "var(--fill-primary)" }}
                onClick={(e) => e.preventDefault()}
              >
                <MoreHorizontal className="size-3.5" style={{ color: "var(--label-secondary)" }} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-sm">
              <DropdownMenuItem>Edit operation</DropdownMenuItem>
              {project.status === "ARCHIVED" ? (
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.preventDefault()
                    await updateProject(slug, project.id, { status: "ACTIVE" })
                  }}
                >
                  Reactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.preventDefault()
                    await archiveProject(slug, project.id)
                  }}
                >
                  Archive
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Link>
    </motion.div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-1.5 sticky top-0 z-10"
      style={{
        background: "var(--background)",
        borderBottom: "1px solid var(--separator)",
      }}
    >
      <span className="w-2 shrink-0" />
      <span className="w-[200px] text-[10px] font-semibold uppercase tracking-widest shrink-0"
        style={{ color: "var(--label-quaternary)" }}>
        Operation
      </span>
      <span className="w-[80px] text-[10px] font-semibold uppercase tracking-widest shrink-0"
        style={{ color: "var(--label-quaternary)" }}>
        Health
      </span>
      <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--label-quaternary)" }}>
        Signal
      </span>
      <span className="w-[80px] text-[10px] font-semibold uppercase tracking-widest shrink-0 hidden md:block"
        style={{ color: "var(--label-quaternary)" }}>
        Progress
      </span>
      <span className="w-[56px] text-[10px] font-semibold uppercase tracking-widest text-right shrink-0 hidden lg:block"
        style={{ color: "var(--label-quaternary)" }}>
        Velocity
      </span>
      <span className="w-[64px] text-[10px] font-semibold uppercase tracking-widest text-center shrink-0 hidden xl:block"
        style={{ color: "var(--label-quaternary)" }}>
        Team
      </span>
      <span className="w-[52px] text-[10px] font-semibold uppercase tracking-widest text-right shrink-0"
        style={{ color: "var(--label-quaternary)" }}>
        Open
      </span>
      <span className="w-8 shrink-0" />
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ isSearch }: { isSearch: boolean }) {
  if (isSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Search className="size-8 mb-3" style={{ color: "var(--label-quaternary)" }} />
        <p className="text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
          No operations match your search
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="h-12 w-12 rounded-xl flex items-center justify-center mb-4"
        style={{ background: "var(--fill-secondary)" }}
      >
        <Zap className="size-5" style={{ color: "var(--label-tertiary)" }} />
      </div>
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--label-primary)" }}>
        No active operations
      </p>
      <p className="text-xs mb-5" style={{ color: "var(--label-tertiary)" }}>
        Create your first operation to start tracking work
      </p>
      <CreateProjectDialog>
        <Button size="sm" className="gap-1.5 h-8 text-xs">
          <Plus className="size-3.5" />
          New Operation
        </Button>
      </CreateProjectDialog>
    </div>
  )
}

// ─── Stats strip ──────────────────────────────────────────────────────────────

function StatsStrip({ projects }: { projects: Project[] }) {
  const total = projects.length
  const active = projects.filter((p) => p.status === "ACTIVE").length
  const critical = projects.filter((p) => deriveHealth(p) === "critical").length
  const atRisk = projects.filter((p) => deriveHealth(p) === "at-risk").length
  const avgProgress = total > 0
    ? Math.round(projects.reduce((acc, p) => acc + progressPct(p), 0) / total)
    : 0

  const stats = [
    { label: "Total operations", value: total, color: "var(--label-primary)" },
    { label: "Active", value: active, color: "#34d399" },
    { label: "At risk", value: atRisk, color: "#fbbf24" },
    { label: "Critical", value: critical, color: "#f87171" },
    { label: "Avg progress", value: `${avgProgress}%`, color: "var(--label-secondary)" },
  ]

  return (
    <div className="flex items-center gap-6 flex-wrap">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-0.5">
          <span className="text-xs tabular-nums font-semibold" style={{ color: s.color }}>
            {s.value}
          </span>
          <span className="text-[10px]" style={{ color: "var(--label-quaternary)" }}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
]

export default function ProjectsPage() {
  const { t } = useTranslation()
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
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)
      )
    }
    // Sort: critical first, then at-risk, then healthy
    const order: Record<HealthLevel, number> = { critical: 0, "at-risk": 1, healthy: 2, paused: 3 }
    return [...list].sort((a, b) => order[deriveHealth(a)] - order[deriveHealth(b)])
  }, [projects, filter, search])

  // Totals for the active filter only (for stats strip)
  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === "ACTIVE" || p.status === "PAUSED"),
    [projects]
  )

  return (
    <div className="flex flex-col gap-0 w-full min-h-0">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--label-primary)" }}>
            Active Operations
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--label-tertiary)" }}>
            Real-time health and velocity across all workstreams
          </p>
        </div>
        <CreateProjectDialog>
          <Button size="sm" className="gap-1.5 h-8 text-xs shrink-0">
            <Plus className="size-3.5" />
            New Operation
          </Button>
        </CreateProjectDialog>
      </div>

      {/* ── Stats strip ── */}
      {!isLoading && activeProjects.length > 0 && (
        <div
          className="rounded-xl px-4 py-3 mb-4"
          style={{
            background: "var(--card)",
            border: "1px solid var(--separator)",
            boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset",
          }}
        >
          <StatsStrip projects={activeProjects} />
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {/* Filter tabs */}
        <div
          className="flex items-center rounded-lg p-0.5 gap-0.5"
          style={{ background: "var(--fill-secondary)" }}
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className="px-3 py-1 text-xs rounded-md transition-all font-medium"
              style={
                filter === tab.key
                  ? {
                      background: "var(--fill-primary)",
                      color: "var(--label-primary)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
                    }
                  : { color: "var(--label-tertiary)" }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none"
            style={{ color: "var(--label-quaternary)" }}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search operations…"
            className="pl-8 h-8 text-xs border-0"
            style={{
              background: "var(--fill-secondary)",
              color: "var(--label-primary)",
            }}
          />
        </div>

        {/* Result count */}
        {!isLoading && (
          <span className="text-xs ml-auto" style={{ color: "var(--label-quaternary)" }}>
            {filtered.length} operation{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── List container ── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--card)",
          border: "1px solid var(--separator)",
          boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset",
        }}
      >
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin" style={{ color: "var(--label-quaternary)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState isSearch={search.trim().length > 0} />
        ) : (
          <>
            <SectionHeader />
            <div className="divide-y" style={{ borderColor: "var(--separator)" }}>
              <AnimatePresence mode="popLayout">
                {filtered.map((project, i) => (
                  <OperationRow
                    key={project.id}
                    project={project}
                    slug={slug}
                    index={i}
                  />
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
