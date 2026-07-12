"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  MapPin,
  Link2,
  Calendar,
  GitCommitHorizontal,
  Users,
  FolderKanban,
  CircleDot,
  CheckCircle2,
  Clock,
  Settings,
  Star,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/lib/contexts/auth-context"
import { cn } from "@/lib/utils"
import { useProjectStore } from "@/lib/store/project-store"
import { useProfileStore, type HeatWeek, type HeatCell } from "@/lib/store/profile-store"
import type { Project } from "@/lib/api/project-service"

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const PROJECT_COLORS = [
  "bg-primary", "bg-violet-500", "bg-emerald-500",
  "bg-orange-500", "bg-blue-500", "bg-pink-500",
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

function ContributionGraph({ heatmap }: Readonly<{ heatmap: HeatWeek[] }>) {
  const totalContribs = heatmap.flatMap((w) => w.days).reduce((a, cell) => a + cell.val, 0)

  return (
    <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Activity</h3>
        <span className="text-xs text-muted-foreground">{totalContribs} contributions in the last 5 months</span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {heatmap.map((week) => (
          <div key={week.id} className="flex flex-col gap-1">
            {week.days.map((cell: HeatCell) => (
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

function ProjectCard({ project: p, slug, colorClass }: Readonly<{ project: Project; slug: string; colorClass: string }>) {
  const done = p.totalIssues - p.openIssues
  const pct  = p.totalIssues > 0 ? Math.round((done / p.totalIssues) * 100) : 0
  return (
    <Link
      href={`/${slug}/projects/${p.id}`}
      className="rounded-xl border border-border bg-card p-4 [box-shadow:var(--shadow-sm)] flex flex-col gap-3 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("h-3 w-3 rounded-full shrink-0", colorClass)} />
          <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full rounded-full", colorClass)} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{done} / {p.totalIssues} issues</span>
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
  const params   = useParams()
  const slug     = typeof params.workspace === "string" ? params.workspace : ""

  const { projects, fetchProjects } = useProjectStore()
  const { stats, activity, heatmap, fetchProfile } = useProfileStore()

  useEffect(() => {
    if (slug) {
      void fetchProjects(slug)
      fetchProfile(slug).catch(console.error)
    }
  }, [slug, fetchProjects, fetchProfile])

  const displayName  = user?.displayName ?? (user ? `${user.firstName} ${user.lastName}` : "Your Name")
  const email        = user?.email ?? "you@taskforce.io"
  const plan         = user?.planType ?? "FREE"
  const isPro        = plan === "BUSINESS" || plan === "ENTERPRISE"

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Header card */}
      <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <UserAvatar
            email={email}
            name={displayName}
            firstName={user?.firstName}
            lastName={user?.lastName}
            avatarUrl={user?.avatarUrl}
            className="h-20 w-20 shrink-0"
            fallbackClassName="text-2xl font-bold"
          />

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
                <span className="font-medium text-foreground">{stats?.teammateCount ?? "—"}</span> teammates
              </button>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <FolderKanban className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{projects.length}</span> projects
              </button>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <GitCommitHorizontal className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{stats?.cyclesCompleted ?? "—"}</span> cycles
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Issues created",   value: stats?.issuesCreated   ?? "—", icon: <CircleDot className="h-4 w-4" /> },
          { label: "Closed",           value: stats?.issuesClosed    ?? "—", icon: <CheckCircle2 className="h-4 w-4" /> },
          { label: "Cycles completed", value: stats?.cyclesCompleted ?? "—", icon: <GitCommitHorizontal className="h-4 w-4" /> },
          { label: "Days active",      value: stats?.daysActive      ?? "—", icon: <Clock className="h-4 w-4" /> },
        ].map((stat) => (
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
          <ContributionGraph heatmap={heatmap} />

          {/* Recent activity feed */}
          <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)]">
            <div className="px-5 py-4 border-b border-border/70">
              <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
            </div>
            <div className="divide-y divide-border/40">
              {activity.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-3">
                  {ACTIVITY_TYPE_ICON[item.type] ?? ACTIVITY_TYPE_ICON["issue_created"]}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      <span className="text-muted-foreground font-mono text-xs mr-1">{item.issueIdentifier}</span>
                      {item.issueTitle}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{item.projectName}</span>
                </div>
              ))}
              {activity.length === 0 && (
                <p className="px-5 py-6 text-sm text-muted-foreground text-center">Aucune activité récente.</p>
              )}
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
            {projects.slice(0, 3).map((p, idx) => (
              <ProjectCard
                key={p.id}
                project={p}
                slug={slug}
                colorClass={PROJECT_COLORS[idx % PROJECT_COLORS.length]}
              />
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
