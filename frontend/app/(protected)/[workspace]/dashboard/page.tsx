"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowUpRight, Clock,
  Zap, Loader2, Layers, Activity,
} from "lucide-react"
import {
  ResponsiveContainer, AreaChart, Area, Tooltip,
} from "recharts"
import { useAuth } from "@/lib/contexts/auth-context"
import { useProjectStore } from "@/lib/store/project-store"
import {
  getAiInsights, getAnalyticsThroughput,
  type AiInsight, type ThroughputPoint,
} from "@/lib/api/analytics-service"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SectionCard, MetricSplit, Metric, SegmentBar } from "@/components/ui/section-card"
import { PageContainer } from "@/components/layout/page-shell"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

// ─── Primitives ───────────────────────────────────────────────────────────────

/** Corps de panneau « bientôt disponible » — pour les sections non encore câblées (pas de mock). */
function ComingSoonBody({ label }: { readonly label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
      <Clock className="size-5 text-muted-foreground/50" />
      <p className="text-sm font-medium text-muted-foreground">Bientôt disponible</p>
      {label && <p className="text-xs text-muted-foreground/70">{label}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""

  const { user } = useAuth()
  const { fetchProjects, projects } = useProjectStore()

  const [aiInsights, setAiInsights] = useState<AiInsight[]>([])
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [throughput, setThroughput] = useState<ThroughputPoint[]>([])

  useEffect(() => {
    if (slug) void fetchProjects(slug)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  useEffect(() => {
    if (!slug) return
    setInsightsLoading(true)
    getAiInsights(slug)
      .then(setAiInsights)
      .catch(() => setAiInsights([]))
      .finally(() => setInsightsLoading(false))
    // Throughput hebdo (réel) — gated Pro : en cas de 409/erreur, on masque simplement le graphe.
    getAnalyticsThroughput(slug)
      .then(setThroughput)
      .catch(() => setThroughput([]))
  }, [slug])

  const activeOps = projects.filter((p) => p.status === "ACTIVE").length
  const openIssues = projects.reduce((s, p) => s + p.openIssues, 0)

  // Agrégats réels pour les insight cards (QA2-13) — aucune donnée fabriquée.
  const totalOps = projects.length
  const totalIssues = projects.reduce((s, p) => s + p.totalIssues, 0)
  const doneIssues = totalIssues - openIssues
  const completion = totalIssues > 0 ? Math.round((doneIssues / totalIssues) * 100) : 0

  const healthOf = (p: (typeof projects)[number]): "healthy" | "atRisk" | "critical" | "paused" => {
    if (p.status === "PAUSED" || p.status === "ARCHIVED") return "paused"
    if (p.totalIssues === 0) return "healthy"
    const ratio = p.openIssues / p.totalIssues
    if (ratio > 0.85) return "critical"
    if (ratio > 0.55) return "atRisk"
    return "healthy"
  }
  const health = { healthy: 0, atRisk: 0, critical: 0, paused: 0 }
  for (const p of projects) health[healthOf(p)]++
  const atRisk = health.atRisk + health.critical

  const OPERATIONS = projects.map((p) => ({
    id: String(p.id),
    name: p.name,
    progress: p.totalIssues > 0 ? Math.round(((p.totalIssues - p.openIssues) / p.totalIssues) * 100) : 0,
    done: p.totalIssues - p.openIssues,
    total: p.totalIssues,
  }))

  const firstName = user?.firstName ?? "—"
  const hour = new Date().getHours()
  let greeting = "Good evening,"
  if (hour < 5) greeting = "Still up,"
  else if (hour < 12) greeting = "Good morning,"
  else if (hour < 18) greeting = "Good afternoon,"
  const decisions = aiInsights.filter((i) => i.urgency === "high").length

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{greeting}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{firstName}</h1>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          {decisions > 0 && (
            <Badge variant="secondary" className="gap-1"><Zap className="size-3" /> {decisions} decision{decisions > 1 ? "s" : ""} pending</Badge>
          )}
        </div>
      </div>

      {/* KPI groupés en cartes à en-tête (style Cloudflare) — agrégats réels, plus d'insight dans le corps */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Operations" icon={<Layers className="size-4" />} href="./projects" bodyClassName="p-0">
          <MetricSplit>
            <Metric label="Active ops" value={`${activeOps}/${totalOps}`} />
            <Metric label="Open issues" value={openIssues} />
            <Metric
              label="At risk"
              value={atRisk}
              valueClassName={atRisk > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
            />
          </MetricSplit>
          <div className="space-y-1.5 border-t border-border px-5 py-3">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Santé des opérations</span>
              <span className="tabular-nums">{health.healthy} sain · {atRisk} à risque · {health.paused} en pause</span>
            </div>
            <SegmentBar
              segments={[
                { value: health.healthy, className: "bg-emerald-500" },
                { value: health.atRisk, className: "bg-amber-500" },
                { value: health.critical, className: "bg-rose-500" },
                { value: health.paused, className: "bg-muted-foreground/40" },
              ]}
            />
          </div>
        </SectionCard>

        <SectionCard title="Throughput" icon={<Activity className="size-4" />} href="./analytics" bodyClassName="p-0">
          <MetricSplit>
            <Metric label="Resolved" value={doneIssues} />
            <Metric label="Total issues" value={totalIssues} />
            <Metric
              label="Completion"
              value={`${completion}%`}
              valueClassName={completion >= 70 ? "text-emerald-600 dark:text-emerald-400" : undefined}
            />
          </MetricSplit>
          <div className="border-t border-border px-5 py-3">
            <p className="mb-1 text-[11px] text-muted-foreground">Tâches résolues / semaine</p>
            {throughput.length > 0 ? (
              <ResponsiveContainer width="100%" height={64}>
                <AreaChart data={throughput} margin={{ top: 4, right: 0, left: 0, bottom: 10 }}>
                  <defs>
                    <linearGradient id="thr-fade" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      fontSize: 11,
                      padding: "2px 8px",
                    }}
                    labelStyle={{ display: "none" }}
                    cursor={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="resolved"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#thr-fade)"
                    fillOpacity={1}
                    dot={false}
                    activeDot={{ r: 3, fill: "#3b82f6" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground/60">Pas encore assez de données</p>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Main grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left 2/3 */}
        <div className="space-y-5 lg:col-span-2">
          {/* Needs attention — bientôt disponible (alertes/exceptions à câbler) */}
          <SectionCard title="Needs attention" bodyClassName="p-0">
            <ComingSoonBody label="Alertes & exceptions" />
          </SectionCard>

          {/* Active operations */}
          <SectionCard title="Active operations" href="./projects" bodyClassName="p-0">
              {OPERATIONS.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No active operations yet.</p>
              ) : OPERATIONS.map((op) => (
                <Link
                  key={op.id}
                  href={`./projects/${op.id}`}
                  className="flex items-center gap-4 border-b border-border px-4 py-3.5 transition-colors last:border-0 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-foreground">{op.name}</p>
                      <Badge variant="secondary" className="gap-1.5 font-normal text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-emerald-500" /> On track
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={op.progress} className="h-1.5 flex-1" />
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{op.done}/{op.total}</span>
                    </div>
                  </div>
                </Link>
              ))}
          </SectionCard>

          {/* AI recommendations */}
          <SectionCard title="AI recommendations" href="./agents" bodyClassName="p-4 space-y-2">
              {insightsLoading && (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Generating AI insights…
                </div>
              )}
              {!insightsLoading && aiInsights.length === 0 && (
                <div className="py-2 text-sm text-muted-foreground">
                  No insights available — AI analysis will run once your workspace has data.
                </div>
              )}
              {aiInsights.map((ins, idx) => (
                <div key={idx} className={cn("space-y-3 rounded-lg border border-border p-3", ins.urgency === "high" && "border-primary/30 bg-muted/30")}>
                  <div className="flex items-center gap-2.5">
                    <Badge variant="outline" className="font-mono text-[10px]">{ins.agent}</Badge>
                    <span className="text-xs text-muted-foreground">{ins.category}</span>
                    {ins.urgency === "high" && (
                      <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-foreground">
                        <Zap className="size-2.5" /> AI priority
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90">{ins.insight}</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 space-y-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Confidence</p>
                      <div className="flex items-center gap-2">
                        <Progress value={ins.confidence} className="h-1.5 flex-1" />
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">{ins.confidence}%</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
                      <Link href="./agents">{ins.action} <ArrowUpRight className="size-3" /></Link>
                    </Button>
                  </div>
                </div>
              ))}
          </SectionCard>
        </div>

        {/* Right 1/3 */}
        <div className="space-y-5">
          {/* Agent activity — bientôt disponible (feature Agents IA coming-soon) */}
          <SectionCard title="Agent activity" bodyClassName="p-0">
            <ComingSoonBody label="Activité des agents IA" />
          </SectionCard>

          {/* Pending decisions — bientôt disponible */}
          <SectionCard title="Pending decisions" bodyClassName="p-0">
            <ComingSoonBody label="Décisions à valider" />
          </SectionCard>
        </div>
      </div>
    </PageContainer>
  )
}
