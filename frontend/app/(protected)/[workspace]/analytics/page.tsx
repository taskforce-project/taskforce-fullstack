"use client"

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import {
  TrendingUp, TrendingDown, Zap, AlertTriangle, Brain,
  Activity, Lock,
  Flame, Minus,
} from "lucide-react"
import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { motion } from "framer-motion"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useAuth } from "@/lib/contexts/auth-context"
import { cn } from "@/lib/utils"
import {
  getAnalyticsCapacity,
  type MemberCapacity,
} from "@/lib/api/analytics-service"

// ─── Primitives ───────────────────────────────────────────────────────────────

interface KpiMetric {
  label: string
  value: string
  delta: number
  unit: string
  icon: React.ElementType
  color: string
  deltaInverse?: boolean
}

function GlassCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn("rounded-xl border", className)}
      style={{ background: "var(--fill-secondary)", borderColor: "var(--separator)" }}
    >
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold" style={{ color: "var(--label-secondary)" }}>
      {children}
    </h3>
  )
}

// ─── Static data ──────────────────────────────────────────────────────────────

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "var(--background)",
  border: "1px solid var(--separator)",
  borderRadius: "8px",
  fontSize: "11px",
  color: "var(--label-primary)",
}

const KPI_METRICS: KpiMetric[] = [
  { label: "Tasks completed", value: "47",   delta: 12, unit: "this week",   icon: TrendingUp,   color: "#34d399" },
  { label: "Cycle time",      value: "2.4d", delta: -8, unit: "avg",         icon: Activity,     color: "#60a5fa", deltaInverse: true },
  { label: "Blocked tasks",   value: "3",    delta: 1,  unit: "active",      icon: AlertTriangle,color: "#f87171", deltaInverse: true },
  { label: "Sprint velocity", value: "73%",  delta: -5, unit: "on target",   icon: Flame,        color: "#fbbf24", deltaInverse: true },
]

const THROUGHPUT_DATA = [
  { week: "W1", opened: 18, resolved: 14 },
  { week: "W2", opened: 22, resolved: 19 },
  { week: "W3", opened: 15, resolved: 21 },
  { week: "W4", opened: 27, resolved: 23 },
]

const HEALTH_TIMELINE = [
  { day: "Mon", score: 82 },
  { day: "Tue", score: 79 },
  { day: "Wed", score: 74 },
  { day: "Thu", score: 78 },
  { day: "Fri", score: 81 },
  { day: "Sat", score: 83 },
  { day: "Sun", score: 78 },
]

const BURNDOWN_DATA = [
  { day: "D1", ideal: 34, remaining: 34 },
  { day: "D2", ideal: 28, remaining: 30 },
  { day: "D3", ideal: 22, remaining: 25 },
  { day: "D4", ideal: 17, remaining: 22 },
  { day: "D5", ideal: 11, remaining: 16 },
  { day: "D6", ideal: 6,  remaining: 12 },
  { day: "D7", ideal: 0,  remaining: 8  },
]

// ─── Static data (AI anomalies kept as mock - complex ML feature) ─────────────

const AI_ANOMALIES: {
  id: number
  severity: "critical" | "warning" | "info"
  title: string
  detail: string
  operation: string
  detectedAt: string
}[] = [
  {
    id: 1,
    severity: "critical",
    title: "Velocity collapse detected",
    detail: "Website Redesign dropped from 13 → 4 tasks/week. Sprint at risk.",
    operation: "Website Redesign",
    detectedAt: "2h ago",
  },
  {
    id: 2,
    severity: "warning",
    title: "Scope creep pattern",
    detail: "API v2 has 8 new tasks opened this week with no corresponding closures.",
    operation: "API v2",
    detectedAt: "6h ago",
  },
  {
    id: 3,
    severity: "warning",
    title: "Key contributor inactive",
    detail: "Thomas B. hasn't logged any activity in 3 days across assigned tasks.",
    operation: "Mobile App",
    detectedAt: "1d ago",
  },
  {
    id: 4,
    severity: "info",
    title: "Sprint overcommitment predicted",
    detail: "Current velocity suggests 68% chance of incomplete sprint by Friday.",
    operation: "Website Redesign",
    detectedAt: "3h ago",
  },
]

