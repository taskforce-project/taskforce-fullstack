"use client"

import { BarChart3, TrendingUp, TrendingDown, Zap, FolderKanban, CircleDot, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useTranslation } from "@/lib/i18n"
import { useAuth } from "@/lib/contexts/auth-context"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const OVERVIEW_STATS = [
  { key: "issuesCreated", value: 42, change: +12, icon: <CircleDot className="h-4 w-4" /> },
  { key: "issuesCompleted", value: 31, change: +8, icon: <RefreshCw className="h-4 w-4" /> },
  { key: "cyclesCompleted", value: 5, change: +1, icon: <BarChart3 className="h-4 w-4" /> },
  { key: "activeProjects", value: 3, change: 0, icon: <FolderKanban className="h-4 w-4" /> },
]

// Velocity: weekly issue completions over 8 weeks
const VELOCITY_DATA = [
  { week: "W4", completed: 4 },
  { week: "W5", completed: 7 },
  { week: "W6", completed: 5 },
  { week: "W7", completed: 9 },
  { week: "W8", completed: 6 },
  { week: "W9", completed: 11 },
  { week: "W10", completed: 8 },
  { week: "W11", completed: 13 },
]

const TEAM_WORKLOAD = [
  { name: "You", initials: "ME", color: "bg-primary", open: 7, completed: 12 },
  { name: "Sophie Martin", initials: "SM", color: "bg-violet-500", open: 5, completed: 9 },
  { name: "Emma Petit", initials: "EP", color: "bg-emerald-500", open: 4, completed: 7 },
  { name: "Thomas Bernard", initials: "TB", color: "bg-orange-500", open: 3, completed: 5 },
]

const PROJECT_PROGRESS = [
  { name: "🚀 Frontend v2", total: 28, done: 19, color: "bg-primary" },
  { name: "🔒 Auth Overhaul", total: 14, done: 11, color: "bg-violet-500" },
  { name: "📊 Analytics SDK", total: 22, done: 4, color: "bg-emerald-500" },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  change,
  icon,
}: {
  readonly label: string
  readonly value: number
  readonly change: number
  readonly icon: React.ReactNode
}) {
  const isPositive = change > 0
  const isNeutral = change === 0
  return (
    <div className="rounded-xl border border-border bg-card p-4 [box-shadow:var(--shadow-sm)] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-3xl font-bold text-foreground tabular-nums">{value}</span>
        {!isNeutral && (
          <span className={cn("flex items-center gap-0.5 text-xs font-medium", isPositive ? "text-emerald-400" : "text-red-400")}>
            {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {isPositive ? "+" : ""}{change}
          </span>
        )}
      </div>
    </div>
  )
}

function VelocityBar({ week, completed, max }: { readonly week: string; readonly completed: number; readonly max: number }) {
  const pct = Math.round((completed / max) * 100)
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs font-medium text-foreground">{completed}</span>
      <div className="w-8 bg-muted rounded-sm overflow-hidden" style={{ height: "80px" }}>
        <div
          className="w-full bg-primary rounded-sm transition-all"
          style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{week}</span>
    </div>
  )
}

function UpgradeGate({ title, description }: { readonly title: string; readonly description: string }) {
  return (
    <div className="relative rounded-xl border border-border bg-card p-8 [box-shadow:var(--shadow-sm)] overflow-hidden flex flex-col items-center text-center gap-4">
      {/* Blur overlay */}
      <div className="absolute inset-0 backdrop-blur-[2px] bg-background/60 z-10 flex flex-col items-center justify-center gap-4 p-8">
        <div className="flex items-center gap-2 rounded-full bg-amber-500/15 border border-amber-500/20 px-3 py-1">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-semibold text-amber-400">Pro</span>
        </div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
        <Button size="sm" className="gap-1.5 h-8 text-xs">
          <Zap className="h-3.5 w-3.5" />
          Upgrade to Pro
        </Button>
      </div>
      {/* Blurred background content */}
      <div className="opacity-30 pointer-events-none select-none">
        <div className="h-40 w-full rounded bg-muted" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const isPro = user?.plan === "pro" || user?.plan === "enterprise"
  const maxVelocity = Math.max(...VELOCITY_DATA.map((d) => d.completed))

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("analytics.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("analytics.subtitle")}</p>
      </div>

      {/* Overview stats — visible to all */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t("analytics.overview")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {OVERVIEW_STATS.map((stat) => (
            <StatCard
              key={stat.key}
              label={t(`analytics.${stat.key}`)}
              value={stat.value}
              change={stat.change}
              icon={stat.icon}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <div className="rounded-xl border border-border bg-card px-4 py-3 [box-shadow:var(--shadow-sm)] flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("analytics.completionRate")}</span>
            <span className="text-xl font-bold text-emerald-400 tabular-nums">74%</span>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3 [box-shadow:var(--shadow-sm)] flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("analytics.avgCycleTime")}</span>
            <span className="text-xl font-bold text-foreground tabular-nums">
              4.2 <span className="text-sm font-normal text-muted-foreground">{t("analytics.days")}</span>
            </span>
          </div>
        </div>
      </section>

      {/* Velocity — Pro only */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("analytics.velocity")}</h2>
          {!isPro && (
            <Badge variant="outline" className="text-xs border px-1.5 py-0 bg-amber-500/15 text-amber-400 border-amber-500/20">
              Pro
            </Badge>
          )}
        </div>
        {isPro ? (
          <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)]">
            <div className="flex items-end gap-4 justify-between">
              {VELOCITY_DATA.map((d) => (
                <VelocityBar key={d.week} week={d.week} completed={d.completed} max={maxVelocity} />
              ))}
            </div>
          </div>
        ) : (
          <UpgradeGate title={t("analytics.upgradeTitle")} description={t("analytics.upgradeDesc")} />
        )}
      </section>

      {/* Workload — Pro only */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("analytics.workload")}</h2>
          {!isPro && (
            <Badge variant="outline" className="text-xs border px-1.5 py-0 bg-amber-500/15 text-amber-400 border-amber-500/20">
              Pro
            </Badge>
          )}
        </div>
        {isPro ? (
          <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] overflow-hidden">
            {TEAM_WORKLOAD.map((member, i) => {
              const total = member.open + member.completed
              const pct = Math.round((member.completed / total) * 100)
              return (
                <div
                  key={member.name}
                  className={cn("flex items-center gap-4 px-4 py-3", i < TEAM_WORKLOAD.length - 1 && "border-b border-border/50")}
                >
                  <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[9px] font-medium text-white shrink-0", member.color)}>
                    {member.initials}
                  </div>
                  <span className="text-sm text-foreground w-32 shrink-0">{member.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 w-20 text-right">
                    {member.completed}/{total} done
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <UpgradeGate title={t("analytics.upgradeTitle")} description={t("analytics.upgradeDesc")} />
        )}
      </section>

      {/* Project Progress — visible to all */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t("analytics.progress")}</h2>
        <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] overflow-hidden">
          {PROJECT_PROGRESS.map((proj, i) => {
            const pct = Math.round((proj.done / proj.total) * 100)
            return (
              <div
                key={proj.name}
                className={cn("flex items-center gap-4 px-4 py-3.5", i < PROJECT_PROGRESS.length - 1 && "border-b border-border/50")}
              >
                <span className="text-sm text-foreground flex-1">{proj.name}</span>
                <div className="w-40 h-2 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", proj.color)} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-medium text-foreground tabular-nums w-12 text-right">{pct}%</span>
                <span className="text-xs text-muted-foreground w-20 text-right">{proj.done}/{proj.total} issues</span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
