"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Layers, Loader2, RefreshCw, Trash2, ChevronRight, Send,
  CheckCircle2, XCircle, PauseCircle, CircleDashed,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { AgentPlan } from "@/components/ui/agent-plan"
import { Button } from "@/components/ui/button"
import { usePanelStore } from "@/lib/store/panel-store"
import { useWorkflowStore } from "@/lib/store/workflow-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import type { AnalysisJob, JobStatus } from "@/lib/api/analysis-service"

export const WORKFLOW_PANEL_ID = "workflows"

export const isActiveJob = (s: JobStatus) => s === "QUEUED" || s === "RUNNING" || s === "WAITING_FOR_INPUT"

const STATUS: Record<JobStatus, { label: string; pill: string; Icon: typeof Loader2; spin?: boolean }> = {
  QUEUED:            { label: "En file",         pill: "text-muted-foreground bg-muted",                     Icon: CircleDashed },
  RUNNING:           { label: "En cours",        pill: "text-blue-500 bg-blue-500/12",                        Icon: Loader2, spin: true },
  WAITING_FOR_INPUT: { label: "Attend une info", pill: "text-amber-600 dark:text-amber-400 bg-amber-500/14",  Icon: PauseCircle },
  DONE:              { label: "Terminé",         pill: "text-emerald-500 bg-emerald-500/12",                  Icon: CheckCircle2 },
  FAILED:            { label: "Échoué",          pill: "text-rose-500 bg-rose-500/12",                        Icon: XCircle },
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
    else toast.error("Impossible d'envoyer la réponse")
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{job.projectName}</p>
          <p className="text-[11px] text-muted-foreground">{job.depth === "DEEP" ? "Analyse approfondie" : "Analyse rapide"}</p>
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
            <p className="px-1 py-2 text-xs text-muted-foreground">Initialisation du workflow…</p>
          )}

          {job.status === "WAITING_FOR_INPUT" && job.question && (
            <div className="mt-2 rounded-lg border border-amber-500/35 bg-amber-500/[0.08] p-2.5">
              <p className="text-xs leading-relaxed text-foreground">🤖 {job.question}</p>
              <div className="mt-2 flex gap-1.5">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendAnswer() } }}
                  placeholder="Ta réponse…"
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
                Voir le résultat
              </Button>
            )}
            {job.status === "FAILED" && (
              <Button
                size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                onClick={async () => { const j = await launch(slug, job.projectId, job.depth); if (!j) toast.error("Relance impossible") }}
              >
                <RefreshCw className="size-3" /> Relancer
              </Button>
            )}
            {!isActiveJob(job.status) && (
              <button
                type="button"
                onClick={() => dismissJob(slug, job.id)}
                className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="size-3" /> Archiver
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Contenu du panneau « Workflows IA » (le header/resize/close sont fournis par PanelDock).
 * Les analyses tournent en arrière-plan (persistées) ; ici on liste leur statut en direct,
 * le détail live via {@link AgentPlan}, et le HITL (question du modèle).
 */
export function WorkflowPanelContent() {
  const jobs = useWorkflowStore((s) => s.jobs)
  const activeSlug = useWorkspaceStore((s) => s.activeWorkspace?.slug) ?? ""

  return (
    <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
      {jobs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <Layers className="size-7 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Aucun workflow</p>
          <p className="text-xs text-muted-foreground">Lance une analyse depuis un projet (page Intelligence) — elle apparaîtra ici et continuera même si tu quittes la page.</p>
        </div>
      ) : (
        jobs.map((job) => <JobCard key={job.id} slug={activeSlug} job={job} />)
      )}
    </div>
  )
}

/** Ouvre/ferme le panneau des workflows (toggle depuis la topbar). */
export function toggleWorkflowPanel() {
  usePanelStore.getState().togglePanel({
    id: WORKFLOW_PANEL_ID,
    side: "right",
    title: "Workflows IA",
    icon: <Layers className="size-4 text-primary" />,
    width: 400,
    content: <WorkflowPanelContent />,
  })
}

/** Ouvre le panneau (ex. au lancement d'une analyse). */
export function openWorkflowPanel() {
  usePanelStore.getState().openPanel({
    id: WORKFLOW_PANEL_ID,
    side: "right",
    title: "Workflows IA",
    icon: <Layers className="size-4 text-primary" />,
    width: 400,
    content: <WorkflowPanelContent />,
  })
}