// ─── KpiCard component ────────────────────────────────────────────────────────

function KpiCard({ metric, index }: { metric: KpiMetric; index: number }) {
  const positive = metric.delta > 0
  const isGood = metric.deltaInverse ? !positive : positive
  const deltaColor = metric.delta === 0 ? "var(--label-quaternary)" : isGood ? "#34d399" : "#f87171"

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.06 }}
    >
      <GlassCard className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--label-tertiary)" }}>
            {metric.label}
          </span>
          <metric.icon className="size-3.5" style={{ color: metric.color }} />
        </div>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--label-primary)" }}>
              {metric.value}
            </span>
            <span className="text-[10px]" style={{ color: "var(--label-quaternary)" }}>
              {metric.unit}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            {metric.delta === 0 ? (
              <Minus className="size-3" style={{ color: "var(--label-quaternary)" }} />
            ) : positive ? (
              <TrendingUp className="size-3" style={{ color: deltaColor }} />
            ) : (
              <TrendingDown className="size-3" style={{ color: deltaColor }} />
            )}
            <span className="text-[10px] font-medium tabular-nums" style={{ color: deltaColor }}>
              {metric.delta > 0 ? "+" : ""}{metric.delta} vs last month
            </span>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  )
}

const SEVERITY_CONFIG = {
  critical: {
    bg: "rgba(248,113,113,0.08)",
    border: "rgba(248,113,113,0.20)",
    dot: "#f87171",
    icon: Flame,
    label: "Critical",
  },
  warning: {
    bg: "rgba(251,191,36,0.08)",
    border: "rgba(251,191,36,0.18)",
    dot: "#fbbf24",
    icon: AlertTriangle,
    label: "Warning",
  },
  info: {
    bg: "rgba(96,165,250,0.08)",
    border: "rgba(96,165,250,0.15)",
    dot: "#60a5fa",
    icon: Brain,
    label: "Info",
  },
}

function AnomalyRow({ anomaly, index }: { anomaly: typeof AI_ANOMALIES[0]; index: number }) {
  const cfg = SEVERITY_CONFIG[anomaly.severity]
  const Icon = cfg.icon

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, delay: index * 0.05 }}
      className="flex items-start gap-3 p-3 rounded-lg"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <div className="mt-0.5 shrink-0">
        <Icon className="size-3.5" style={{ color: cfg.dot }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold" style={{ color: "var(--label-primary)" }}>
            {anomaly.title}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{
              background: "var(--fill-secondary)",
              color: "var(--label-tertiary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {anomaly.operation}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--label-secondary)" }}>
          {anomaly.detail}
        </p>
      </div>
      <span className="text-[10px] shrink-0 mt-0.5" style={{ color: "var(--label-quaternary)" }}>
        {anomaly.detectedAt}
      </span>
    </motion.div>
  )
}

function UpgradeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "rgba(251,191,36,0.12)" }}>
              <Zap className="h-4 w-4" style={{ color: "#fbbf24" }} />
            </div>
            <DialogTitle>Pro feature</DialogTitle>
          </div>
          <DialogDescription>
            Advanced operational intelligence is a Pro feature — unlock detailed throughput analysis, AI anomaly detection history, and team capacity forecasting.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-2">
          <Button className="w-full gap-1.5" size="sm" onClick={onClose}>
            <Zap className="h-3.5 w-3.5" />
            Upgrade to Pro
          </Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={onClose}>
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProGate({ children, onUpgrade }: { children: React.ReactNode; onUpgrade: () => void }) {
  return (
    <div className="relative group">
      {children}
      <button
        type="button"
        className="absolute inset-0 w-full cursor-pointer bg-transparent"
        onClick={onUpgrade}
        aria-label="Upgrade to Pro"
      />
      <div
        className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{
          background: "rgba(251,191,36,0.12)",
          border: "1px solid rgba(251,191,36,0.22)",
        }}
      >
        <Lock className="h-3 w-3" style={{ color: "#fbbf24" }} />
        <span className="text-xs font-semibold" style={{ color: "#fbbf24" }}>Pro</span>
      </div>
    </div>
  )
}

