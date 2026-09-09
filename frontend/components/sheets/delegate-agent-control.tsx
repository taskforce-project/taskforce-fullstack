"use client"

import { useEffect, useState } from "react"
import { Bot, Loader2, CircleCheck, TriangleAlert, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { BrandLogo } from "@/components/ui/brand-logo"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { cn } from "@/lib/utils"

/**
 * Contrôle de délégation à un agent de livraison sur une issue (TF-AGENT-DELIVERY slice 5).
 * Picker « déléguer à... » (providers + logos ; indisponibles = « soon ») + état du run (polling
 * jusqu'à DONE/FAILED, avec résumé + lien de résultat). La décision d'accepter reste humaine.
 */
export function DelegateAgentControl({
  workspaceSlug,
  issueId,
}: Readonly<{ workspaceSlug: string; projectId: number; issueId: number }>) {
  const providers = useDeliveryStore((s) => s.providers)
  const run = useDeliveryStore((s) => s.runs[issueId])
  const fetchProviders = useDeliveryStore((s) => s.fetchProviders)
  const fetchRun = useDeliveryStore((s) => s.fetchRun)
  const delegate = useDeliveryStore((s) => s.delegate)

  const [busyKey, setBusyKey] = useState<string | null>(null)

  // Chargement initial : providers + dernier run de l'issue.
  useEffect(() => {
    fetchProviders(workspaceSlug)
    fetchRun(workspaceSlug, issueId)
  }, [workspaceSlug, issueId, fetchProviders, fetchRun])

  // Polling tant que le run est en cours (QUEUED/RUNNING) - le stub termine vite.
  const active = run?.status === "QUEUED" || run?.status === "RUNNING"
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => { fetchRun(workspaceSlug, issueId) }, 1500)
    return () => clearInterval(id)
  }, [active, workspaceSlug, issueId, fetchRun])

  async function onDelegate(key: string, name: string) {
    setBusyKey(key)
    const res = await delegate(workspaceSlug, issueId, key)
    setBusyKey(null)
    if (res) toast.success(`Delegated to ${name}`)
    else toast.error("Couldn't delegate the task. Please try again.")
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Bot className="size-3.5" /> Delegate to an agent
      </div>

      {/* État du run courant */}
      {run && (
        <div className="flex flex-col gap-1 text-xs">
          {active ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Running on {run.providerKey}…
            </span>
          ) : run.status === "DONE" ? (
            <>
              <span className="flex items-center gap-1.5 font-medium text-emerald-500">
                <CircleCheck className="size-3.5" /> Done - ready for your review
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
              <TriangleAlert className="size-3.5" /> Failed{run.error ? ` - ${run.error}` : ""}
            </span>
          )}
        </div>
      )}

      {/* Picker (masqué pendant un run actif) */}
      {!active && (
        <div className="flex flex-wrap gap-1.5">
          {providers.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={!p.available || busyKey !== null}
              onClick={() => onDelegate(p.key, p.displayName)}
              title={p.available ? `Delegate to ${p.displayName}` : `${p.displayName} - coming soon`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                p.available
                  ? "border-border hover:bg-accent"
                  : "cursor-not-allowed border-dashed border-border text-muted-foreground opacity-60",
              )}
            >
              {busyKey === p.key ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <BrandLogo slug={p.logoKey} name={p.displayName} className="size-3.5" />
              )}
              {p.displayName}
              {!p.available && <span className="text-[10px] uppercase tracking-wide">soon</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
