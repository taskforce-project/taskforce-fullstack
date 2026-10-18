"use client"

import { useEffect } from "react"
import { Loader2, CircleCheck, TriangleAlert, ExternalLink } from "lucide-react"

import { RunActivity } from "@/components/sheets/run-activity"
import { useDeliveryStore } from "@/lib/store/delivery-store"

/**
 * État d'un run de délégation sur une issue (TF-AGENT-DELIVERY A2).
 *
 * <p>La délégation elle-même se déclenche depuis le menu <b>Assignee</b> (on choisit un agent comme on
 * choisit une personne) ; la connexion des agents vit dans les réglages « Agents » du workspace. Ce
 * composant montre l'état du run : rien tant qu'aucune délégation, sinon « en cours » (chronologie en direct
 * et validations demandées, lot 5), « terminé » (résumé + lien) ou « échoué » (message). La décision d'accepter
 * le résultat reste humaine.</p>
 */
export function DelegateAgentControl({
  workspaceSlug,
  issueId,
}: Readonly<{ workspaceSlug: string; projectId: number; issueId: number }>) {
  const run = useDeliveryStore((s) => s.runs[issueId])
  const fetchRun = useDeliveryStore((s) => s.fetchRun)
  const activity = useDeliveryStore((s) => (run ? s.activity[run.id] : undefined))
  const fetchActivity = useDeliveryStore((s) => s.fetchActivity)

  useEffect(() => {
    fetchRun(workspaceSlug, issueId)
  }, [workspaceSlug, issueId, fetchRun])

  const active = run?.status === "QUEUED" || run?.status === "RUNNING"
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => { fetchRun(workspaceSlug, issueId) }, 1500)
    return () => clearInterval(id)
  }, [active, workspaceSlug, issueId, fetchRun])

  // Chronologie : lue en continu pendant le run, une dernière fois à sa fin (les derniers événements arrivent
  // avec le résultat).
  const runId = run?.id
  const running = run?.status === "RUNNING"
  useEffect(() => {
    if (!runId) return
    fetchActivity(workspaceSlug, runId)
    if (!running) return
    const id = setInterval(() => { fetchActivity(workspaceSlug, runId) }, 2000)
    return () => clearInterval(id)
  }, [runId, running, workspaceSlug, fetchActivity])

  if (!run) return null

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
      {active ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {run.status === "QUEUED" ? "Waiting for your runner to pick it up" : "Agent working on it"} ({run.providerKey})…
        </span>
      ) : run.status === "DONE" ? (
        <>
          <span className="flex items-center gap-1.5 font-medium text-ink-green">
            <CircleCheck className="size-3.5" /> Agent done - ready for your review
          </span>
          {run.summary && <p className="text-muted-foreground">{run.summary}</p>}
          {run.resultUrl && (
            <a
              href={run.resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="size-3" /> View result
            </a>
          )}
        </>
      ) : (
        <span className="flex items-center gap-1.5 text-destructive">
          <TriangleAlert className="size-3.5" /> Agent failed{run.error ? ` - ${run.error}` : ""}
        </span>
      )}
      <RunActivity slug={workspaceSlug} runId={run.id} activity={activity} live={running} />
    </div>
  )
}
