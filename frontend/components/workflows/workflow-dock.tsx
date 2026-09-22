"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import {
  Layers, Loader2, RefreshCw, Trash2, ChevronRight, Send, Network, ExternalLink, ArrowUpRight,
  CheckCircle2, XCircle, PauseCircle, CircleDashed,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { AgentPlan } from "@/components/ui/agent-plan"
import { BrandLogo } from "@/components/ui/brand-logo"
import { ShimmerLoader } from "@/components/ui/shimmer-loader"
import { Button } from "@/components/ui/button"
import { WorkflowCanvasDialog } from "@/components/workflows/workflow-canvas-dialog"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePanelStore } from "@/lib/store/panel-store"
import { useWorkflowStore } from "@/lib/store/workflow-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import type { AnalysisJob, JobStatus } from "@/lib/api/analysis-service"
import type { DeliveryProvider, DeliveryRun, DeliveryRunStatus } from "@/lib/api/delivery-service"

export const WORKFLOW_PANEL_ID = "workflows"

/** Messages du loader pendant que le plan du workflow se génère (bouclés). */
const WORKFLOW_PHASES = [
  "Spinning up the agent…",
  "Planning the steps…",
  "Gathering context…",
  "Almost ready…",
]

export const isActiveJob = (s: JobStatus) => s === "QUEUED" || s === "RUNNING" || s === "WAITING_FOR_INPUT"
export const isActiveRun = (s: DeliveryRunStatus) => s === "QUEUED" || s === "RUNNING"

const STATUS: Record<JobStatus, { label: string; pill: string; Icon: typeof Loader2; spin?: boolean }> = {
  QUEUED:            { label: "Queued",          pill: "text-muted-foreground bg-muted",                     Icon: CircleDashed },
  RUNNING:           { label: "Running",         pill: "text-blue-500 bg-blue-500/12",                        Icon: Loader2, spin: true },
  WAITING_FOR_INPUT: { label: "Waiting for input", pill: "text-amber-600 dark:text-amber-400 bg-amber-500/14",  Icon: PauseCircle },
  DONE:              { label: "Done",            pill: "text-emerald-500 bg-emerald-500/12",                  Icon: CheckCircle2 },
  FAILED:            { label: "Failed",          pill: "text-rose-500 bg-rose-500/12",                        Icon: XCircle },
}

