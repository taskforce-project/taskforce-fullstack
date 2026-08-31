"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  CalendarRange,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useProjectStore } from "@/lib/store/project-store"
import { useCycleStore } from "@/lib/store/cycle-store"
import type { Cycle as ApiCycle } from "@/lib/api/cycle-service"
import type { Project } from "@/lib/api/project-service"
import { getScheduledIssues } from "@/lib/api/issue-service"
import type { Issue as ApiIssue } from "@/lib/api/issue-service"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TimeScale = "week" | "month" | "quarter"

interface RoadmapItem {
  id: string
  title: string
  type: "project" | "milestone" | "cycle"
  project: { name: string; emoji: string; color: string }
  startDate: string // ISO
  endDate: string   // ISO
  progress: number  // 0–100
  color: string     // Tailwind bg-* class
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
  "bg-slate-500", "bg-orange-500", "bg-pink-500", "bg-cyan-500",
]

function projectColor(id: number): string {
  return PROJECT_COLORS[id % PROJECT_COLORS.length]
}

const TYPE_COLORS: Record<RoadmapItem["type"], string> = {
  project:   "border-border/40 text-muted-foreground",
  cycle:     "border-blue-500/30 bg-blue-500/10 text-blue-400",
  milestone: "border-amber-500/30 bg-amber-500/10 text-amber-400",
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function zoomIn(s: TimeScale): TimeScale {
  return s === "quarter" ? "month" : "week"
}

function zoomOut(s: TimeScale): TimeScale {
  return s === "week" ? "month" : "quarter"
}

// Returns ISO week number-ish label
function weekLabel(date: Date): string {
  return `W${Math.ceil(date.getDate() / 7)} ${date.toLocaleDateString("en-US", { month: "short" })}`
}

// Plage de dates lisible pour la colonne label (QA Q-11)
function formatRange(item: RoadmapItem): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
  const start = new Date(item.startDate).toLocaleDateString("en-US", opts)
  if (item.type === "milestone") return start
  const end = new Date(item.endDate).toLocaleDateString("en-US", opts)
  return `${start} – ${end}`
}

// ─────────────────────────────────────────────────────────────────────────────
// GanttGridLines
// ─────────────────────────────────────────────────────────────────────────────

type GanttGridLinesProps = Readonly<{
  columns: { startDate: Date; days: number }[]
  dayPx: number
  faint?: boolean
}>

