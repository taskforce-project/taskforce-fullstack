"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowUpRight, AlertTriangle, CheckCircle2, ChevronRight,
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

// ─── Static demo data ─────────────────────────────────────────────────────────

const EXCEPTIONS = [
  { id: "1", severity: "critical" as const, source: "COO",    message: "Mobile App sprint velocity −31% — delivery at risk", age: "2h" },
  { id: "2", severity: "warning"  as const, source: "System", message: "TF-38 overdue by 2 days — no assignee update",       age: "5h" },
]

const AGENTS = [
  { id: "ceo",  acronym: "CEO",  status: "standby" as const, task: "Strategic overview updated",      ago: "2h"  },
  { id: "cfo",  acronym: "CFO",  status: "active"  as const, task: "Generating Q2 burn analysis…",    ago: "now" },
  { id: "coo",  acronym: "COO",  status: "active"  as const, task: "Sprint risk assessment complete", ago: "4m"  },
  { id: "cto",  acronym: "CTO",  status: "standby" as const, task: "Architecture review complete",    ago: "1d"  },
  { id: "cpo",  acronym: "CPO",  status: "standby" as const, task: "Roadmap prioritization updated",  ago: "3h"  },
  { id: "chro", acronym: "CHRO", status: "idle"    as const, task: "Last active yesterday",           ago: "1d"  },
]

const PENDING_DECISIONS = [
  { id: "1", href: "./agents", agent: "CFO", action: "Approve Q2 budget reallocation (+12k)", confidence: 87 },
  { id: "2", href: "./agents", agent: "COO", action: "Reassign TF-38 before sprint close",     confidence: 92 },
]

const STATUS_DOT: Record<string, string> = {
  active:  "bg-emerald-500",
  standby: "bg-amber-500",
  idle:    "bg-muted-foreground/50",
}

// ─── Primitives ───────────────────────────────────────────────────────────────

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
            <Metric label="Agents active" value={2} />
          </MetricSplit>
        </SectionCard>
      </div>

      {/* Main grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left 2/3 */}
        <div className="space-y-5 lg:col-span-2">
          {/* Needs attention */}
          {EXCEPTIONS.length > 0 && (
            <SectionCard title="Needs attention" bodyClassName="p-4 space-y-2">
                {EXCEPTIONS.map((ex) => {
                  const critical = ex.severity === "critical"
                  return (
                    <Link
                      key={ex.id}
                      href="./projects"
                      className={cn(
                        "group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                        critical
                          ? "border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/15"
                          : "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15"
                      )}
                    >
                      <AlertTriangle className={cn("size-4 shrink-0", critical ? "text-rose-500" : "text-amber-500")} />
                      <p className="flex-1 text-sm font-medium text-foreground">{ex.message}</p>
                      <Badge variant="secondary" className="font-mono text-[10px]">{ex.source}</Badge>
                      <span className="text-xs text-muted-foreground">{ex.age}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
                    </Link>
                  )
                })}
            </SectionCard>
          )}

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
          {/* Agent activity */}
          <SectionCard title="Agent activity" href="./agents" bodyClassName="p-0">
              {AGENTS.map((agent) => (
                <Link
                  key={agent.id}
                  href="./agents"
                  className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-muted/50"
                >
                  <span className="relative flex size-2 shrink-0">
                    {agent.status === "active" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
                    <span className={cn("relative inline-flex size-2 rounded-full", STATUS_DOT[agent.status])} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <span className="rounded bg-primary/10 px-1 py-px text-[8px] font-bold uppercase tracking-wide text-primary">AI</span>
                        <span className="text-xs font-semibold text-foreground">{agent.acronym}</span>
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{agent.ago}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{agent.task}</p>
                  </div>
                </Link>
              ))}
          </SectionCard>

          {/* Pending decisions */}
          <SectionCard title="Pending decisions" bodyClassName="p-0">
              {PENDING_DECISIONS.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-emerald-500" /> No decisions pending
                </div>
              ) : PENDING_DECISIONS.map((d) => (
                <Link key={d.id} href={d.href} className="group flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-muted/50">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold">{d.agent}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{d.action}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{d.confidence}% confidence</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
                </Link>
              ))}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
