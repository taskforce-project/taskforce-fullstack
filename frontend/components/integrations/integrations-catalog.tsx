"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Info, Loader2, ExternalLink, Check, Plug, Search, ChevronLeft, Globe, BookOpen, Server, Wrench, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BrandLogo } from "@/components/ui/brand-logo"
import { LabBanner } from "@/components/layout/lab-banner"
import { cn } from "@/lib/utils"
import { useIntegrationStore } from "@/lib/store/integration-store"
import {
  getIntegrationCatalog, getPlaneStatus, connectPlane, listPlaneProjects, syncPlane, disconnectPlane,
  connectConnector, disconnectConnector,
  getMcpServers, connectMcpServer, disconnectMcpServer,
  type IntegrationCatalog, type ConnectorView, type PlaneProject, type PlaneStatus, type McpServerStatus,
} from "@/lib/api/integration-service"

const CAP_LABEL: Record<string, string> = { observe: "Observe", act: "Act", metrics: "Metrics", recommend: "Components", mcp: "MCP" }
const CAP_DESC: Record<string, string> = {
  observe: "Feeds the Brain OS with the service's data (read).",
  act: "Can act in the service from TaskForce (write).",
  metrics: "Reports metrics and indicators.",
  recommend: "Component recommendations by Cortex (coming soon).",
  mcp: "Plug this tool's MCP server: its tools go live in Cortex (read + actions under your approval).",
}
const AUTH_LABEL: Record<string, string> = { OAUTH2: "OAuth", API_KEY: "API Key", TOKEN: "Token", CONFIG: "Config", NONE: "No auth" }
const AUTH_HELP: Record<string, string> = {
  OAUTH2: "Connect via OAuth (redirect to the service).",
  API_KEY: "Connect with an API key.",
  TOKEN: "Connect with a personal access token.",
  CONFIG: "Connect with an endpoint + credentials.",
  NONE: "No authentication required.",
}

