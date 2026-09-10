"use client"

import { useEffect, useState } from "react"
import { Bot, Loader2, CircleCheck, TriangleAlert, ExternalLink, KeyRound } from "lucide-react"
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
  const anthropic = useDeliveryStore((s) => s.anthropic)
  const fetchProviders = useDeliveryStore((s) => s.fetchProviders)
  const fetchRun = useDeliveryStore((s) => s.fetchRun)
  const delegate = useDeliveryStore((s) => s.delegate)
  const fetchAnthropic = useDeliveryStore((s) => s.fetchAnthropic)
  const connectAnthropic = useDeliveryStore((s) => s.connectAnthropic)
  const disconnectAnthropic = useDeliveryStore((s) => s.disconnectAnthropic)

  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState("")
  const [keyBusy, setKeyBusy] = useState(false)

  // « Claude (API) » présent et exécutable = la délégation dépend d'une clé Anthropic connectée.
  const hasClaudeApi = providers.some((p) => p.key === "claude-api" && p.available)

  // Chargement initial : providers + dernier run de l'issue.
  useEffect(() => {
    fetchProviders(workspaceSlug)
    fetchRun(workspaceSlug, issueId)
  }, [workspaceSlug, issueId, fetchProviders, fetchRun])

  // État de la clé Anthropic (seulement si le provider Claude API est proposé).
  useEffect(() => {
    if (hasClaudeApi) fetchAnthropic(workspaceSlug)
  }, [hasClaudeApi, workspaceSlug, fetchAnthropic])

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

  async function onConnectKey() {
    const key = keyInput.trim()
    if (!key) return
    setKeyBusy(true)
    const res = await connectAnthropic(workspaceSlug, key)
    setKeyBusy(false)
    if (res?.connected) {
      setKeyInput("")
      toast.success("Anthropic key connected")
    } else {
      toast.error("Couldn't connect the key. You need to be an admin of this workspace.")
    }
  }

  async function onDisconnectKey() {
    setKeyBusy(true)
    const ok = await disconnectAnthropic(workspaceSlug)
    setKeyBusy(false)
    if (ok) toast.success("Anthropic key disconnected")
    else toast.error("Couldn't disconnect the key. Please try again.")
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
          {providers.map((p) => {
            const needsKey = p.key === "claude-api" && !anthropic?.connected
            const disabled = !p.available || busyKey !== null || needsKey
            const title = needsKey
              ? "Connect your Anthropic key first"
              : p.available
                ? `Delegate to ${p.displayName}`
                : `${p.displayName} - coming soon`
            return (
              <button
                key={p.key}
                type="button"
                disabled={disabled}
                onClick={() => onDelegate(p.key, p.displayName)}
                title={title}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                  p.available && !needsKey
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
            )
          })}
        </div>
      )}

      {/* Connexion de la clé Anthropic (délégation Claude via l'API, B1) - seulement si proposé */}
      {!active && hasClaudeApi && anthropic && (
        <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border p-2 text-xs">
          {anthropic.connected ? (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <KeyRound className="size-3.5" /> Anthropic key connected
                {anthropic.keyHint && (
                  <code className="rounded bg-muted px-1 text-[10px]">{anthropic.keyHint}</code>
                )}
              </span>
              <button
                type="button"
                onClick={onDisconnectKey}
                disabled={keyBusy}
                className="text-muted-foreground transition-colors hover:text-red-500 disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <KeyRound className="size-3.5" /> Connect your Anthropic key to run Claude (API)
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={onConnectKey}
                  disabled={keyBusy || keyInput.trim().length === 0}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {keyBusy ? <Loader2 className="size-3.5 animate-spin" /> : "Connect"}
                </button>
              </div>
              <span className="text-[10px] text-muted-foreground">
                Runs in Anthropic&apos;s cloud, billed to your account. Stored encrypted, never shown again.
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