function ProBadge() {
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
      style={{
        background: "rgba(251,191,36,0.12)",
        border: "1px solid rgba(251,191,36,0.20)",
        color: "#fbbf24",
      }}
    >
      Pro
    </span>
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
    getAnalyticsCapacity(slug)
      .then(setCapacityData)
      .catch(() => { /* silently ignore — not critical */ })
  }, [slug])

  const overallHealth = 78
  const healthDelta = -4

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--label-primary)" }}>
            Operational Intelligence
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--label-tertiary)" }}>
            AI-derived signals and performance patterns across all operations
          </p>
        </div>

        {/* System health badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl shrink-0"
          style={{
            background: healthDelta < 0 ? "rgba(251,191,36,0.10)" : "rgba(52,211,153,0.10)",
            border: `1px solid ${healthDelta < 0 ? "rgba(251,191,36,0.20)" : "rgba(52,211,153,0.20)"}`,
          }}
        >
          <Activity className="size-3.5" style={{ color: healthDelta < 0 ? "#fbbf24" : "#34d399" }} />
          <span className="text-xs font-semibold tabular-nums" style={{ color: healthDelta < 0 ? "#fbbf24" : "#34d399" }}>
            Health {overallHealth}
          </span>
          <span className="text-[10px]" style={{ color: "var(--label-quaternary)" }}>
            {healthDelta}% vs last week
          </span>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPI_METRICS.map((m, i) => (
          <KpiCard key={m.label} metric={m} index={i} />
        ))}
      </div>

      {/* ── Two column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Left: charts (3/5) */}
        <div className="lg:col-span-3 flex flex-col gap-4">

          {/* Throughput chart */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Weekly Throughput</SectionLabel>
              {!isPro && <ProBadge />}
            </div>
            {isPro ? (
              <GlassCard className="p-4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={THROUGHPUT_DATA} barGap={3} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--label-quaternary)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--label-quaternary)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--fill-tertiary)" }} />
                    <Legend wrapperStyle={{ fontSize: 10, color: "var(--label-tertiary)" }} />
                    <Bar dataKey="opened"   name="Opened"   fill="rgba(96,165,250,0.50)"  radius={[3, 3, 0, 0]} />
                    <Bar dataKey="resolved" name="Resolved" fill="rgba(167,139,250,0.80)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </GlassCard>
            ) : (
              <ProGate onUpgrade={() => setUpgradeOpen(true)}>
                <GlassCard className="p-4">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={THROUGHPUT_DATA} barGap={3} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--label-quaternary)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--label-quaternary)" }} axisLine={false} tickLine={false} />
                      <Legend wrapperStyle={{ fontSize: 10, color: "var(--label-tertiary)" }} />
                      <Bar dataKey="opened"   name="Opened"   fill="rgba(96,165,250,0.30)"  radius={[3, 3, 0, 0]} />
                      <Bar dataKey="resolved" name="Resolved" fill="rgba(167,139,250,0.50)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </GlassCard>
              </ProGate>
            )}
          </div>

          {/* System health timeline */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>System Health Timeline (7d)</SectionLabel>
              {!isPro && <ProBadge />}
            </div>
            {isPro ? (
              <GlassCard className="p-4">
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={HEALTH_TIMELINE} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--label-quaternary)" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[60, 100]} tick={{ fontSize: 10, fill: "var(--label-quaternary)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="score" name="Health" stroke="#a78bfa" strokeWidth={2} fill="url(#healthGrad)" dot={{ r: 3, fill: "#a78bfa" }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </GlassCard>
            ) : (
              <ProGate onUpgrade={() => setUpgradeOpen(true)}>
                <GlassCard className="p-4">
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={HEALTH_TIMELINE} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--label-quaternary)" }} axisLine={false} tickLine={false} />
                      <YAxis domain={[60, 100]} tick={{ fontSize: 10, fill: "var(--label-quaternary)" }} axisLine={false} tickLine={false} />
                      <Area type="monotone" dataKey="score" name="Health" stroke="rgba(167,139,250,0.3)" strokeWidth={2} fill="rgba(167,139,250,0.05)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </GlassCard>
              </ProGate>
            )}
          </div>

          {/* Sprint burndown */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Sprint Burndown</SectionLabel>
              {!isPro && <ProBadge />}
            </div>
            {isPro ? (
              <GlassCard className="p-4">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={BURNDOWN_DATA} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--label-quaternary)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--label-quaternary)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 10, color: "var(--label-tertiary)" }} />
                    <Line type="monotone" dataKey="ideal"     name="Ideal"     stroke="var(--label-quaternary)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="remaining" name="Remaining" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3, fill: "#a78bfa" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </GlassCard>
            ) : (
              <ProGate onUpgrade={() => setUpgradeOpen(true)}>
                <GlassCard className="p-4">
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={BURNDOWN_DATA} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--label-quaternary)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--label-quaternary)" }} axisLine={false} tickLine={false} />
                      <Legend wrapperStyle={{ fontSize: 10, color: "var(--label-tertiary)" }} />
                      <Line type="monotone" dataKey="ideal"     stroke="rgba(148,163,184,0.3)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="remaining" stroke="rgba(167,139,250,0.3)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </GlassCard>
              </ProGate>
            )}
          </div>
        </div>

        {/* Right: signals + capacity (2/5) */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* AI anomaly detection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>AI Anomaly Detection</SectionLabel>
              <span
                className="text-[10px] font-medium flex items-center gap-1"
                style={{ color: "var(--label-secondary)" }}
              >
                <Brain className="size-3" />
                {AI_ANOMALIES.length} signals
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {AI_ANOMALIES.map((a, i) => (
                <AnomalyRow key={a.id} anomaly={a} index={i} />
              ))}
            </div>
          </div>

          {/* Team capacity */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Team Capacity</SectionLabel>
              {!isPro && <ProBadge />}
            </div>
            <GlassCard className="overflow-hidden">
              {capacityData.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs" style={{ color: "var(--label-quaternary)" }}>
                  Aucun membre trouvé
                </div>
              ) : capacityData.map((member, i) => {
                const utilization = Math.min(Math.round((member.openIssues / 10) * 100), 100)
                const overloaded = utilization > 80
                const barColor = overloaded ? "#f87171" : utilization > 60 ? "#fbbf24" : "#34d399"
                return (
                  <div
                    key={member.userId}
                    className={cn("flex items-center gap-3 px-3 py-2.5")}
                    style={{
                      borderBottom: i < capacityData.length - 1 ? "1px solid var(--separator)" : "none",
                    }}
                  >
                    <span className="text-xs w-20 shrink-0 truncate" style={{ color: "var(--label-secondary)" }}>
                      {member.displayName}
                    </span>
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--fill-secondary)" }}>
                      {isPro ? (
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${utilization}%`, background: barColor }}
                        />
                      ) : (
                        <div className="h-full w-full" style={{ background: "var(--fill-secondary)" }} />
                      )}
                    </div>
                    <span
                      className="text-[10px] font-medium tabular-nums w-8 text-right shrink-0"
                      style={{ color: isPro ? barColor : "var(--label-quaternary)" }}
                    >
                      {isPro ? `${member.openIssues}` : "—"}
                    </span>
                  </div>
                )
              })}
            </GlassCard>
            {!isPro && (
              <button
                onClick={() => setUpgradeOpen(true)}
                className="mt-2 w-full text-center text-[10px] flex items-center justify-center gap-1 py-1.5 rounded-lg transition-colors"
                style={{ color: "#fbbf24", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}
              >
                <Zap className="size-3" />
                Unlock capacity data with Pro
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