/** Puce de filtre par catégorie (façon marketplace). */
function CatPill({ active, onClick, children }: Readonly<{ active: boolean; onClick: () => void; children: React.ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground/20 bg-foreground/10 text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

/** Le catalogue générique : rend le « pool » d'outils (GET /integrations/catalog) groupé par catégorie. */
export function IntegrationsCatalog({ slug }: Readonly<{ slug: string }>) {
  const [catalog, setCatalog] = useState<IntegrationCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [dialogTool, setDialogTool] = useState<ConnectorView | null>(null)
  // Connecteur affiché en fiche détaillée (clic sur une carte). null = grille.
  const [detailTool, setDetailTool] = useState<ConnectorView | null>(null)
  const [query, setQuery] = useState("")
  const [activeCat, setActiveCat] = useState<string>("all")
  // Filtre « ce que j'ai connecté ou pas » (en plus du filtre par catégorie).
  const [statusFilter, setStatusFilter] = useState<"all" | "connected" | "disconnected">("all")
  const { connectGitHub, connectSlack } = useIntegrationStore()

  const refresh = useCallback(() => {
    setLoading(true)
    setError(false)
    getIntegrationCatalog(slug)
      .then((c) => {
        setCatalog(c)
        setError(false)
        // Garde la fiche ouverte à jour (ex. état « connecté » après connexion).
        setDetailTool((prev) => prev
          ? c.categories.flatMap((g) => g.tools).find((t) => t.key === prev.key) ?? prev
          : null)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => { refresh() }, [refresh])

  async function handleAction(tool: ConnectorView) {
    // GitHub / Slack : OAuth 1-clic dédié (redirection). Le reste → dialog générique (formulaire).
    if (!tool.connected && (tool.key === "github" || tool.key === "slack")) {
      try {
        if (tool.key === "github") await connectGitHub(slug)
        else await connectSlack(slug)
      } catch {
        toast.error(`Could not start the ${tool.name} connection`)
      }
      return
    }
    setDialogTool(tool)
  }

  // Filtrage recherche + catégorie (marketplace) - catégories vides masquées.
  const groups = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    return catalog.categories
      .filter((g) => activeCat === "all" || g.category === activeCat)
      .map((g) => ({
        ...g,
        tools: g.tools
          .filter((t) => statusFilter === "all" || (statusFilter === "connected" ? t.connected : !t.connected))
          .filter((t) => !q || t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)),
      }))
      .filter((g) => g.tools.length > 0)
  }, [catalog, query, activeCat, statusFilter])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  if (error || !catalog) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">The integrations catalog could not be loaded.</p>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
          <Loader2 className="size-3.5" /> Retry
        </Button>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-5">
        {detailTool ? (
          <ConnectorDetailView
            tool={detailTool}
            categoryLabel={catalog.categories.find((c) => c.category === detailTool.category)?.label ?? detailTool.category}
            onBack={() => setDetailTool(null)}
            onConnect={() => handleAction(detailTool)}
          />
        ) : (
        <>
        <LabBanner
          feature="integrations"
          message="Integrations: connectors marked MCP can plug in their tool's MCP server, so its tools go live in Cortex (reads run, writes need your approval). Others store credentials for now, with per-tool sync rolling out. A few (UI & components) are on the roadmap, shown as 'Soon'."
        />

        {/* Filtre par statut de connexion - « ce que j'ai connecté ou pas » (en tête). */}
        <div className="flex gap-1.5">
          <CatPill active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All <span className="tabular-nums opacity-60">{catalog.total}</span>
          </CatPill>
          <CatPill active={statusFilter === "connected"} onClick={() => setStatusFilter("connected")}>
            Connected <span className="tabular-nums opacity-60">{catalog.connected}</span>
          </CatPill>
          <CatPill active={statusFilter === "disconnected"} onClick={() => setStatusFilter("disconnected")}>
            Not connected <span className="tabular-nums opacity-60">{Math.max(0, catalog.total - catalog.connected)}</span>
          </CatPill>
        </div>

        {/* Recherche */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search connectors…"
            className="h-10 pl-9"
          />
        </div>

        {/* Filtres par catégorie */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide">
          <CatPill active={activeCat === "all"} onClick={() => setActiveCat("all")}>
            All <span className="tabular-nums opacity-60">{catalog.total}</span>
          </CatPill>
          {catalog.categories.map((g) => (
            <CatPill key={g.category} active={activeCat === g.category} onClick={() => setActiveCat(g.category)}>
              {g.label} <span className="tabular-nums opacity-60">{g.tools.length}</span>
            </CatPill>
          ))}
        </div>

        {/* Résumé */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500" /><span className="font-medium text-foreground">{catalog.connected}</span> connected</span>
          <span className="text-muted-foreground/40">·</span>
          <span><span className="font-medium text-foreground">{catalog.available}</span> available</span>
          <span className="text-muted-foreground/40">·</span>
          <span>{catalog.total} total</span>
        </div>

        {/* Grille */}
        {groups.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {statusFilter === "connected"
              ? "No integrations connected yet."
              : "No connector matches your search."}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.category} className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.tools.map((tool) => (
                  <ConnectorCard key={tool.key} tool={tool} onOpenDetail={() => setDetailTool(tool)} />
                ))}
              </div>
            </section>
          ))
        )}
        </>
        )}

        {dialogTool && (
          <ConnectorDialog
            slug={slug}
            tool={dialogTool}
            onClose={() => setDialogTool(null)}
            onChanged={refresh}
          />
        )}
      </div>
    </TooltipProvider>
  )
}

/** Tuile d'un connecteur - clic → fiche détaillée (façon Claude). Logo, état, description, capacités. */
function ConnectorCard({ tool, onOpenDetail }: Readonly<{ tool: ConnectorView; onOpenDetail: () => void }>) {
  const planned = tool.status === "PLANNED"

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDetail() } }}
      className={cn(
        "flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-foreground/20 hover:shadow-sm",
        planned && "opacity-80",
      )}
    >
      {/* Ligne haute : logo + état */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-2 text-[11px]">
          <BrandLogo slug={tool.key} name={tool.name} className="size-full" />
        </div>
        {tool.connected ? (
          <Badge variant="outline" className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-[10px] text-emerald-500">
            <Check className="size-3" /> Connected
          </Badge>
        ) : planned ? (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Soon</Badge>
        ) : (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{AUTH_LABEL[tool.authType] ?? tool.authType}</span>
        )}
      </div>

      {/* Nom + description */}
      <div className="flex-1">
        <span className="text-sm font-semibold text-foreground">{tool.name}</span>
        {tool.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>}
      </div>

      {/* Capacités - le badge « MCP-ready » (endpoint MCP hébergé officiel, connexion 1-clic) prime. */}
      <div className="flex min-w-0 flex-wrap gap-1">
        {tool.mcpSuggestedUrl && (
          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <Plug className="size-3" /> MCP-ready
          </span>
        )}
        {tool.capabilities.slice(0, 3).map((c) => (
          <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{CAP_LABEL[c] ?? c}</span>
        ))}
      </div>
    </div>
  )
}

