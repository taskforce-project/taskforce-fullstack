"use client"

import { useState } from "react"
import {
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  CalendarRange,
  MoreHorizontal,
  Play,
  BarChart3,
  CircleDot,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { CreateCycleDialog } from "@/components/dialogs/create-cycle-dialog"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type CycleStatus = "active" | "upcoming" | "completed"

interface CycleIssueStats {
  total: number
  done: number
  inProgress: number
  todo: number
  cancelled: number
}

interface Cycle {
  id: string
  name: string
  description: string | null
  project: { id: string; name: string; emoji: string; color: string }
  status: CycleStatus
  startDate: string
  endDate: string
  issues: CycleIssueStats
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_CYCLES: Cycle[] = [
  {
    id: "1",
    name: "Sprint 4 — Auth & Billing",
    description: "Focus on authentication improvements and Stripe integration.",
    project: { id: "1", name: "Mobile App", emoji: "📱", color: "bg-blue-500" },
    status: "active",
    startDate: "2026-04-01",
    endDate: "2026-04-14",
    issues: { total: 12, done: 7, inProgress: 3, todo: 2, cancelled: 0 },
  },
  {
    id: "2",
    name: "Sprint 7 — Dashboard v2",
    description: "Redesign the main dashboard with new chart components.",
    project: { id: "2", name: "Website", emoji: "🎨", color: "bg-violet-500" },
    status: "active",
    startDate: "2026-03-31",
    endDate: "2026-04-11",
    issues: { total: 8, done: 5, inProgress: 2, todo: 1, cancelled: 0 },
  },
  {
    id: "3",
    name: "API v2 — Rate Limiting",
    description: null,
    project: { id: "3", name: "API v2", emoji: "⚡", color: "bg-emerald-500" },
    status: "upcoming",
    startDate: "2026-04-15",
    endDate: "2026-04-28",
    issues: { total: 6, done: 0, inProgress: 0, todo: 6, cancelled: 0 },
  },
  {
    id: "4",
    name: "Sprint Q2 — Analytics",
    description: "Chart exports, filters and performance improvements.",
    project: { id: "4", name: "Analytics", emoji: "📊", color: "bg-amber-500" },
    status: "upcoming",
    startDate: "2026-04-20",
    endDate: "2026-05-03",
    issues: { total: 9, done: 0, inProgress: 0, todo: 9, cancelled: 0 },
  },
  {
    id: "5",
    name: "Sprint 2 — Core Components",
    description: "Build foundational button, input, and form components.",
    project: { id: "5", name: "Design System", emoji: "💎", color: "bg-slate-500" },
    status: "completed",
    startDate: "2026-02-17",
    endDate: "2026-03-02",
    issues: { total: 15, done: 14, inProgress: 0, todo: 0, cancelled: 1 },
  },
  {
    id: "6",
    name: "Sprint 3 — Onboarding",
    description: "New user onboarding flow, welcome email & plan selection.",
    project: { id: "1", name: "Mobile App", emoji: "📱", color: "bg-blue-500" },
    status: "completed",
    startDate: "2026-03-03",
    endDate: "2026-03-16",
    issues: { total: 10, done: 10, inProgress: 0, todo: 0, cancelled: 0 },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function progress(stats: CycleIssueStats): number {
  if (stats.total === 0) return 0
  return Math.round((stats.done / stats.total) * 100)
}

function daysLeft(endDate: string): number {
  const diff = new Date(endDate).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ─────────────────────────────────────────────────────────────────────────────
// CycleCard
// ─────────────────────────────────────────────────────────────────────────────

function CycleCard({ cycle }: Readonly<{ cycle: Cycle }>) {
  const pct  = progress(cycle.issues)
  const left = daysLeft(cycle.endDate)

  function statusLabel(): string {
    if (cycle.status === "active")   return "Active"
    if (cycle.status === "upcoming") return "Upcoming"
    return "Completed"
  }

  function daysLeftColor(): string {
    if (left <= 2) return "text-red-400"
    if (left <= 5) return "text-amber-400"
    return "text-muted-foreground"
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)] flex flex-col gap-4 hover:border-border/80 transition-colors">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Status icon */}
          <div className={cn(
            "mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
            cycle.status === "active"    && "bg-emerald-500/10",
            cycle.status === "upcoming"  && "bg-blue-500/10",
            cycle.status === "completed" && "bg-muted",
          )}>
            {cycle.status === "active"    && <Play        className="h-4 w-4 text-emerald-400" />}
            {cycle.status === "upcoming"  && <Clock       className="h-4 w-4 text-blue-400"    />}
            {cycle.status === "completed" && <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground truncate">{cycle.name}</h3>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0 h-4 border font-medium",
                  cycle.status === "active"    && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                  cycle.status === "upcoming"  && "border-blue-500/30 bg-blue-500/10 text-blue-400",
                  cycle.status === "completed" && "border-border bg-muted/50 text-muted-foreground",
                )}
              >
                {statusLabel()}
              </Badge>
            </div>
            {cycle.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{cycle.description}</p>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2"><BarChart3 className="h-4 w-4" />View issues</DropdownMenuItem>
            <DropdownMenuItem>Edit cycle</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Project tag */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{cycle.project.emoji}</span>
        <span className="text-xs text-muted-foreground">{cycle.project.name}</span>
      </div>

      {/* Progress */}
      {cycle.issues.total > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {cycle.issues.done}/{cycle.issues.total} issues
            </span>
            <span className="text-xs font-semibold text-foreground">{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />

          {/* Mini breakdown */}
          <div className="flex items-center gap-3 mt-0.5">
            {cycle.issues.inProgress > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-blue-400">
                <RefreshCw className="h-3 w-3" />{cycle.issues.inProgress}
              </span>
            )}
            {cycle.issues.todo > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <CircleDot className="h-3 w-3" />{cycle.issues.todo}
              </span>
            )}
            {cycle.issues.cancelled > 0 && (
              <span className="text-[10px] text-muted-foreground/50">{cycle.issues.cancelled} cancelled</span>
            )}
          </div>
        </div>
      )}

      {/* Dates */}
      <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-auto">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          {formatDate(cycle.startDate)} – {formatDate(cycle.endDate)}
        </div>
        {cycle.status === "active" && (
          <span className={cn(
            "text-xs font-medium",
            daysLeftColor()
          )}>
            {left <= 0 ? "Overdue" : `${left}d left`}
          </span>
        )}
        {cycle.status === "upcoming" && (
          <span className="text-xs text-muted-foreground">
            Starts in {daysLeft(cycle.startDate)}d
          </span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section
// ─────────────────────────────────────────────────────────────────────────────

function CycleSection({ title, cycles, defaultOpen = true }: Readonly<{
  title: string
  cycles: Cycle[]
  defaultOpen?: boolean
}>) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-foreground w-fit"
      >
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        {title}
        <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-semibold">
          {cycles.length}
        </Badge>
      </button>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cycles.map((cycle) => <CycleCard key={cycle.id} cycle={cycle} />)}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CyclesPage() {
  const [cycles, setCycles] = useState(MOCK_CYCLES)

  const active    = cycles.filter((c) => c.status === "active")
  const upcoming  = cycles.filter((c) => c.status === "upcoming")
  const completed = cycles.filter((c) => c.status === "completed")

  function handleCycleCreated(payload: { name: string; description: string; projectId: string; startDate: Date; endDate: Date }) {
    const newCycle: Cycle = {
      id: Date.now().toString(),
      name: payload.name,
      description: payload.description || null,
      project: { id: payload.projectId, name: "New Project", emoji: "📁", color: "bg-muted-foreground" },
      status: "upcoming",
      startDate: payload.startDate.toISOString().slice(0, 10),
      endDate: payload.endDate.toISOString().slice(0, 10),
      issues: { total: 0, done: 0, inProgress: 0, todo: 0, cancelled: 0 },
    }
    setCycles((prev) => [...prev, newCycle])
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cycles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {active.length} active · {upcoming.length} upcoming · {completed.length} completed
          </p>
        </div>
        <CreateCycleDialog onCreated={handleCycleCreated}>
          <Button size="sm" className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            New cycle
          </Button>
        </CreateCycleDialog>
      </div>

      {/* Active cycles */}
      {active.length > 0 && (
        <CycleSection title="Active" cycles={active} defaultOpen />
      )}

      {/* Upcoming cycles */}
      {upcoming.length > 0 && (
        <CycleSection title="Upcoming" cycles={upcoming} defaultOpen />
      )}

      {/* Completed cycles */}
      {completed.length > 0 && (
        <CycleSection title="Completed" cycles={completed} defaultOpen={false} />
      )}

      {/* Empty state */}
      {cycles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <RefreshCw className="h-10 w-10 text-muted-foreground/30 mb-4" />
          <p className="text-base font-medium text-foreground">No cycles yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create a cycle to track a sprint or milestone.</p>
          <CreateCycleDialog onCreated={handleCycleCreated}>
            <Button size="sm" className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              New cycle
            </Button>
          </CreateCycleDialog>
        </div>
      )}
    </div>
  )
}