function GanttGridLines({ columns, dayPx, faint = false }: GanttGridLinesProps) {
  const offsets = columns.map((_, i) =>
    columns.slice(0, i).reduce((acc, c) => acc + c.days * dayPx, 0)
  )
  return (
    <>
      {columns.map((col, i) => (
        <div
          key={col.startDate.toISOString()}
          className={cn("absolute top-0 bottom-0 w-px", faint ? "bg-border/20" : "bg-border/30")}
          style={{ left: offsets[i] }}
        />
      ))}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GanttBar
// ─────────────────────────────────────────────────────────────────────────────

interface GanttBarProps {
  item: RoadmapItem
  viewStart: Date
  totalDays: number
  dayPx: number
}

function GanttBar({ item, viewStart, totalDays, dayPx }: Readonly<GanttBarProps>) {
  const start  = new Date(item.startDate)
  const end    = new Date(item.endDate)
  const isMile = item.type === "milestone"

  const leftDays  = daysBetween(viewStart, start)
  const widthDays = Math.max(isMile ? 1 : daysBetween(start, end), 1)

  // Clip to visible range
  const visibleLeft  = Math.max(leftDays, 0)
  const visibleRight = Math.min(leftDays + widthDays, totalDays)

  if (visibleRight <= 0 || visibleLeft >= totalDays) return null

  const left  = visibleLeft  * dayPx
  const width = Math.max((visibleRight - visibleLeft) * dayPx, isMile ? 12 : 4)

  if (isMile) {
    return (
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rotate-45 border-2 border-amber-400 bg-amber-400/30 z-10"
        style={{ left }}
        title={item.title}
      />
    )
  }

  return (
    <div
      className={cn("absolute top-1/2 -translate-y-1/2 rounded-full h-5 flex items-center overflow-hidden", item.color)}
      style={{ left, width }}
      title={`${item.title} (${item.progress}%)`}
    >
      {item.progress > 0 && (
        <div
          className="h-full rounded-full bg-white/30 shrink-0"
          style={{ width: `${item.progress}%` }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Data mapping
// ─────────────────────────────────────────────────────────────────────────────

function mapProjectCycles(cycles: ApiCycle[], p: Project): RoadmapItem[] {
  return cycles
    .filter((c) => c.startDate && c.endDate)
    .map((c) => ({
      id:        `cycle-${c.id}`,
      title:     c.name,
      type:      "cycle" as const,
      project:   { name: p.name, emoji: p.identifier.slice(0, 2), color: projectColor(p.id) },
      startDate: c.startDate!,
      endDate:   c.endDate!,
      progress:  c.issueCount > 0 ? Math.round((c.completedCount / c.issueCount) * 100) : 0,
      color:     projectColor(p.id),
    }))
}

function mapScheduledIssue(issue: ApiIssue, projectsById: Map<number, Project>): RoadmapItem | null {
  // projectId n'est pas dans ApiIssue directement - on l'infère depuis l'identifier (ex: "WEB-42" → project identifier "WEB")
  const prefix = issue.identifier.replace(/-\d+$/, "")
  const proj = Array.from(projectsById.values()).find((p) => p.identifier === prefix)
  if (!proj) return null

  const start = issue.startDate ?? issue.dueDate!
  const end   = issue.dueDate   ?? issue.startDate!
  const isMilestone = !issue.startDate || !issue.dueDate

  return {
    id:        `issue-${issue.id}`,
    title:     issue.title,
    type:      isMilestone ? "milestone" : "cycle",
    project:   { name: proj.name, emoji: proj.identifier.slice(0, 2), color: projectColor(proj.id) },
    startDate: start,
    endDate:   end,
    progress:  issue.status.category === "COMPLETED" ? 100 : 0,
    color:     projectColor(proj.id),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const ROW_H = 44 // px per row
const LABEL_W = 240

/**
 * Gantt roadmap réutilisable.
 * - Sans `projectId` : timeline globale du workspace (page Roadmap).
 * - Avec `projectId` : timeline filtrée sur un seul projet (onglet Roadmap d'un projet).
 */
export function RoadmapGantt({ slug, projectId }: { readonly slug: string; readonly projectId?: number }) {
  const { fetchProjects } = useProjectStore()
  const { fetchCycles }   = useCycleStore()

  const [items, setItems] = useState<RoadmapItem[]>([])

  useEffect(() => {
    if (!slug) return

    async function load() {
      const allProjs = await fetchProjects(slug)
      const projs = projectId == null ? allProjs : allProjs.filter((p) => p.id === projectId)
      const projectsById = new Map(projs.map((p) => [p.id, p]))

      const projectItems: RoadmapItem[] = projs.map((p) => ({
        id:        `project-${p.id}`,
        title:     p.name,
        type:      "project",
        project:   { name: p.name, emoji: p.identifier.slice(0, 2), color: projectColor(p.id) },
        startDate: p.createdAt.slice(0, 10),
        endDate:   p.updatedAt.slice(0, 10),
        progress:  p.totalIssues > 0 ? Math.round((p.totalIssues - p.openIssues) / p.totalIssues * 100) : 0,
        color:     projectColor(p.id),
      }))

      const [cycleResults, scheduledIssues] = await Promise.all([
        Promise.all(projs.map(async (p) => ({ p, cycles: await fetchCycles(slug, p.id) }))),
        getScheduledIssues(slug),
      ])

      const cycleItems: RoadmapItem[] = cycleResults.flatMap(({ p, cycles }) =>
        mapProjectCycles(cycles, p)
      )

      const issueItems: RoadmapItem[] = scheduledIssues
        .map((i) => mapScheduledIssue(i, projectsById))
        .filter((x): x is RoadmapItem => x !== null)

      setItems([...projectItems, ...cycleItems, ...issueItems])
    }

    void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, projectId])

  const today = useMemo(() => new Date(), [])

  const [scale,      setScale]      = useState<TimeScale>("month")
  const [viewOffset, setViewOffset] = useState(0) // number of "pages" offset
  const [filterType, setFilterType] = useState<RoadmapItem["type"] | "all">("all")
  const [collapsed,  setCollapsed]  = useState<Set<string>>(new Set())

  const scrollRef = useRef<HTMLDivElement>(null)

  const { columns, viewStart, totalDays, dayPx } = useMemo(() => {
    let windowMonths: number
    let pxPerDay: number
    if (scale === "week")         { windowMonths = 3;  pxPerDay = 28 }
    else if (scale === "month")  { windowMonths = 6;  pxPerDay = 12 }
    else                         { windowMonths = 12; pxPerDay = 5  }

    const base = startOfMonth(addMonths(today, viewOffset * windowMonths))

    const cols: { label: string; subLabel?: string; startDate: Date; days: number }[] = []
    let cursor = new Date(base)
    let total  = 0

    for (let m = 0; m < windowMonths; m++) {
      const next = addMonths(cursor, 1)
      const days = daysBetween(cursor, next)
      const label = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })

      if (scale === "week") {
        // split into ~4 week sub-cols
        let weekCursor = new Date(cursor)
        while (weekCursor < next) {
          const weekEnd = new Date(Math.min(weekCursor.getTime() + 7 * 86_400_000, next.getTime()))
          const wdays   = daysBetween(weekCursor, weekEnd)
          cols.push({ label: weekLabel(weekCursor), startDate: new Date(weekCursor), days: wdays })
          total += wdays
          weekCursor = weekEnd
        }
      } else {
        cols.push({ label, startDate: new Date(cursor), days })
        total += days
      }
      cursor = next
    }

    return { columns: cols, viewStart: base, totalDays: total, dayPx: pxPerDay }
  }, [scale, viewOffset, today])

  const totalPx = totalDays * dayPx

  // Today line
  const todayLeft = Math.max(daysBetween(viewStart, today), 0) * dayPx

  const filtered = filterType === "all"
    ? items
    : items.filter((i) => i.type === filterType)

  // Group by project
  const projectGroups = useMemo(() => {
    const map = new Map<string, RoadmapItem[]>()
    for (const item of filtered) {
      if (!map.has(item.project.name)) map.set(item.project.name, [])
      const bucket = map.get(item.project.name)
      if (bucket) bucket.push(item)
    }
    return Array.from(map.entries())
  }, [filtered])

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const scoped = projectId != null

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header - masqué en mode onglet projet (le layout du projet fournit déjà le titre) */}
      {!scoped && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Roadmap</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Timeline across all projects
            </p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Scale */}
        <div className="flex items-center rounded-lg bg-muted p-1 gap-0.5">
          {(["week", "month", "quarter"] as TimeScale[]).map((s) => (
            <button
              key={s}
              onClick={() => { setScale(s); setViewOffset(0) }}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                scale === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Nav */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewOffset((v) => v - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => setViewOffset(0)}>
            Today
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewOffset((v) => v + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(zoomIn)}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(zoomOut)}>
            <ZoomOut className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1" />

        {/* Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs capitalize">
              <CalendarRange className="h-3.5 w-3.5" />
              {filterType === "all" ? "All types" : filterType}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setFilterType("all")}>All types</DropdownMenuItem>
            {/* « Projects » n'a pas de sens en mode onglet projet (un seul projet) */}
            {!scoped && <DropdownMenuItem onClick={() => setFilterType("project")}>Projects</DropdownMenuItem>}
            <DropdownMenuItem onClick={() => setFilterType("cycle")}>Cycles</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterType("milestone")}>Milestones</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Gantt table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Column headers */}
        <div
          className="flex border-b border-border bg-muted/30"
          style={{ paddingLeft: LABEL_W }}
        >
          <div className="overflow-hidden" style={{ width: totalPx }}>
            <div className="flex">
              {columns.map((col) => (
                <div
                  key={col.startDate.toISOString()}
                  className="shrink-0 px-2 py-2 border-r border-border/50 last:border-0"
                  style={{ width: col.days * dayPx }}
                >
                  <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">{col.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rows */}
        <div ref={scrollRef} className="overflow-x-auto">
          <div style={{ minWidth: LABEL_W + totalPx }}>
            {projectGroups.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No planned items to display.
              </div>
            )}
            {projectGroups.map(([projectName, groupItems]) => {
              const isCollapsed = collapsed.has(projectName)
              const firstItem   = groupItems[0]
              const projItem    = groupItems.find((i) => i.type === "project")
              const itemCount   = groupItems.length

              return (
                <div key={projectName}>
                  {/* En-tête de groupe par projet - inutile en mode onglet projet (un seul projet) */}
                  {!scoped && (
                  <div className="flex items-center border-b border-border/50 bg-muted/20" style={{ height: ROW_H }}>
                    {/* Label cell */}
                    <div
                      className="shrink-0 flex items-center gap-2 px-3 border-r border-border/50 h-full"
                      style={{ width: LABEL_W }}
                    >
                      <button onClick={() => toggleCollapse(projectName)} className="flex items-center gap-2 min-w-0 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors">
                        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                        <span className={cn("size-2 shrink-0 rounded-full", firstItem.project.color)} />
                        <span className="truncate">{projectName}</span>
                        <span className="shrink-0 text-xs font-normal text-muted-foreground">{itemCount}</span>
                        {projItem && <span className="shrink-0 text-[10px] font-normal text-muted-foreground tabular-nums">· {projItem.progress}%</span>}
                      </button>
                    </div>

                    {/* Timeline cell - empty for group header */}
                    <div className="relative flex-1 h-full" style={{ width: totalPx }}>
                      {/* Today line */}
                      {todayLeft >= 0 && todayLeft <= totalPx && (
                        <div
                          className="absolute top-0 bottom-0 w-px bg-primary/50 z-10 pointer-events-none"
                          style={{ left: todayLeft }}
                        />
                      )}
                      {/* Grid lines */}
                      <GanttGridLines columns={columns} dayPx={dayPx} />
                    </div>
                  </div>
                  )}

                  {/* Item rows - toujours visibles en scoped (pas de repli) */}
                  {(scoped || !isCollapsed) && groupItems.map((item) => (
                    <div key={item.id} className="flex items-center border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors group" style={{ height: ROW_H }}>
                      {/* Label */}
                      <div
                        className={cn("shrink-0 flex flex-col justify-center gap-0.5 px-3 border-r border-border/50 h-full", scoped ? "pl-3" : "pl-9")}
                        style={{ width: LABEL_W }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className={cn("h-4 shrink-0 text-[10px] px-1.5 font-normal capitalize", TYPE_COLORS[item.type])}>
                            {item.type}
                          </Badge>
                          <span className="text-xs text-foreground truncate">{item.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5 pl-0.5 text-[10px] text-muted-foreground">
                          <span className="whitespace-nowrap">{formatRange(item)}</span>
                          {item.type !== "milestone" && (
                            <span className="tabular-nums">· {item.progress}%</span>
                          )}
                        </div>
                      </div>

                      {/* Timeline cell */}
                      <div className="relative h-full" style={{ width: totalPx }}>
                        {/* Today line */}
                        {todayLeft >= 0 && todayLeft <= totalPx && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-primary/50 z-10 pointer-events-none"
                            style={{ left: todayLeft }}
                          />
                        )}
                        {/* Grid lines */}
                        <GanttGridLines columns={columns} dayPx={dayPx} faint />
                        {/* Bar */}
                        <GanttBar item={item} viewStart={viewStart} totalDays={totalDays} dayPx={dayPx} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Legend - couleur = projet, forme = type (QA Q-12) */}
      <div className="flex items-center gap-x-4 gap-y-2 text-xs text-muted-foreground flex-wrap">
        {/* Échantillon « une couleur par projet » */}
        <span className="flex items-center gap-1.5">
          <span className="inline-flex">
            <span className="size-2.5 rounded-full bg-blue-500 inline-block" />
            <span className="size-2.5 rounded-full bg-violet-500 -ml-1 inline-block" />
            <span className="size-2.5 rounded-full bg-emerald-500 -ml-1 inline-block" />
          </span>
          One color per project
        </span>
        <span className="text-border">|</span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded-full bg-muted-foreground/40 inline-block" />
          Bar = duration
        </span>
        <span className="flex items-center gap-1.5">
          <span className="relative h-3 w-6 rounded-full bg-muted-foreground/40 inline-block overflow-hidden">
            <span className="absolute inset-y-0 left-0 w-1/2 bg-white/40" />
          </span>
          Lighter fill = progress
        </span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rotate-45 border-2 border-amber-400 bg-amber-400/30 inline-block" />Milestone</span>
        <span className="flex items-center gap-1.5"><span className="h-4 w-px bg-primary/60 inline-block" />Today</span>
      </div>
    </div>
  )
}
