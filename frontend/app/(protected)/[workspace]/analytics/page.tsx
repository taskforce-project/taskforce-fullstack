"use client"

import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import {
  TrendingUp, TrendingDown, Zap, AlertTriangle, Brain,
  Activity, Lock, Flame, Minus,
} from "lucide-react"
import { useState, useEffect } from "react"
import { useParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { PageContainer } from "@/components/layout/page-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { SectionCard } from "@/components/ui/section-card"
import { useUpgradeStore } from "@/lib/store/upgrade-store"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/contexts/auth-context"
import { cn } from "@/lib/utils"
import {
  getAnalyticsCapacity,
  getAnalyticsKpis,
  getAnalyticsThroughput,
  getAnalyticsBurndown,
  getAiInsights,
  type MemberCapacity,
  type AnalyticsKpis,
  type ThroughputPoint,
  type BurndownPoint,
  type AiInsight,
} from "@/lib/api/analytics-service"
import { listProjects, type Project } from "@/lib/api/project-service"

const ALL_PROJECTS = "all"

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

const URGENCY_SEVERITY: Record<AiInsight["urgency"], "critical" | "warning" | "info"> = {
  high: "critical", medium: "warning", low: "info",
}

function InsightRow({ insight }: { readonly insight: AiInsight }) {
  const meta = SEVERITY_META[URGENCY_SEVERITY[insight.urgency] ?? "info"]
  const Icon = meta.icon
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-3", meta.wrap)}>
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", meta.iconColor)} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{insight.action}</span>
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal" style={{ color: insight.agentColor }}>
            {insight.agent}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{insight.insight}</p>
      </div>
      <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground">{insight.confidence}%</span>
    </div>
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
  const openUpgrade = useUpgradeStore((s) => s.openUpgrade)
  const [capacityData, setCapacityData] = useState<MemberCapacity[]>([])
  const [kpis, setKpis] = useState<AnalyticsKpis | null>(null)
  const [throughput, setThroughput] = useState<ThroughputPoint[]>([])
  const [burndown, setBurndown] = useState<BurndownPoint[]>([])
  const [insights, setInsights] = useState<AiInsight[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [projectFilter, setProjectFilter] = useState<string>(ALL_PROJECTS)

  const isPro = user?.planType === "PRO" || user?.planType === "ENTERPRISE"

  // Liste des projets pour le filtre + insights IA (workspace-wide)
  useEffect(() => {
    if (!slug) return
    listProjects(slug).then(setProjects).catch(() => { /* non-critical */ })
    getAiInsights(slug).then(setInsights).catch(() => { /* non-critical */ })
  }, [slug])

  // Données analytics (re-fetch au changement de filtre projet — PROD-1.7)
  useEffect(() => {
    if (!slug) return
    const projectId = projectFilter === ALL_PROJECTS ? undefined : Number(projectFilter)
    getAnalyticsKpis(slug, projectId).then(setKpis).catch(() => { /* non-critical */ })
    // Analytics avancées gatées PRO (PROD-4.4) : on ne les fetch pas pour les plans FREE
    // (l'UI affiche déjà le ProGate ; évite des 409 inutiles côté back).
    if (isPro) {
      getAnalyticsThroughput(slug, projectId).then(setThroughput).catch(() => { /* non-critical */ })
      getAnalyticsBurndown(slug, projectId).then(setBurndown).catch(() => { /* non-critical */ })
      getAnalyticsCapacity(slug, projectId).then(setCapacityData).catch(() => { /* non-critical */ })
    }
  }, [slug, projectFilter, isPro])

  // KPIs réels → cartes (zéros tant que non chargés ; aucun mock — PROD-1.7)
  const k = kpis ?? { tasksResolved: 0, tasksResolvedDelta: 0, avgResolutionDays: 0, avgResolutionDaysDelta: 0, velocity: 0, velocityDelta: 0, activeCycles: 0 }
  const kpiMetrics: KpiMetric[] = [
    { label: "Tasks completed", value: String(k.tasksResolved),   delta: k.tasksResolvedDelta,                 unit: "this month", icon: TrendingUp },
    { label: "Cycle time",      value: `${k.avgResolutionDays}d`, delta: Math.round(k.avgResolutionDaysDelta), unit: "avg",        icon: Activity, deltaInverse: true },
    { label: "Sprint velocity", value: String(k.velocity),        delta: k.velocityDelta,                      unit: "last 7d",    icon: Flame },
    { label: "Active cycles",   value: String(k.activeCycles),    delta: 0,                                    unit: "running",    icon: Zap },
  ]

  const proBadge = !isPro ? <Badge variant="secondary" className="text-amber-600 dark:text-amber-400">Pro</Badge> : undefined

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Operational Intelligence</h1>
          <p className="text-sm text-muted-foreground">AI-derived signals and performance patterns across all operations</p>
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="h-8 w-44 text-xs shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PROJECTS}>Tous les projets</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpiMetrics.map((m) => <KpiCard key={m.label} metric={m} />)}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Charts */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          <SectionCard title="Weekly throughput" action={proBadge}>
            <MaybeGate gated={!isPro} onUpgrade={openUpgrade}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={throughput} barGap={3} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
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

          <SectionCard title="Sprint burndown" action={proBadge}>
            <MaybeGate gated={!isPro} onUpgrade={openUpgrade}>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={burndown} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
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
            title="AI insights"
            action={<span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground"><Brain className="size-3" /> {insights.length} signals</span>}
            bodyClassName="p-4 space-y-2"
          >
            {insights.length === 0 ? (
              <p className="px-1 py-3 text-center text-xs text-muted-foreground">Aucun insight pour le moment.</p>
            ) : insights.map((ins, i) => <InsightRow key={`${ins.agent}-${i}`} insight={ins} />)}
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
              <Button variant="outline" size="sm" className="mt-2 w-full gap-1.5 text-amber-600 dark:text-amber-400" onClick={openUpgrade}>
                <Zap className="size-3" /> Unlock capacity data with Pro
              </Button>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

// Affiche le contenu, gaté derrière un ProGate si `gated`
function MaybeGate({ gated, onUpgrade, children }: { readonly gated: boolean; readonly onUpgrade: () => void; readonly children: React.ReactNode }) {
  if (!gated) return <>{children}</>
  return <ProGate onUpgrade={onUpgrade}>{children}</ProGate>
}
