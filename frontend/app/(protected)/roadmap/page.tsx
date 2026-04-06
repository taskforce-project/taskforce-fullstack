"use client"

import { useMemo, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Plus,
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
// Mock data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_ITEMS: RoadmapItem[] = [
  { id: "1",  title: "Mobile App v1.0",           type: "project",   project: { name: "Mobile App",    emoji: "📱", color: "bg-blue-500"    }, startDate: "2026-02-01", endDate: "2026-05-15", progress: 62, color: "bg-blue-500"    },
  { id: "2",  title: "Sprint 3 — Onboarding",     type: "cycle",     project: { name: "Mobile App",    emoji: "📱", color: "bg-blue-500"    }, startDate: "2026-03-03", endDate: "2026-03-16", progress: 100,color: "bg-blue-400"    },
  { id: "3",  title: "Sprint 4 — Auth & Billing", type: "cycle",     project: { name: "Mobile App",    emoji: "📱", color: "bg-blue-500"    }, startDate: "2026-04-01", endDate: "2026-04-14", progress: 58, color: "bg-blue-400"    },
  { id: "4",  title: "Website Redesign",          type: "project",   project: { name: "Website",       emoji: "🎨", color: "bg-violet-500"  }, startDate: "2026-03-10", endDate: "2026-06-01", progress: 40, color: "bg-violet-500"  },
  { id: "5",  title: "Sprint 7 — Dashboard v2",   type: "cycle",     project: { name: "Website",       emoji: "🎨", color: "bg-violet-500"  }, startDate: "2026-03-31", endDate: "2026-04-11", progress: 75, color: "bg-violet-400"  },
  { id: "6",  title: "API v2 Launch",             type: "project",   project: { name: "API v2",        emoji: "⚡", color: "bg-emerald-500" }, startDate: "2026-01-15", endDate: "2026-04-30", progress: 78, color: "bg-emerald-500" },
  { id: "7",  title: "Rate Limiting Sprint",      type: "cycle",     project: { name: "API v2",        emoji: "⚡", color: "bg-emerald-500" }, startDate: "2026-04-15", endDate: "2026-04-28", progress: 0,  color: "bg-emerald-400" },
  { id: "8",  title: "Public Beta",               type: "milestone", project: { name: "API v2",        emoji: "⚡", color: "bg-emerald-500" }, startDate: "2026-04-30", endDate: "2026-04-30", progress: 0,  color: "bg-emerald-500" },
  { id: "9",  title: "Analytics Platform",        type: "project",   project: { name: "Analytics",     emoji: "📊", color: "bg-amber-500"   }, startDate: "2026-03-01", endDate: "2026-06-30", progress: 30, color: "bg-amber-500"   },
  { id: "10", title: "Q2 Analytics Sprint",       type: "cycle",     project: { name: "Analytics",     emoji: "📊", color: "bg-amber-500"   }, startDate: "2026-04-20", endDate: "2026-05-03", progress: 0,  color: "bg-amber-400"   },
  { id: "11", title: "Design System v1",          type: "project",   project: { name: "Design System", emoji: "💎", color: "bg-slate-500"   }, startDate: "2026-01-20", endDate: "2026-04-20", progress: 88, color: "bg-slate-500"   },
  { id: "12", title: "Component Docs Release",    type: "milestone", project: { name: "Design System", emoji: "💎", color: "bg-slate-500"   }, startDate: "2026-04-20", endDate: "2026-04-20", progress: 0,  color: "bg-slate-400"   },
]

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

// Returns ISO week number-ish label
function weekLabel(date: Date): string {
  return `W${Math.ceil(date.getDate() / 7)} ${date.toLocaleDateString("en-US", { month: "short" })}`
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
// Page
// ─────────────────────────────────────────────────────────────────────────────

const ROW_H = 44 // px per row

export default function RoadmapPage() {
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
    ? MOCK_ITEMS
    : MOCK_ITEMS.filter((i) => i.type === filterType)

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

  const LABEL_W = 240

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roadmap</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Timeline across all projects
          </p>
        </div>
        <Button size="sm" className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Add item
        </Button>
      </div>

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
            <DropdownMenuItem onClick={() => setFilterType("project")}>Projects</DropdownMenuItem>
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
        <div
          ref={scrollRef}
          className="overflow-x-auto"
        >
          <div style={{ minWidth: LABEL_W + totalPx }}>
            {projectGroups.map(([projectName, items]) => {
              const isCollapsed = collapsed.has(projectName)
              const firstItem   = items[0]

              return (
                <div key={projectName}>
                  {/* Project group header row */}
                  <div className="flex items-center border-b border-border/50 bg-muted/20" style={{ height: ROW_H }}>
                    {/* Label cell */}
                    <div
                      className="shrink-0 flex items-center gap-2 px-3 border-r border-border/50 h-full"
                      style={{ width: LABEL_W }}
                    >
                      <button onClick={() => toggleCollapse(projectName)} className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors">
                        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                        <span className="text-base">{firstItem.project.emoji}</span>
                        <span className="truncate">{projectName}</span>
                      </button>
                    </div>

                    {/* Timeline cell — empty for group header */}
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

                  {/* Item rows */}
                  {!isCollapsed && items.map((item) => (
                    <div key={item.id} className="flex items-center border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors group" style={{ height: ROW_H }}>
                      {/* Label */}
                      <div
                        className="shrink-0 flex items-center gap-2 px-3 pl-9 border-r border-border/50 h-full"
                        style={{ width: LABEL_W }}
                      >
                        <Badge variant="outline" className={cn("h-4 text-[10px] px-1.5 font-normal capitalize", TYPE_COLORS[item.type])}>
                          {item.type}
                        </Badge>
                        <span className="text-xs text-foreground truncate">{item.title}</span>
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

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded-full bg-blue-500 opacity-80 inline-block" />Project</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded-full bg-blue-400 opacity-60 inline-block" />Cycle</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rotate-45 border-2 border-amber-400 bg-amber-400/30 inline-block" />Milestone</span>
        <span className="flex items-center gap-1.5"><span className="h-4 w-px bg-primary/60 inline-block" />Today</span>
      </div>
    </div>
  )
}