function JobCard({ slug, job }: Readonly<{ slug: string; job: AnalysisJob }>) {
  const router = useRouter()
  const { answer, dismissJob, launch } = useWorkflowStore()
  const [expanded, setExpanded] = useState(isActiveJob(job.status))
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const meta = STATUS[job.status]

  async function sendAnswer() {
    if (!reply.trim() || sending) return
    setSending(true)
    const ok = await answer(slug, job.id, reply.trim())
    setSending(false)
    if (ok) setReply("")
    else toast.error("Could not send the reply")
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{job.projectName}</p>
          <p className="text-[11px] text-muted-foreground">{job.depth === "DEEP" ? "Deep analysis" : "Quick analysis"}</p>
        </div>
        <span className={cn("flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.pill)}>
          <meta.Icon className={cn("size-3", meta.spin && "animate-spin")} /> {meta.label}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-3">
          {job.plan.length > 0 ? (
            <AgentPlan tasks={job.plan} />
          ) : (
            <ShimmerLoader phrases={WORKFLOW_PHASES} className="px-1 py-2 text-xs" />
          )}

          {job.status === "WAITING_FOR_INPUT" && job.question && (
            <div className="mt-2 rounded-lg border border-amber-500/35 bg-amber-500/[0.08] p-2.5">
              <p className="text-xs leading-relaxed text-foreground">🤖 {job.question}</p>
              <div className="mt-2 flex gap-1.5">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendAnswer() } }}
                  placeholder="Your reply…"
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-amber-500/50"
                />
                <Button size="sm" className="h-8 gap-1 px-2.5 text-xs" onClick={sendAnswer} disabled={!reply.trim() || sending}>
                  {sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                </Button>
              </div>
            </div>
          )}

          {job.status === "FAILED" && job.error && (
            <p className="mt-2 rounded-lg bg-rose-500/[0.08] px-2.5 py-2 text-xs text-rose-500">{job.error}</p>
          )}

          <div className="mt-3 flex items-center gap-1.5">
            {job.status === "DONE" && (
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => router.push(`/${slug}/analytics`)}>
                View result
              </Button>
            )}
            {job.status === "FAILED" && (
              <Button
                size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                onClick={async () => { const j = await launch(slug, job.projectId, job.depth); if (!j) toast.error("Relaunch failed") }}
              >
                <RefreshCw className="size-3" /> Relaunch
              </Button>
            )}
            {!isActiveJob(job.status) && (
              <button
                type="button"
                onClick={async () => {
                  // Succès visible (le job disparaît de la liste) -> pas de toast succès, seulement l'échec.
                  const ok = await dismissJob(slug, job.id)
                  if (!ok) toast.error("Could not archive")
                }}
                className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="size-3" /> Archive
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Une délégation à un agent, passée ou en cours : l'issue (clé + titre), l'agent, le statut, puis le
 * résultat (résumé + lien) ou l'erreur. Lecture seule : la décision d'accepter le résultat se prend sur
 * l'issue, que la carte ouvre par le lien profond du board.
 */
function RunCard({ slug, run, provider }: Readonly<{ slug: string; run: DeliveryRun; provider?: DeliveryProvider }>) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(isActiveRun(run.status))
  const meta = STATUS[run.status]
  const agentName = provider?.displayName ?? run.providerKey
  const when = run.updatedAt ?? run.createdAt
  const title = [run.issueKey, run.issueTitle].filter(Boolean).join(" · ") || `Issue #${run.issueId}`

  return (
    <div className="rounded-xl border border-border bg-card">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        <span className="flex size-5 shrink-0 items-center justify-center">
          <BrandLogo slug={provider?.logoKey ?? "sparkles"} name={agentName} className="size-full" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {[agentName, run.projectName, when ? formatDistanceToNow(new Date(when), { addSuffix: true }) : null]
              .filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={cn("flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.pill)}>
          <meta.Icon className={cn("size-3", meta.spin && "animate-spin")} /> {meta.label}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-3">
          {run.status === "QUEUED" && (
            <p className="text-xs text-muted-foreground">Waiting for the agent to pick it up.</p>
          )}
          {run.status === "RUNNING" && (
            <p className="text-xs text-muted-foreground">The agent is working on it. The issue moves to “In review by AI” when it is done.</p>
          )}
          {run.status === "DONE" && (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{run.summary ?? "Done."}</p>
          )}
          {run.status === "FAILED" && (
            <p className="rounded-lg bg-rose-500/[0.08] px-2.5 py-2 text-xs text-rose-500">{run.error ?? "The agent failed."}</p>
          )}

          <div className="mt-3 flex items-center gap-1.5">
            {run.projectId != null && (
              <Button
                size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                onClick={() => router.push(`/${slug}/projects/${run.projectId}?issue=${run.issueId}`)}
              >
                <ArrowUpRight className="size-3" /> Open issue
              </Button>
            )}
            {run.resultUrl && (
              <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
                <a href={run.resultUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3" /> View result
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children, count }: Readonly<{ children: ReactNode; count: number }>) {
  return (
    <p className="flex items-center gap-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children} <span className="tabular-nums text-muted-foreground/70">{count}</span>
    </p>
  )
}

/**
 * Contenu du panneau « Workflows IA » (le header/resize/close sont fournis par PanelDock).
 * Deux familles de travail IA, dans l'ordre où on les cherche : les <b>délégations</b> à un agent (une
 * issue confiée à Claude Code, Cursor...), historique compris, puis les <b>analyses</b> de projet, qui
 * tournent en arrière-plan (statut en direct, détail via {@link AgentPlan}, et le HITL).
 * Les données sont chargées et rafraîchies par {@link WorkflowsButton}, monté en permanence.
 */
export function WorkflowPanelContent() {
  const jobs = useWorkflowStore((s) => s.jobs)
  const runs = useDeliveryStore((s) => s.workspaceRuns)
  const providers = useDeliveryStore((s) => s.providers)
  const fetchWorkspaceRuns = useDeliveryStore((s) => s.fetchWorkspaceRuns)
  const fetchProviders = useDeliveryStore((s) => s.fetchProviders)
  const activeSlug = useWorkspaceStore((s) => s.activeWorkspace?.slug) ?? ""
  const [canvasOpen, setCanvasOpen] = useState(false)

  // À l'ouverture : l'historique à jour (une délégation a pu se terminer panneau fermé) + le nom et le
  // logo des agents.
  useEffect(() => {
    if (!activeSlug) return
    fetchWorkspaceRuns(activeSlug)
    if (useDeliveryStore.getState().providers.length === 0) fetchProviders(activeSlug)
  }, [activeSlug, fetchWorkspaceRuns, fetchProviders])

  const providerOf = (key: string) => providers.find((p) => p.key === key)
  const empty = jobs.length === 0 && runs.length === 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b p-2">
        <Button size="sm" variant="outline" className="h-8 w-full gap-1.5 text-xs" onClick={() => setCanvasOpen(true)}>
          <Network className="size-3.5" /> Open the workflow canvas
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <Layers className="size-7 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No workflows</p>
            <p className="text-xs text-muted-foreground">Delegate an issue to an agent from its Assignee menu, or launch an analysis from a project (Intelligence page). Both show up here, and keep running even if you leave the page.</p>
          </div>
        ) : (
          <>
            {runs.length > 0 && (
              <>
                <SectionLabel count={runs.length}>Delegations</SectionLabel>
                {runs.map((run) => <RunCard key={run.id} slug={activeSlug} run={run} provider={providerOf(run.providerKey)} />)}
              </>
            )}
            {jobs.length > 0 && (
              <>
                <SectionLabel count={jobs.length}>Analyses</SectionLabel>
                {jobs.map((job) => <JobCard key={job.id} slug={activeSlug} job={job} />)}
              </>
            )}
          </>
        )}
      </div>
      <WorkflowCanvasDialog open={canvasOpen} onOpenChange={setCanvasOpen} />
    </div>
  )
}

/** Ouvre/ferme le panneau des workflows (toggle depuis la topbar). */
export function toggleWorkflowPanel() {
  usePanelStore.getState().togglePanel({
    id: WORKFLOW_PANEL_ID,
    side: "right",
    title: "AI Workflows",
    icon: <Layers className="size-4 text-primary" />,
    width: 420,
    content: <WorkflowPanelContent />,
  })
}

/** Ouvre le panneau (ex. au lancement d'une analyse). */
export function openWorkflowPanel() {
  usePanelStore.getState().openPanel({
    id: WORKFLOW_PANEL_ID,
    side: "right",
    title: "AI Workflows",
    icon: <Layers className="size-4 text-primary" />,
    width: 420,
    content: <WorkflowPanelContent />,
  })
}
