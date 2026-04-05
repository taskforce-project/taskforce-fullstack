"use client"

import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import { BarChart3, TrendingUp, TrendingDown, Zap, FolderKanban, CircleDot, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useTranslation } from "@/lib/i18n"
import { useAuth } from "@/lib/contexts/auth-context"
import { cn } from "@/lib/utils"

const OVERVIEW_STATS = [
  { key: "issuesCreated",   value: 42, change: +12, icon: "circle" },
  { key: "issuesCompleted", value: 31, change: +8,  icon: "refresh" },
  { key: "cyclesCompleted", value: 5,  change: +1,  icon: "chart" },
  { key: "activeProjects",  value: 3,  change: 0,   icon: "folder" },
]

const VELOCITY_DATA = [
  { week: "W4",  completed: 4,  created: 6  },
  { week: "W5",  completed: 7,  created: 9  },
  { week: "W6",  completed: 5,  created: 7  },
  { week: "W7",  completed: 9,  created: 8  },
  { week: "W8",  completed: 6,  created: 10 },
  { week: "W9",  completed: 11, created: 12 },
  { week: "W10", completed: 8,  created: 7  },
  { week: "W11", completed: 13, created: 11 },
]

const BURNDOWN_DATA = [
  { day: "Day 1", remaining: 28, ideal: 28 },
  { day: "Day 3", remaining: 24, ideal: 21 },
  { day: "Day 5", remaining: 21, ideal: 14 },
  { day: "Day 7", remaining: 16, ideal: 7  },
  { day: "Day 9", remaining: 9,  ideal: 0  },
]

const TEAM_WORKLOAD = [
  { name: "You",       open: 7, completed: 12 },
  { name: "Sophie M.", open: 5, completed: 9  },
  { name: "Emma P.",   open: 4, completed: 7  },
  { name: "Thomas B.", open: 3, completed: 5  },
]

const PROJECT_PIE = [
  { name: "Website Redesign", value: 34, color: "#8b5cf6" },
  { name: "Mobile App",       value: 21, color: "#3b82f6" },
  { name: "API v2",           value: 9,  color: "#10b981" },
]

const PROJECT_PROGRESS = [
  { name: "Website Redesign", total: 28, done: 19, color: "bg-primary"     },
  { name: "Mobile App",       total: 14, done: 11, color: "bg-violet-500"  },
  { name: "API v2",           total: 22, done: 4,  color: "bg-emerald-500" },
]

const STAT_ICONS: Record<string, React.ReactNode> = {
  circle:  <CircleDot className="h-4 w-4" />,
  refresh: <RefreshCw className="h-4 w-4" />,
  chart:   <BarChart3 className="h-4 w-4" />,
  folder:  <FolderKanban className="h-4 w-4" />,
}

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
}

function StatCard({ label, value, change, icon }: Readonly<{ label: string; value: number; change: number; icon: string }>) {
  const isPositive = change > 0
  const isNeutral  = change === 0
  return (
    <div className="rounded-xl border border-border bg-card p-4 [box-shadow:var(--shadow-sm)] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="text-muted-foreground">{STAT_ICONS[icon]}</div>
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

function UpgradeGate({ title, description, children }: Readonly<{ title: string; description: string; children: React.ReactNode }>) {
  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="pointer-events-none select-none blur-sm saturate-0 opacity-50">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-8 text-center bg-background/75 backdrop-blur-sm rounded-xl">
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
    </div>
  )
}

export default function AnalyticsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const isPro = user?.plan === "pro" || user?.plan === "enterprise"

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("analytics.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("analytics.subtitle")}</p>
      </div>

      {/* Overview stats */}
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

      {/* Velocity */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("analytics.velocity")}</h2>
          {!isPro && <Badge variant="outline" className="text-xs border px-1.5 py-0 bg-amber-500/15 text-amber-400 border-amber-500/20">Pro</Badge>}
        </div>
        {isPro ? (
          <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)]">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={VELOCITY_DATA} barGap={4} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="created"   name="Created"   fill="hsl(var(--muted))"   radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Completed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <UpgradeGate title={t("analytics.upgradeTitle")} description={t("analytics.upgradeDesc")}>
            <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)]">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={VELOCITY_DATA} barGap={4} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="created"   name="Created"   fill="hsl(var(--muted))"   radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="Completed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </UpgradeGate>
        )}
      </section>

      {/* Burndown */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Sprint Burndown</h2>
          {!isPro && <Badge variant="outline" className="text-xs border px-1.5 py-0 bg-amber-500/15 text-amber-400 border-amber-500/20">Pro</Badge>}
        </div>
        {isPro ? (
          <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)]">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={BURNDOWN_DATA} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="ideal"     name="Ideal"     stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="remaining" name="Remaining" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(var(--primary))" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <UpgradeGate title="Sprint Burndown Chart" description="Visualize sprint velocity and track remaining work in real time.">
            <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)]">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={BURNDOWN_DATA} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="ideal"     name="Ideal"     stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="remaining" name="Remaining" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(var(--primary))" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </UpgradeGate>
        )}
      </section>

      {/* Workload */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("analytics.workload")}</h2>
          {!isPro && <Badge variant="outline" className="text-xs border px-1.5 py-0 bg-amber-500/15 text-amber-400 border-amber-500/20">Pro</Badge>}
        </div>
        {isPro ? (
          <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)]">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={TEAM_WORKLOAD} layout="vertical" barGap={4} margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number"   tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="open"      name="Open"      fill="hsl(var(--muted))" radius={[0, 4, 4, 0]} />
                <Bar dataKey="completed" name="Completed" fill="#10b981"            radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <UpgradeGate title={t("analytics.upgradeTitle")} description={t("analytics.upgradeDesc")}>
            <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)]">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={TEAM_WORKLOAD} layout="vertical" barGap={4} margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number"   tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={60} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="open"      name="Open"      fill="hsl(var(--muted))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="completed" name="Completed" fill="#10b981"            radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </UpgradeGate>
        )}
      </section>

      {/* Project distribution */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Project distribution</h2>
          {!isPro && <Badge variant="outline" className="text-xs border px-1.5 py-0 bg-amber-500/15 text-amber-400 border-amber-500/20">Pro</Badge>}
        </div>
        {isPro ? (
          <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)]">
            <div className="flex items-center gap-8">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie data={PROJECT_PIE} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {PROJECT_PIE.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-3">
                {PROJECT_PIE.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                    <span className="text-sm text-foreground">{entry.name}</span>
                    <span className="text-sm font-medium text-muted-foreground ml-auto">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <UpgradeGate title="Project distribution" description="Visualize how issues are distributed across your projects.">
            <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)]">
              <div className="flex items-center gap-8">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie data={PROJECT_PIE} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {PROJECT_PIE.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-3">
                  {PROJECT_PIE.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="text-sm text-foreground">{entry.name}</span>
                      <span className="text-sm font-medium text-muted-foreground ml-auto">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </UpgradeGate>
        )}
      </section>

      {/* Project progress */}
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