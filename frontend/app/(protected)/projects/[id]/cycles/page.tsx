"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import {
  RefreshCw,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  Clock,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CycleStatus = "active" | "upcoming" | "completed"

interface ProjectCycle {
  id: string
  title: string
  status: CycleStatus
  progress: number
  totalIssues: number
  completedIssues: number
  startDate: string
  endDate: string
  daysLeft: number | null
}

const CYCLES: ProjectCycle[] = [
  { id: "1", title: "Sprint 4 — Mobile hardening", status: "active", progress: 62, totalIssues: 14, completedIssues: 9, startDate: "Mar 24", endDate: "Apr 4", daysLeft: 6 },
  { id: "2", title: "Sprint 5 — Onboarding flow", status: "upcoming", progress: 0, totalIssues: 0, completedIssues: 0, startDate: "Apr 7", endDate: "Apr 18", daysLeft: null },
  { id: "3", title: "Sprint 3 — Auth foundations", status: "completed", progress: 100, totalIssues: 11, completedIssues: 11, startDate: "Mar 10", endDate: "Mar 21", daysLeft: null },
  { id: "4", title: "Sprint 2 — UI kit & design system", status: "completed", progress: 100, totalIssues: 9, completedIssues: 9, startDate: "Feb 24", endDate: "Mar 7", daysLeft: null },
  { id: "5", title: "Sprint 1 — Project setup", status: "completed", progress: 100, totalIssues: 6, completedIssues: 6, startDate: "Feb 10", endDate: "Feb 21", daysLeft: null },
]

const CYCLE_STATUS: Record<CycleStatus, { badgeClass: string; label: string; icon: React.ReactNode }> = {
  active: { badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", label: "Active", icon: <RefreshCw className="h-3.5 w-3.5 text-emerald-400" /> },
  upcoming: { badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/20", label: "Upcoming", icon: <Clock className="h-3.5 w-3.5 text-blue-400" /> },
  completed: { badgeClass: "bg-muted text-muted-foreground border-border", label: "Completed", icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> },
}

export default function ProjectCyclesPage() {
  const params = useParams()
  const projectId = typeof params.id === "string" ? params.id : "1"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{CYCLES.length} cycles</p>
        <Button size="sm" className="gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" />
          New Cycle
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {CYCLES.map((cycle) => {
          const cfg = CYCLE_STATUS[cycle.status]
          return (
            <Link
              key={cycle.id}
              href={`/projects/${projectId}/cycles/${cycle.id}`}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 hover:border-primary/40 transition-all [box-shadow:var(--shadow-sm)] hover:[box-shadow:var(--shadow-md)]"
            >
              <div className="shrink-0">{cfg.icon}</div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                    {cycle.title}
                  </span>
                  <Badge variant="outline" className={cn("text-xs border px-1.5 py-0", cfg.badgeClass)}>
                    {cfg.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cycle.startDate} → {cycle.endDate}
                  {cycle.daysLeft !== null && (
                    <span className="ml-2 text-amber-400">{cycle.daysLeft}d left</span>
                  )}
                </p>
              </div>

              {cycle.status !== "upcoming" && (
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden sm:flex items-center gap-2 w-32">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", cycle.progress === 100 ? "bg-emerald-500" : "bg-primary")}
                        style={{ width: `${cycle.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{cycle.progress}%</span>
                  </div>
                  <span className="text-xs text-muted-foreground hidden md:block">
                    {cycle.completedIssues}/{cycle.totalIssues} issues
                  </span>
                </div>
              )}

              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
