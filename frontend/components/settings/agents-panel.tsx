"use client"

import { useEffect } from "react"

import { BrandLogo } from "@/components/ui/brand-logo"
import { ClaudeCodeMcpSetup } from "@/components/settings/claude-code-mcp-setup"
import { LocalRunnerSetup } from "@/components/settings/local-runner-setup"
import { Badge } from "@/components/ui/badge"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

/**
 * Réglages « Agents » du workspace (TF-AGENT-DELIVERY A1) : les agents de code auxquels on peut déléguer
 * une issue, et la mise en route du runner local de Claude Code (ADR-013). L'issue ne montre ensuite que
 * l'action « déléguer », comme on assigne une personne.
 */
export function AgentsPanel() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug) ?? ""
  const providers = useDeliveryStore((s) => s.providers)
  const fetchProviders = useDeliveryStore((s) => s.fetchProviders)

  useEffect(() => { if (slug) fetchProviders(slug) }, [slug, fetchProviders])

  return (
    <div className="flex flex-col gap-4">
      <section className="border-b border-border/60 pb-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Delegation agents</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The coding agents your team can delegate tasks to. Once set up, an agent can be picked right
            from an issue&apos;s assignee menu, just like assigning a person.
          </p>
        </div>

        <div className="flex flex-col divide-y divide-border/50">
          {providers.map((p) => (
            <div key={p.key} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-1.5">
                  <BrandLogo slug={p.logoKey} name={p.displayName} className="size-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {p.displayName}
                    {!p.available && <Badge variant="secondary" className="text-[10px] uppercase">Off</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">{descriptionFor(p.key, p.available)}</p>
                  {p.available && !p.ready && p.reason && (
                    <p className="mt-0.5 text-xs text-ink-yellow">{p.reason}</p>
                  )}
                </div>
              </div>

              {/* Runner local : identité machine en libre-service (ADR-013) */}
              {p.key === "claude-code" && p.available && <LocalRunnerSetup />}
              {/* Mode interactif : le Claude Code de la personne sur le serveur MCP de l'instance (lot 5) */}
              {p.key === "claude-code" && slug && <ClaudeCodeMcpSetup slug={slug} />}
            </div>
          ))}
          {providers.length === 0 && (
            <p className="py-4 text-xs text-muted-foreground">Loading agents…</p>
          )}
        </div>
      </section>
    </div>
  )
}

function descriptionFor(key: string, available: boolean): string {
  if (key === "claude-code") {
    return available
      ? "Your own Claude Code, on your machine: works on a branch and opens a pull request."
      : "Your own Claude Code, on your machine. Not enabled on this instance: an administrator turns it on with DELIVERY_LOCAL_RUNNER_ENABLED=true."
  }
  if (key === "github-copilot") {
    return available
      ? "GitHub's cloud agent: works in the project's repository and opens a pull request. Needs a Copilot plan with the cloud agent, on the GitHub account connected to the workspace."
      : "GitHub's cloud agent. Not available on this instance: GitHub isn't set up (GITHUB_CLIENT_ID)."
  }
  return available ? "Available for delegation." : "Not enabled on this instance."
}
