"use client"

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import {
  TrendingUp, TrendingDown, Zap, AlertTriangle, Brain,
  Activity, Lock, Flame, Minus,
} from "lucide-react"
import { useState, useEffect } from "react"
import { useParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { SectionCard } from "@/components/ui/section-card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useAuth } from "@/lib/contexts/auth-context"
import { cn } from "@/lib/utils"
import { getAnalyticsCapacity, type MemberCapacity } from "@/lib/api/analytics-service"

// ─── Types & data ─────────────────────────────────────────────────────────────

interface KpiMetric {
  label: string
  value: string
  delta: number
  unit: string
  icon: React.ElementType
  deltaInverse?: boolean
}

// Couleurs de séries via tokens de thème (neutres + 1 accent)
const C1 = "var(--chart-1)"
const C2 = "var(--chart-2)"
const TOOLTIP_STYLE: React.CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "11px",
  color: "var(--popover-foreground)",
}

const KPI_METRICS: KpiMetric[] = [
  { label: "Tasks completed", value: "47",   delta: 12, unit: "this week", icon: TrendingUp },
  { label: "Cycle time",      value: "2.4d", delta: -8, unit: "avg",       icon: Activity,     deltaInverse: true },
  { label: "Blocked tasks",   value: "3",    delta: 1,  unit: "active",    icon: AlertTriangle, deltaInverse: true },
  { label: "Sprint velocity", value: "73%",  delta: -5, unit: "on target", icon: Flame,        deltaInverse: true },
]

const THROUGHPUT_DATA = [
  { week: "W1", opened: 18, resolved: 14 },
  { week: "W2", opened: 22, resolved: 19 },
  { week: "W3", opened: 15, resolved: 21 },
  { week: "W4", opened: 27, resolved: 23 },
]

const HEALTH_TIMELINE = [
  { day: "Mon", score: 82 }, { day: "Tue", score: 79 }, { day: "Wed", score: 74 },
  { day: "Thu", score: 78 }, { day: "Fri", score: 81 }, { day: "Sat", score: 83 }, { day: "Sun", score: 78 },
]

const BURNDOWN_DATA = [
  { day: "D1", ideal: 34, remaining: 34 }, { day: "D2", ideal: 28, remaining: 30 },
  { day: "D3", ideal: 22, remaining: 25 }, { day: "D4", ideal: 17, remaining: 22 },
  { day: "D5", ideal: 11, remaining: 16 }, { day: "D6", ideal: 6, remaining: 12 }, { day: "D7", ideal: 0, remaining: 8 },
]

const AI_ANOMALIES: {
  id: number; severity: "critical" | "warning" | "info"; title: string; detail: string; operation: string; detectedAt: string
}[] = [
  { id: 1, severity: "critical", title: "Velocity collapse detected", detail: "Website Redesign dropped from 13 → 4 tasks/week. Sprint at risk.", operation: "Website Redesign", detectedAt: "2h ago" },
  { id: 2, severity: "warning",  title: "Scope creep pattern",        detail: "API v2 has 8 new tasks opened this week with no corresponding closures.", operation: "API v2", detectedAt: "6h ago" },
  { id: 3, severity: "warning",  title: "Key contributor inactive",   detail: "Thomas B. hasn't logged any activity in 3 days across assigned tasks.", operation: "Mobile App", detectedAt: "1d ago" },
  { id: 4, severity: "info",     title: "Sprint overcommitment predicted", detail: "Current velocity suggests 68% chance of incomplete sprint by Friday.", operation: "Website Redesign", detectedAt: "3h ago" },
]

const SEVERITY_META: Record<"critical" | "warning" | "info", { wrap: string; icon: React.ElementType; iconColor: string }> = {
  critical: { wrap: "border-rose-500/30 bg-rose-500/10",  icon: Flame,         iconColor: "text-rose-500" },
  warning:  { wrap: "border-amber-500/30 bg-amber-500/10", icon: AlertTriangle, iconColor: "text-amber-500" },
  info:     { wrap: "border-blue-500/30 bg-blue-500/10",   icon: Brain,         iconColor: "text-blue-500" },
}

// ─── Small components ─────────────────────────────────────────────────────────

function KpiCard({ metric }: { readonly metric: KpiMetric }) {
  const positive = metric.delta > 0
  const isGood = metric.deltaInverse ? !positive : positive
  const deltaClass = metric.delta === 0 ? "text-muted-foreground" : isGood ? "text-emerald-500" : "text-rose-500"
  const DeltaIcon = metric.delta === 0 ? Minus : positive ? TrendingUp : TrendingDown
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{metric.label}</span>
          <metric.icon className="size-3.5 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums text-foreground">{metric.value}</span>
            <span className="text-[10px] text-muted-foreground">{metric.unit}</span>
          </div>
          <div className={cn("mt-1 flex items-center gap-1 text-[10px] font-medium tabular-nums", deltaClass)}>
            <DeltaIcon className="size-3" />
            {metric.delta > 0 ? "+" : ""}{metric.delta} vs last month
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AnomalyRow({ anomaly }: { readonly anomaly: typeof AI_ANOMALIES[0] }) {
  const meta = SEVERITY_META[anomaly.severity]
  const Icon = meta.icon
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-3", meta.wrap)}>
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", meta.iconColor)} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{anomaly.title}</span>
          <Badge variant="secondary" className="h-4 px-1.5 font-mono text-[10px] font-normal">{anomaly.operation}</Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{anomaly.detail}</p>
      </div>
      <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground">{anomaly.detectedAt}</span>
    </div>
  )
}

function UpgradeDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-amber-500/15">
              <Zap className="size-4 text-amber-500" />
            </div>
            <DialogTitle>Pro feature</DialogTitle>
          </div>
          <DialogDescription>
            Advanced operational intelligence is a Pro feature — unlock detailed throughput analysis, AI anomaly detection history, and team capacity forecasting.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-2">
          <Button className="w-full gap-1.5" size="sm" onClick={onClose}><Zap className="size-3.5" /> Upgrade to Pro</Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={onClose}>Maybe later</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProGate({ children, onUpgrade }: { readonly children: React.ReactNode; readonly onUpgrade: () => void }) {
  return (
    <div className="group relative">
      <div className="opacity-60">{children}</div>
      <button type="button" className="absolute inset-0 w-full cursor-pointer bg-transparent" onClick={onUpgrade} aria-label="Upgrade to Pro" />
      <Badge variant="secondary" className="pointer-events-none absolute right-3 top-3 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Lock className="size-3" /> Pro
      </Badge>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user } = useAuth()
  const params = useParams()
  const slug = params.workspace as string
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [capacityData, setCapacityData] = useState<MemberCapacity[]>([])

  const isPro = user?.planType === "PRO" || user?.planType === "ENTERPRISE"

  useEffect(() => {
    if (!slug) return
    getAnalyticsCapacity(slug).then(setCapacityData).catch(() => { /* non-critical */ })
  }, [slug])

  const overallHealth = 78
  const healthDelta = -4
  const healthBad = healthDelta < 0
  const proBadge = !isPro ? <Badge variant="secondary" className="text-amber-600 dark:text-amber-400">Pro</Badge> : undefined

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Operational Intelligence</h1>
          <p className="text-sm text-muted-foreground">AI-derived signals and performance patterns across all operations</p>
        </div>
        <Badge variant="secondary" className={cn("gap-1.5 shrink-0", healthBad ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
          <Activity className="size-3.5" /> Health {overallHealth}
          <span className="text-muted-foreground">· {healthDelta}% vs last week</span>
        </Badge>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {KPI_METRICS.map((m) => <KpiCard key={m.label} metric={m} />)}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Charts */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          <SectionCard title="Weekly throughput" action={proBadge}>
            <MaybeGate gated={!isPro} onUpgrade={() => setUpgradeOpen(true)}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={THROUGHPUT_DATA} barGap={3} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="opened" name="Opened" fill={C2} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="resolved" name="Resolved" fill={C1} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </MaybeGate>
          </SectionCard>

          <SectionCard title="System health timeline (7d)" action={proBadge}>
            <MaybeGate gated={!isPro} onUpgrade={() => setUpgradeOpen(true)}>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={HEALTH_TIMELINE} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C1} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={C1} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[60, 100]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="score" name="Health" stroke={C1} strokeWidth={2} fill="url(#healthGrad)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </MaybeGate>
          </SectionCard>

          <SectionCard title="Sprint burndown" action={proBadge}>
            <MaybeGate gated={!isPro} onUpgrade={() => setUpgradeOpen(true)}>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={BURNDOWN_DATA} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="ideal" name="Ideal" stroke={C2} strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="remaining" name="Remaining" stroke={C1} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </MaybeGate>
          </SectionCard>
        </div>

        {/* Signals + capacity */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <SectionCard
            title="AI anomaly detection"
            action={<span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground"><Brain className="size-3" /> {AI_ANOMALIES.length} signals</span>}
            bodyClassName="p-4 space-y-2"
          >
            {AI_ANOMALIES.map((a) => <AnomalyRow key={a.id} anomaly={a} />)}
          </SectionCard>

          <div>
            <SectionCard title="Team capacity" action={proBadge} bodyClassName="p-0">
              {capacityData.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">Aucun membre trouvé</p>
              ) : capacityData.map((member) => {
                const utilization = Math.min(Math.round((member.openIssues / 10) * 100), 100)
                const barClass = utilization > 80 ? "bg-rose-500" : utilization > 60 ? "bg-amber-500" : "bg-emerald-500"
                return (
                  <div key={member.userId} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0">
                    <span className="w-20 shrink-0 truncate text-xs text-muted-foreground">{member.displayName}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      {isPro && <div className={cn("h-full rounded-full", barClass)} style={{ width: `${utilization}%` }} />}
                    </div>
                    <span className={cn("w-8 shrink-0 text-right text-[10px] font-medium tabular-nums", isPro ? "text-foreground" : "text-muted-foreground")}>
                      {isPro ? member.openIssues : "—"}
                    </span>
                  </div>
                )
              })}
            </SectionCard>
            {!isPro && (
              <Button variant="outline" size="sm" className="mt-2 w-full gap-1.5 text-amber-600 dark:text-amber-400" onClick={() => setUpgradeOpen(true)}>
                <Zap className="size-3" /> Unlock capacity data with Pro
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Affiche le contenu, gaté derrière un ProGate si `gated`
function MaybeGate({ gated, onUpgrade, children }: { readonly gated: boolean; readonly onUpgrade: () => void; readonly children: React.ReactNode }) {
  if (!gated) return <>{children}</>
  return <ProGate onUpgrade={onUpgrade}>{children}</ProGate>
}
