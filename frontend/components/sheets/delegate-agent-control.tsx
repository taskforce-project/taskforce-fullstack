"use client"

import { useEffect } from "react"
import { Loader2, CircleCheck, TriangleAlert, ExternalLink } from "lucide-react"

import { useDeliveryStore } from "@/lib/store/delivery-store"

/**
 * État d'un run de délégation sur une issue (TF-AGENT-DELIVERY A2).
 *
 * <p>La délégation elle-même se déclenche depuis le menu <b>Assignee</b> (on choisit un agent comme on
 * choisit une personne) ; la connexion des clés vit dans les réglages « Agents » du workspace. Ce
 * composant ne fait plus que <b>montrer l'état du run</b> : rien tant qu'aucune délégation, sinon
 * « en cours » (polling), « terminé » (résumé + lien) ou « échoué » (message). La décision d'accepter
 * le résultat reste humaine.</p>
 */
export function DelegateAgentControl({
  workspaceSlug,
  issueId,
}: Readonly<{ workspaceSlug: string; projectId: number; issueId: number }>) {
  const run = useDeliveryStore((s) => s.runs[issueId])
  const fetchRun = useDeliveryStore((s) => s.fetchRun)

  useEffect(() => {
    fetchRun(workspaceSlug, issueId)
  }, [workspaceSlug, issueId, fetchRun])

  const active = run?.status === "QUEUED" || run?.status === "RUNNING"
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => { fetchRun(workspaceSlug, issueId) }, 1500)
    return () => clearInterval(id)
  }, [active, workspaceSlug, issueId, fetchRun])

  if (!run) return null

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
      {active ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Agent working on it ({run.providerKey})…
        </span>
      ) : run.status === "DONE" ? (
        <>
          <span className="flex items-center gap-1.5 font-medium text-emerald-500">
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
        <span className="flex items-center gap-1.5 text-red-500">
          <TriangleAlert className="size-3.5" /> Agent failed{run.error ? ` - ${run.error}` : ""}
        </span>
      )}
    </div>
  )
}
