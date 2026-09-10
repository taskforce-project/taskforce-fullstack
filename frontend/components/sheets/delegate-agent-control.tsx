"use client"

import { useEffect, useState } from "react"
import { Bot, Loader2, CircleCheck, TriangleAlert, ExternalLink, KeyRound } from "lucide-react"
import { toast } from "sonner"

import { BrandLogo } from "@/components/ui/brand-logo"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import type { DeliveryKeyProvider } from "@/lib/api/delivery-service"
import { cn } from "@/lib/utils"

/**
 * Providers dont l'exécution dépend d'une clé API par workspace, connectée ici (TF-AGENT-DELIVERY).
 * `id` = provider de clé côté backend ("anthropic" | "cursor"). Les autres providers exécutables
 * (Copilot via le token GitHub, stub) n'ont pas de clé propre à saisir.
 */
const KEY_PROVIDERS: Record<string, { id: DeliveryKeyProvider; label: string; placeholder: string; note: string }> = {
  "claude-api": {
    id: "anthropic",
    label: "Anthropic",
    placeholder: "sk-ant-...",
    note: "Runs in Anthropic's cloud, billed to your account. Stored encrypted, never shown again.",
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    placeholder: "key_...",
    note: "Runs Cursor background agents on the linked repo, billed to your account. Stored encrypted.",
  },
}

/**
 * Contrôle de délégation à un agent de livraison sur une issue (TF-AGENT-DELIVERY).
 * Picker « déléguer à... » (providers + logos ; indisponibles = « soon ») + connexion des clés
 * (Anthropic, Cursor) + état du run (polling jusqu'à DONE/FAILED, avec résumé + lien). Les providers
 * à clé sont désactivés tant que leur clé n'est pas connectée. La décision d'accepter reste humaine.
 */
export function DelegateAgentControl({
  workspaceSlug,
  issueId,
}: Readonly<{ workspaceSlug: string; projectId: number; issueId: number }>) {
  const providers = useDeliveryStore((s) => s.providers)
  const run = useDeliveryStore((s) => s.runs[issueId])
  const keys = useDeliveryStore((s) => s.keys)
  const fetchProviders = useDeliveryStore((s) => s.fetchProviders)
  const fetchRun = useDeliveryStore((s) => s.fetchRun)
  const delegate = useDeliveryStore((s) => s.delegate)
  const fetchKey = useDeliveryStore((s) => s.fetchKey)
  const connectKey = useDeliveryStore((s) => s.connectKey)
  const disconnectKey = useDeliveryStore((s) => s.disconnectKey)

  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [keyBusy, setKeyBusy] = useState<string | null>(null)

  // Chargement initial : providers + dernier run de l'issue.
  useEffect(() => {
    fetchProviders(workspaceSlug)
    fetchRun(workspaceSlug, issueId)
  }, [workspaceSlug, issueId, fetchProviders, fetchRun])

  // État des clés pour les providers à clé réellement proposés (Anthropic, Cursor).
  useEffect(() => {
    providers.forEach((p) => {
      const meta = KEY_PROVIDERS[p.key]
      if (p.available && meta) fetchKey(workspaceSlug, meta.id)
    })
  }, [providers, workspaceSlug, fetchKey])

  // Polling tant que le run est en cours (QUEUED/RUNNING) - le stub/Claude terminent vite, Cursor via refresh.
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

  async function onConnectKey(id: DeliveryKeyProvider, label: string) {
    const val = (keyInputs[id] ?? "").trim()
    if (!val) return
    setKeyBusy(id)
    const res = await connectKey(workspaceSlug, id, val)
    setKeyBusy(null)
    if (res?.connected) {
      setKeyInputs((s) => ({ ...s, [id]: "" }))
      toast.success(`${label} key connected`)
    } else {
      toast.error("Couldn't connect the key. You need to be an admin of this workspace.")
    }
  }

  async function onDisconnectKey(id: DeliveryKeyProvider, label: string) {
    setKeyBusy(id)
    const ok = await disconnectKey(workspaceSlug, id)
    setKeyBusy(null)
    if (ok) toast.success(`${label} key disconnected`)
    else toast.error("Couldn't disconnect the key. Please try again.")
  }

  const keyedProviders = providers.filter((p) => p.available && KEY_PROVIDERS[p.key])

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
            const meta = KEY_PROVIDERS[p.key]
            const needsKey = !!meta && !keys[meta.id]?.connected
            const disabled = !p.available || busyKey !== null || needsKey
            const title = needsKey
              ? `Connect your ${meta.label} key first`
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

      {/* Connexion des clés de délégation (Anthropic, Cursor) - une ligne par provider proposé */}
      {!active && keyedProviders.map((p) => {
        const meta = KEY_PROVIDERS[p.key]
        const status = keys[meta.id]
        if (!status) return null // pas encore chargé
        const busy = keyBusy === meta.id
        return (
          <div key={meta.id} className="flex flex-col gap-1.5 rounded-md border border-dashed border-border p-2 text-xs">
            {status.connected ? (
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <KeyRound className="size-3.5" /> {meta.label} key connected
                  {status.keyHint && (
                    <code className="rounded bg-muted px-1 text-[10px]">{status.keyHint}</code>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onDisconnectKey(meta.id, meta.label)}
                  disabled={busy}
                  className="text-muted-foreground transition-colors hover:text-red-500 disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <KeyRound className="size-3.5" /> Connect your {meta.label} key to run {p.displayName}
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="password"
                    value={keyInputs[meta.id] ?? ""}
                    onChange={(e) => setKeyInputs((s) => ({ ...s, [meta.id]: e.target.value }))}
                    placeholder={meta.placeholder}
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => onConnectKey(meta.id, meta.label)}
                    disabled={busy || (keyInputs[meta.id] ?? "").trim().length === 0}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Connect"}
                  </button>
                </div>
                <span className="text-[10px] text-muted-foreground">{meta.note}</span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
