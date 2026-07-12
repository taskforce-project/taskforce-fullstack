"use client"

import {
  TrendingUp, TrendingDown, Zap, AlertTriangle, Brain,
  Activity, Flame, Minus,
} from "lucide-react"
import { useState, useEffect } from "react"
import { useParams } from "next/navigation"

import { PageContainer, PageHeader } from "@/components/layout/page-shell"
import { Badge } from "@/components/ui/badge"
import { SectionCard, MetricSplit } from "@/components/ui/section-card"
import { useUpgradeStore } from "@/lib/store/upgrade-store"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/contexts/auth-context"
import { cn } from "@/lib/utils"
import {
  getAnalyticsKpis,
  getAiInsights,
  type AnalyticsKpis,
  type AiInsight,
} from "@/lib/api/analytics-service"
import { listProjects, type Project } from "@/lib/api/project-service"
import { DecisionBoard } from "@/components/analytics/decision-board"
import { ChartExplorer } from "@/components/analytics/chart-explorer"

const ALL_PROJECTS = "all"

const SEVERITY_META: Record<"critical" | "warning" | "info", { wrap: string; icon: React.ElementType; iconColor: string }> = {
  critical: { wrap: "border-rose-500/30 bg-rose-500/[0.07]",  icon: Flame,         iconColor: "text-rose-500" },
  warning:  { wrap: "border-amber-500/30 bg-amber-500/[0.07]", icon: AlertTriangle, iconColor: "text-amber-500" },
  info:     { wrap: "border-blue-500/30 bg-blue-500/[0.07]",   icon: Brain,         iconColor: "text-blue-500" },
}

const URGENCY_SEVERITY: Record<AiInsight["urgency"], "critical" | "warning" | "info"> = {
  high: "critical", medium: "warning", low: "info",
}

// ─── Chiffres clés ────────────────────────────────────────────────────────────

interface KpiMetric {
  label: string
  value: string
  delta: number
  unit: string
  icon: React.ElementType
  deltaInverse?: boolean
}

/** Une cellule KPI dans le MetricSplit — même chrome que les cartes du dashboard. */
function KpiCell({ metric }: { readonly metric: KpiMetric }) {
  const positive = metric.delta > 0
  const isGood = metric.deltaInverse ? !positive : positive
  const deltaClass = metric.delta === 0 ? "text-muted-foreground" : isGood ? "text-emerald-500" : "text-rose-500"
  const DeltaIcon = metric.delta === 0 ? Minus : positive ? TrendingUp : TrendingDown

  return (
    <div className="flex flex-1 flex-col gap-2 px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{metric.label}</span>
        <metric.icon className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{metric.value}</span>
        <span className="text-xs text-muted-foreground">{metric.unit}</span>
      </div>
      <div className={cn("flex items-center gap-1 text-xs font-medium tabular-nums", deltaClass)}>
        <DeltaIcon className="size-3.5" />
        {metric.delta > 0 ? "+" : ""}{metric.delta} vs mois dernier
      </div>
    </div>
  )
}

// ─── Signaux IA ───────────────────────────────────────────────────────────────

