"use client"

import { useEffect, useState } from "react"
import { Loader2, KeyRound } from "lucide-react"
import { toast } from "sonner"

import { BrandLogo } from "@/components/ui/brand-logo"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import type { DeliveryKeyProvider } from "@/lib/api/delivery-service"
import { cn } from "@/lib/utils"

/**
 * Réglages « Agents » du workspace (TF-AGENT-DELIVERY A1).
 *
 * <p>C'est le SEUL endroit où l'on connecte/déconnecte les clés des agents de délégation. Avant, ces
 * formulaires vivaient DANS chaque issue (le picker + les clés en ligne = illisible). Ici on liste les
 * agents disponibles pour la délégation, on branche leur clé une fois, et l'issue ne montre plus que
 * l'action « déléguer » (comme on assigne une personne).</p>
 */
const KEY_OF: Record<string, { id: DeliveryKeyProvider; label: string; placeholder: string; note: string }> = {
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

export function AgentsPanel() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug) ?? ""
  const providers = useDeliveryStore((s) => s.providers)
  const keys = useDeliveryStore((s) => s.keys)
  const fetchProviders = useDeliveryStore((s) => s.fetchProviders)
  const fetchKey = useDeliveryStore((s) => s.fetchKey)
  const connectKey = useDeliveryStore((s) => s.connectKey)
  const disconnectKey = useDeliveryStore((s) => s.disconnectKey)
  const setSection = useSettingsStore((s) => s.setSection)

  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => { if (slug) fetchProviders(slug) }, [slug, fetchProviders])
  useEffect(() => {
    providers.forEach((p) => {
      const meta = KEY_OF[p.key]
      if (p.available && meta) fetchKey(slug, meta.id)
    })
  }, [providers, slug, fetchKey])

  async function onConnect(id: DeliveryKeyProvider, label: string) {
    const val = (inputs[id] ?? "").trim()
    if (!val) return
    setBusy(id)
    const res = await connectKey(slug, id, val)
    setBusy(null)
    if (res?.connected) {
      setInputs((s) => ({ ...s, [id]: "" }))
      toast.success(`${label} key connected`)
    } else {
      toast.error("Couldn't connect the key. You need to be an admin of this workspace.")
    }
  }

  async function onDisconnect(id: DeliveryKeyProvider, label: string) {
    setBusy(id)
    const ok = await disconnectKey(slug, id)
    setBusy(null)
    if (ok) toast.success(`${label} key disconnected`)
    else toast.error("Couldn't disconnect the key. Please try again.")
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="border-b border-border/60 pb-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Delegation agents</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Connect the coding agents your team can delegate tasks to. Once connected, an agent can be
            picked right from an issue&apos;s assignee menu - just like assigning a person.
          </p>
        </div>

        <div className="flex flex-col divide-y divide-border/50">
          {providers.map((p) => {
            const meta = KEY_OF[p.key]
            const status = meta ? keys[meta.id] : undefined
            const rowBusy = meta ? busy === meta.id : false
            return (
              <div key={p.key} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-1.5">
                    <BrandLogo slug={p.logoKey} name={p.displayName} className="size-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {p.displayName}
                      {!p.available && <Badge variant="secondary" className="text-[10px] uppercase">soon</Badge>}
                      {meta && status?.connected && (
                        <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-[10px] text-emerald-500">
                          Connected
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{descriptionFor(p.key, p.available)}</p>
                  </div>
                  {meta && status?.connected && (
                    <div className="flex items-center gap-2">
                      {status.keyHint && <code className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{status.keyHint}</code>}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 border-destructive/30 text-xs text-destructive hover:bg-destructive/10"
                        disabled={rowBusy}
                        onClick={() => onDisconnect(meta.id, meta.label)}
                      >
                        Disconnect
                      </Button>
                    </div>
                  )}
                  {p.key === "github-copilot" && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSection("integrations")}>
                      Manage GitHub
                    </Button>
                  )}
                </div>

                {/* Connexion de clé (providers à clé non connectés) */}
                {meta && status && !status.connected && (
                  <div className={cn("flex flex-col gap-1.5 rounded-md border border-dashed border-border p-2")}>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <KeyRound className="size-3.5" /> Connect your {meta.label} key
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="password"
                        value={inputs[meta.id] ?? ""}
                        onChange={(e) => setInputs((s) => ({ ...s, [meta.id]: e.target.value }))}
                        placeholder={meta.placeholder}
                        autoComplete="off"
                        className="h-8 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary/50"
                      />
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        disabled={rowBusy || (inputs[meta.id] ?? "").trim().length === 0}
                        onClick={() => onConnect(meta.id, meta.label)}
                      >
                        {rowBusy ? <Loader2 className="size-3.5 animate-spin" /> : "Connect"}
                      </Button>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{meta.note}</span>
                  </div>
                )}
              </div>
            )
          })}
          {providers.length === 0 && (
            <p className="py-4 text-xs text-muted-foreground">Loading agents…</p>
          )}
        </div>
      </section>
    </div>
  )
}

function descriptionFor(key: string, available: boolean): string {
  switch (key) {
    case "claude-api": return "Claude via the Anthropic API - a single call that plans or drafts the task."
    case "cursor": return "Cursor background agent - works on the linked repo and opens a pull request."
    case "github-copilot": return "GitHub-hosted model inference, using your connected GitHub account."
    case "claude-code": return "Full agentic Claude Code (clone, edit, open a PR) - coming soon."
    case "stub": return "Demo agent - simulates a run end to end, no setup or cost."
    default: return available ? "Available for delegation." : "Coming soon."
  }
}
