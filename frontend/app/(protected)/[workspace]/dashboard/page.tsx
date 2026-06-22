"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowUpRight, Clock,
  Zap, Loader2, Layers, Activity,
} from "lucide-react"
import { useAuth } from "@/lib/contexts/auth-context"
import { useProjectStore } from "@/lib/store/project-store"
import { getAiInsights, type AiInsight } from "@/lib/api/analytics-service"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SectionCard, MetricSplit, Metric } from "@/components/ui/section-card"
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
  }, [slug])

  const activeOps = projects.filter((p) => p.status === "ACTIVE").length
  const openIssues = projects.reduce((s, p) => s + p.openIssues, 0)

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
    <div className="flex flex-col gap-6">
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

      {/* KPI groupés en cartes à en-tête (façon carte « Security » de Cloudflare) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Operations" icon={<Layers className="size-4" />} href="./projects" bodyClassName="p-0">
          <MetricSplit>
            <Metric label="Active ops" value={activeOps} />
            <Metric label="Open issues" value={openIssues} />
            <Metric label="At risk" value={0} />
          </MetricSplit>
        </SectionCard>
        <SectionCard title="Activity" icon={<Activity className="size-4" />} bodyClassName="p-0">
          <MetricSplit>
            <Metric label="My queue" value={0} />
            <Metric label="Agents active" value={0} />
          </MetricSplit>
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
    </div>
  )
}
