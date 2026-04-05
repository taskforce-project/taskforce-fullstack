"use client"

import Link from "next/link"
import {
  MapPin,
  Link2,
  Calendar,
  GitCommitHorizontal,
  Star,
  Users,
  FolderKanban,
  CircleDot,
  CheckCircle2,
  Clock,
  Settings,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/lib/contexts/auth-context"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const ACTIVITY_WEEKS = 20
const ACTIVITY_DAYS  = 7

interface HeatCell { id: string; val: number }
interface HeatWeek { id: string; days: HeatCell[] }

/** Generate a pseudo-random heat map seeded by position */
function genHeatmap(): HeatWeek[] {
  const grid: HeatWeek[] = []
  for (let w = 0; w < ACTIVITY_WEEKS; w++) {
    const days: HeatCell[] = []
    for (let d = 0; d < ACTIVITY_DAYS; d++) {
      const v = Math.floor(Math.abs(Math.sin(w * 7 + d + 1) * 5))
      days.push({ id: `w${w}d${d}`, val: v })
    }
    grid.push({ id: `w${w}`, days })
  }
  return grid
}

const HEATMAP = genHeatmap()

const RECENT_PROJECTS = [
  { id: "1", name: "Website Redesign",      issues: 28, done: 19, color: "bg-primary",      stars: 4 },
  { id: "2", name: "Mobile App v2",         issues: 14, done: 11, color: "bg-violet-500",   stars: 2 },
  { id: "3", name: "API v2",                issues: 22, done: 4,  color: "bg-emerald-500",  stars: 1 },
]

const ACTIVITY_FEED = [
  { id: "1", type: "issue_closed",   text: 'Closed "Fix login redirect loop"',              time: "2 hours ago",  color: "text-emerald-400" },
  { id: "2", type: "issue_created",  text: 'Created "Add dark mode to onboarding"',         time: "4 hours ago",  color: "text-primary" },
  { id: "3", type: "comment",        text: 'Commented on "Rate limit strategy for API v2"', time: "Yesterday",    color: "text-yellow-400" },
  { id: "4", type: "issue_closed",   text: 'Closed "Setup CI/CD pipeline"',                 time: "Yesterday",    color: "text-emerald-400" },
  { id: "5", type: "cycle_started",  text: 'Started cycle "Sprint 5" in Website Redesign',  time: "2 days ago",   color: "text-violet-400" },
  { id: "6", type: "issue_created",  text: 'Created "Implement drag-and-drop kanban"',      time: "3 days ago",   color: "text-primary" },
  { id: "7", type: "issue_closed",   text: 'Closed "Migrate auth to Keycloak"',             time: "4 days ago",   color: "text-emerald-400" },
  { id: "8", type: "comment",        text: 'Commented on "PWA offline support"',            time: "5 days ago",   color: "text-yellow-400" },
]

const STATS = [
  { label: "Issues created",   value: 86, icon: <CircleDot className="h-4 w-4" /> },
  { label: "Closed",           value: 61, icon: <CheckCircle2 className="h-4 w-4" /> },
  { label: "Cycles completed", value: 9,  icon: <GitCommitHorizontal className="h-4 w-4" /> },
  { label: "Days active",      value: 47, icon: <Clock className="h-4 w-4" /> },
]

const ACTIVITY_TYPE_ICON: Record<string, React.ReactNode> = {
  issue_closed:  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />,
  issue_created: <CircleDot    className="h-3.5 w-3.5 text-primary shrink-0" />,
  comment:       <GitCommitHorizontal className="h-3.5 w-3.5 text-yellow-400 shrink-0" />,
  cycle_started: <Clock        className="h-3.5 w-3.5 text-violet-400 shrink-0" />,
}

const HEAT_COLORS = [
  "bg-muted",
  "bg-emerald-900/60",
  "bg-emerald-700/70",
  "bg-emerald-500/80",
  "bg-emerald-400",
  "bg-emerald-300",
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ContributionGraph() {
  const totalContribs = HEATMAP.flatMap((w) => w.days).reduce((a, cell) => a + cell.val, 0)

  return (
    <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Activity</h3>
        <span className="text-xs text-muted-foreground">{totalContribs} contributions in the last 5 months</span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {HEATMAP.map((week) => (
          <div key={week.id} className="flex flex-col gap-1">
            {week.days.map((cell) => (
              <div
                key={cell.id}
                title={`${cell.val} contribution${cell.val === 1 ? "" : "s"}`}
                className={cn("h-3 w-3 rounded-sm transition-colors", HEAT_COLORS[Math.min(cell.val, HEAT_COLORS.length - 1)])}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-1.5 mt-2">
        <span className="text-[10px] text-muted-foreground">Less</span>
        {HEAT_COLORS.map((c) => (
          <div key={c} className={cn("h-3 w-3 rounded-sm", c)} />
        ))}
        <span className="text-[10px] text-muted-foreground">More</span>
      </div>
    </div>
  )
}

function ProjectCard({ project: p }: { readonly project: typeof RECENT_PROJECTS[number] }) {
  const pct = Math.round((p.done / p.issues) * 100)
  return (
    <Link
      href={`/projects/${p.id}`}
      className="rounded-xl border border-border bg-card p-4 [box-shadow:var(--shadow-sm)] flex flex-col gap-3 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("h-3 w-3 rounded-full shrink-0", p.color)} />
          <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground shrink-0">
          <Star className="h-3 w-3" />
          <span className="text-xs">{p.stars}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full rounded-full", p.color)} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{p.done} / {p.issues} issues</span>
          <span>{pct}%</span>
        </div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const { user } = useAuth()

  const displayName  = user ? `${user.firstName} ${user.lastName}` : "Your Name"
  const initials     = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : "ME"
  const email        = user?.email ?? "you@taskforce.io"
  const plan         = user?.plan ?? "free"
  const isPro        = plan === "pro" || plan === "enterprise"

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Header card */}
      <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <Avatar className="h-20 w-20 shrink-0">
            <AvatarFallback className="text-2xl font-bold bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
                <p className="text-sm text-muted-foreground">{email}</p>
              </div>
              <div className="flex items-center gap-2">
                {isPro && (
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/20 gap-1 text-xs">
                    <Star className="h-3 w-3" />Pro
                  </Badge>
                )}
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
                  <Link href="/settings">
                    <Settings className="h-3.5 w-3.5" />
                    Edit profile
                  </Link>
                </Button>
              </div>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Paris, France</span>
              <span className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> taskforce.io</span>
              <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Joined January 2025</span>
            </div>

            {/* Follow-style counters */}
            <div className="flex items-center gap-4 mt-4">
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Users className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">4</span> teammates
              </button>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <FolderKanban className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">3</span> projects
              </button>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <GitCommitHorizontal className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">9</span> cycles
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATS.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4 [box-shadow:var(--shadow-sm)] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{stat.label}</span>
              <span className="text-muted-foreground">{stat.icon}</span>
            </div>
            <span className="text-2xl font-bold text-foreground tabular-nums">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Main 2-col layout */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {/* Activity graph */}
          <ContributionGraph />

          {/* Recent activity feed */}
          <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)]">
            <div className="px-5 py-4 border-b border-border/70">
              <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
            </div>
            <div className="divide-y divide-border/40">
              {ACTIVITY_FEED.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-3">
                  {ACTIVITY_TYPE_ICON[item.type]}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{item.text}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Projects */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Projects</h3>
              <Link href="/projects" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            {RECENT_PROJECTS.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>

          <Separator />

          {/* Plan card */}
          <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Your plan</h3>
              <Badge
                variant="outline"
                className={cn(
                  "capitalize text-xs",
                  isPro
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {plan}
              </Badge>
            </div>
            {!isPro && (
              <>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Upgrade to Pro to unlock analytics, unlimited cycles, and advanced features.
                </p>
                <Button size="sm" className="h-8 text-xs w-full gap-1.5" asChild>
                  <Link href="/settings">
                    <Star className="h-3.5 w-3.5" />
                    Upgrade to Pro
                  </Link>
                </Button>
              </>
            )}
            {isPro && (
              <p className="text-xs text-muted-foreground">All features unlocked. Thanks for being a Pro member!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