function InsightRow({ insight }: { readonly insight: AiInsight }) {
  const meta = SEVERITY_META[URGENCY_SEVERITY[insight.urgency] ?? "info"]
  const Icon = meta.icon
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-3", meta.wrap)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", meta.iconColor)} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{insight.action}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-normal" style={{ color: insight.agentColor }}>
            {insight.agent}
          </Badge>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{insight.insight}</p>
      </div>
      <span className="mt-0.5 shrink-0 text-xs tabular-nums text-muted-foreground">{insight.confidence}%</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user } = useAuth()
  const params = useParams()
  const slug = params.workspace as string
  const openUpgrade = useUpgradeStore((s) => s.openUpgrade)
  const [kpis, setKpis] = useState<AnalyticsKpis | null>(null)
  const [insights, setInsights] = useState<AiInsight[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [projectFilter, setProjectFilter] = useState<string>(ALL_PROJECTS)

  const isPro = user?.planType === "PRO" || user?.planType === "ENTERPRISE"
  const projectId = projectFilter === ALL_PROJECTS ? null : Number(projectFilter)

  // Liste des projets pour le filtre + insights IA (workspace-wide)
  useEffect(() => {
    if (!slug) return
    listProjects(slug).then(setProjects).catch(() => { /* non-critical */ })
    getAiInsights(slug).then(setInsights).catch(() => { /* non-critical */ })
  }, [slug])

  // KPIs réels (re-fetch au changement de filtre projet — PROD-1.7)
  useEffect(() => {
    if (!slug) return
    getAnalyticsKpis(slug, projectId).then(setKpis).catch(() => { /* non-critical */ })
  }, [slug, projectId])

  // KPIs réels → cartes (zéros tant que non chargés ; aucun mock — PROD-1.7)
  const k = kpis ?? { tasksResolved: 0, tasksResolvedDelta: 0, avgResolutionDays: 0, avgResolutionDaysDelta: 0, velocity: 0, velocityDelta: 0, activeCycles: 0 }
  const kpiMetrics: KpiMetric[] = [
    { label: "Tâches terminées", value: String(k.tasksResolved),   delta: k.tasksResolvedDelta,                 unit: "ce mois-ci", icon: TrendingUp },
    { label: "Temps de cycle",   value: `${k.avgResolutionDays} j`, delta: Math.round(k.avgResolutionDaysDelta), unit: "en moyenne", icon: Activity, deltaInverse: true },
    { label: "Vélocité",         value: String(k.velocity),        delta: k.velocityDelta,                      unit: "7 derniers jours", icon: Flame },
    { label: "Cycles actifs",    value: String(k.activeCycles),    delta: 0,                                    unit: "en cours",   icon: Zap },
  ]

  const selectedProject = projects.find((p) => String(p.id) === projectFilter)

  return (
    <PageContainer>
      <PageHeader
        title="Intelligence"
        description="Ce que l'IA observe de vos opérations — et ce qu'elle recommande de faire ensuite."
      />

      {/* Contexte : le sélecteur pilote toute la page, il doit se voir. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-sm font-medium text-foreground">Projet analysé</span>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="h-9 w-64 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PROJECTS}>Tous les projets</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {projectFilter === ALL_PROJECTS
            ? `${projects.length} projet${projects.length > 1 ? "s" : ""} dans cet espace`
            : "L'aide à la décision porte sur ce projet"}
        </span>
      </div>

      {/* 1 — La décision du jour : la raison d'être de la page. */}
      {projectFilter === ALL_PROJECTS ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <Brain className="size-7 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Choisis un projet pour l&apos;aide à la décision</p>
          <p className="max-w-md text-sm text-muted-foreground">
            L&apos;IA lit les métriques réelles du projet et le Brain OS, puis propose la situation, les risques
            et les 3 priorités du jour — transformables en issues d&apos;un clic.
          </p>
        </div>
      ) : (
        <DecisionBoard
          slug={slug}
          projectId={Number(projectFilter)}
          projectName={selectedProject?.name ?? "Projet"}
        />
      )}

      {/* 2 — Les signaux détectés par l'IA. */}
      <SectionCard
        title="Signaux IA"
        icon={<Brain className="size-4" />}
        action={<span className="text-xs text-muted-foreground">{insights.length} {insights.length > 1 ? "signaux" : "signal"}</span>}
        bodyClassName="p-4 space-y-2"
      >
        {insights.length === 0
          ? <p className="py-6 text-center text-sm text-muted-foreground">Aucun signal pour le moment.</p>
          : insights.map((ins, i) => <InsightRow key={`${ins.agent}-${i}`} insight={ins} />)}
      </SectionCard>

      {/* 3 — Les chiffres (même chrome que les cartes du dashboard : en-tête + MetricSplit). */}
      <SectionCard title="Indicateurs clés" icon={<Activity className="size-4" />} bodyClassName="p-0">
        <MetricSplit className="max-sm:flex-col max-sm:divide-x-0 max-sm:divide-y">
          {kpiMetrics.map((m) => <KpiCell key={m.label} metric={m} />)}
        </MetricSplit>
      </SectionCard>

      {/* 4 — L'exploration : 3 aperçus → modal (catalogue + génération IA). */}
      <ChartExplorer slug={slug} projectId={projectId} gated={!isPro} onUpgrade={openUpgrade} />
    </PageContainer>
  )
}