/**
 * Fiche détaillée d'un connecteur (façon Claude) - infos honnêtes UNIQUEMENT : description, ce que
 * permet le connecteur (capacités), mode de connexion, catégorie et liens RÉELS (site officiel + docs).
 * Pas de listes d'outils/auteurs inventées pour les services qu'on n'intègre pas réellement.
 */
function ConnectorDetailView({
  tool, categoryLabel, onBack, onConnect,
}: Readonly<{ tool: ConnectorView; categoryLabel: string; onBack: () => void; onConnect: () => void }>) {
  const planned = tool.status === "PLANNED"

  return (
    <div className="flex flex-col gap-6">
      {/* Retour */}
      <button type="button" onClick={onBack} className="flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ChevronLeft className="size-4" /> Back
      </button>

      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted p-2">
            <BrandLogo slug={tool.key} name={tool.name} className="size-full" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">{tool.name}</h3>
              {tool.connected && (
                <Badge variant="outline" className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-[10px] text-emerald-500">
                  <Check className="size-3" /> Connected
                </Badge>
              )}
              {planned && <Badge variant="outline" className="text-[10px] text-muted-foreground">Soon</Badge>}
            </div>
            {tool.description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>}
          </div>
        </div>
        {!planned && (
          <Button size="sm" className="shrink-0 gap-1.5" variant={tool.connected ? "outline" : "default"} onClick={onConnect}>
            <Plug className="size-3.5" />
            {tool.connected ? (tool.authType === "OAUTH2" ? "Manage" : "Configure") : "Connect"}
          </Button>
        )}
      </div>

      {/* Ce que ça permet */}
      {tool.capabilities.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What this connector can do</h4>
          <ul className="flex flex-col gap-1.5">
            {tool.capabilities.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span><span className="font-medium">{CAP_LABEL[c] ?? c}</span>{CAP_DESC[c] ? ` - ${CAP_DESC[c]}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Connexion */}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connection</h4>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{AUTH_LABEL[tool.authType] ?? tool.authType}</span>
          {AUTH_HELP[tool.authType] ? ` - ${AUTH_HELP[tool.authType]}` : ""}
        </p>
        {tool.setupHint && (
          <div className="flex gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>{tool.setupHint}</span>
          </div>
        )}
      </section>

      {/* Catégorie */}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</h4>
        <Badge variant="secondary" className="w-fit font-normal">{categoryLabel}</Badge>
      </section>

      {/* Liens réels */}
      {(tool.websiteUrl || tool.docsUrl) && (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Links</h4>
          <div className="flex flex-wrap gap-2">
            {tool.websiteUrl && (
              <a href={tool.websiteUrl} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
                <Globe className="size-3.5" /> Official site <ExternalLink className="size-3 text-muted-foreground" />
              </a>
            )}
            {tool.docsUrl && (
              <a href={tool.docsUrl} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
                <BookOpen className="size-3.5" /> Documentation <ExternalLink className="size-3 text-muted-foreground" />
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * Dialog de connexion générique (formulaire piloté par `tool.fields`) + aide `setupHint`.
 * La connexion/sync est spécifique au connecteur (ici Plane) ; le formulaire, lui, est déclaratif.
 */
function ConnectorDialog({
  slug, tool, onClose, onChanged,
}: Readonly<{ slug: string; tool: ConnectorView; onClose: () => void; onChanged: () => void }>) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState<PlaneStatus | null>(null)
  const [projects, setProjects] = useState<PlaneProject[]>([])
  const [projectId, setProjectId] = useState("")
  const [syncing, setSyncing] = useState(false)

  const isPlane = tool.key === "plane"
  const connected = tool.connected || Boolean(status?.connected)

  // Connecteur « MCP-connectable » : on branche un serveur MCP externe (URL) → ses outils deviennent
  // live dans Cortex (lecture + actions validées). Prime sur le stockage d'identifiants opaque.
  const isMcp = tool.capabilities.includes("mcp")
  // « MCP-ready » : si l'outil a un serveur MCP distant hébergé officiel, on pré-remplit son URL
  // (éditable) → 1-clic. L'effet ci-dessous la remplace par l'URL réelle si déjà branché.
  const [mcpUrl, setMcpUrl] = useState(tool.mcpSuggestedUrl ?? "")
  const [mcpToken, setMcpToken] = useState("")
  const [mcpStatus, setMcpStatus] = useState<McpServerStatus | null>(null)
  const [mcpBusy, setMcpBusy] = useState(false)

  const loadConnected = useCallback(async () => {
    if (!isPlane) return
    try {
      const [st, pr] = await Promise.all([getPlaneStatus(slug), listPlaneProjects(slug)])
      setStatus(st)
      setProjects(pr)
      setProjectId((prev) => prev || pr[0]?.id || "")
    } catch { /* pas encore connecté */ }
  }, [isPlane, slug])

  useEffect(() => { if (tool.connected) loadConnected() }, [tool.connected, loadConnected])

  // Statut du serveur MCP de ce connecteur (si déjà branché) - à l'ouverture.
  useEffect(() => {
    if (!isMcp) return
    getMcpServers(slug)
      .then((list) => {
        const s = list.find((x) => x.connectorKey === tool.key) ?? null
        setMcpStatus(s)
        if (s) setMcpUrl(s.url)
      })
      .catch(() => { /* pas branché, ou plan sans intégrations */ })
  }, [isMcp, slug, tool.key])

  async function handleMcpConnect() {
    if (!mcpUrl.trim()) return
    setMcpBusy(true)
    try {
      const list = await connectMcpServer(slug, {
        connectorKey: tool.key,
        mcpUrl: mcpUrl.trim(),
        mcpToken: mcpToken.trim() || undefined,
      })
      const s = list.find((x) => x.connectorKey === tool.key) ?? null
      setMcpStatus(s)
      if (s?.reachable) toast.success(`${tool.name}: ${s.tools.length} tool(s) live in Cortex`)
      else toast.error("Connected, but the MCP server is unreachable")
      onChanged()
    } catch {
      toast.error("MCP connection failed - check the server URL")
    } finally {
      setMcpBusy(false)
    }
  }

  async function handleMcpDisconnect() {
    setMcpBusy(true)
    try {
      await disconnectMcpServer(slug, tool.key)
      setMcpStatus(null)
      setMcpUrl(""); setMcpToken("")
      toast.success(`${tool.name} MCP server disconnected`)
      onChanged()
    } catch {
      toast.error("Could not disconnect")
    } finally {
      setMcpBusy(false)
    }
  }

  async function handleConnect() {
    setConnecting(true)
    try {
      if (isPlane) {
        await connectPlane(slug, { apiKey: form.apiKey ?? "", planeWorkspace: form.planeWorkspace ?? "" })
        await loadConnected()
      } else {
        // Connecteur générique : identifiants stockés chiffrés côté back.
        await connectConnector(slug, tool.key, form)
      }
      toast.success(`${tool.name} connected`)
      onChanged()
      if (!isPlane) onClose()
    } catch {
      toast.error("Connection failed - check the details you entered")
    } finally {
      setConnecting(false)
    }
  }

  async function handleSync() {
    if (!projectId) return
    setSyncing(true)
    try {
      const r = await syncPlane(slug, projectId)
      toast.success(`Synced: ${r.created} created, ${r.updated} updated`)
      await loadConnected()
      onChanged()
    } catch {
      toast.error("Sync failed")
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    try {
      if (isPlane) await disconnectPlane(slug)
      else await disconnectConnector(slug, tool.key)
      toast.success(`${tool.name} disconnected`)
      onChanged()
      onClose()
    } catch {
      toast.error("Could not disconnect")
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tool.name}</DialogTitle>
        </DialogHeader>

        {/* Aide : où récupérer la clé */}
        {tool.setupHint && (
          <div className="flex gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {tool.setupHint}
              {tool.docsUrl && (
                <>
                  {" "}
                  <a href={tool.docsUrl} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-2">
                    Docs <ExternalLink className="size-3" />
                  </a>
                </>
              )}
            </span>
          </div>
        )}

        {isMcp ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 rounded-md border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
              <Server className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>
                Plug <span className="font-medium text-foreground">{tool.name}</span>&apos;s MCP server. Its tools go
                live in Cortex: reads run directly, writes are proposed and executed only after your approval.
              </span>
            </div>

            {mcpStatus ? (
              <>
                {mcpStatus.reachable ? (
                  <div className="flex flex-col gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Check className="size-4 shrink-0" /> Connected - {mcpStatus.tools.length} tool(s) live in Cortex
                    </span>
                    {mcpStatus.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {mcpStatus.tools.slice(0, 8).map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px]">
                            <Wrench className="size-3" /> {t}
                          </span>
                        ))}
                        {mcpStatus.tools.length > 8 && <span className="text-[11px]">+{mcpStatus.tools.length - 8} more</span>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>Server saved but <span className="font-medium">unreachable</span>{mcpStatus.error ? ` - ${mcpStatus.error}` : ""}.</span>
                  </div>
                )}
                <DialogFooter className="sm:justify-between">
                  <Button variant="outline" size="sm"
                          className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={handleMcpDisconnect} disabled={mcpBusy}>
                    Disconnect
                  </Button>
                  <span className="max-w-[55%] self-center truncate text-[11px] text-muted-foreground" title={mcpStatus.url}>
                    {mcpStatus.url}
                  </span>
                </DialogFooter>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">MCP server URL *</span>
                  <Input type="text" placeholder="https://.../mcp" value={mcpUrl}
                         onChange={(e) => setMcpUrl(e.target.value)} autoComplete="off" />
                  {tool.mcpSuggestedUrl ? (
                    <span className="text-[11px] text-muted-foreground/70">
                      Official hosted endpoint pre-filled - add your API token below to connect.
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/70">
                      Run this tool&apos;s MCP server, then paste its URL (a hosted endpoint or http://localhost:port).
                    </span>
                  )}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Access token (optional)</span>
                  <Input type="password" value={mcpToken}
                         onChange={(e) => setMcpToken(e.target.value)} autoComplete="off" />
                </label>
                <DialogFooter>
                  <Button onClick={handleMcpConnect} disabled={mcpBusy || !mcpUrl.trim()} className="gap-1.5">
                    {mcpBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
                    {mcpBusy ? "Connecting…" : "Connect MCP server"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </div>
        ) : !connected ? (
          <div className="flex flex-col gap-3">
            {tool.fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {f.label}{f.required && " *"}
                </span>
                <Input
                  type={f.secret ? "password" : "text"}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  autoComplete={f.secret ? "off" : undefined}
                />
              </label>
            ))}
            <DialogFooter>
              <Button onClick={handleConnect} disabled={connecting} className="gap-1.5">
                {connecting ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
                {connecting ? "Connecting…" : "Connect"}
              </Button>
            </DialogFooter>
          </div>
        ) : isPlane ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {status?.planeWorkspace && <>Workspace <span className="font-medium text-foreground">{status.planeWorkspace}</span> · </>}
              {status?.ingestedNodes ?? 0} item(s) ingested into the Brain OS.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Project to sync</span>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choose a project…" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <DialogFooter className="sm:justify-between">
              <Button variant="outline" size="sm"
                      className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={handleDisconnect}>
                Disconnect
              </Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSync} disabled={syncing || !projectId}>
                {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
                {syncing ? "Syncing…" : "Sync → Brain OS"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // Connecteur générique connecté : identifiants stockés (chiffrés). La sync par service viendra ensuite.
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="size-4 shrink-0" />
              <span><span className="font-medium">{tool.name}</span> is connected - credentials saved (encrypted).</span>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm"
                      className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={handleDisconnect}>
                Disconnect
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
