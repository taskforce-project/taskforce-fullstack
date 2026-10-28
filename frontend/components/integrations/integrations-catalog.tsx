"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Info, Loader2, ExternalLink, Check, Plug, Search, ChevronLeft, Globe, BookOpen, Server, Wrench, AlertTriangle, Terminal, Plus } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { IS_DESKTOP } from "@/lib/desktop"
import { getErrorMessage } from "@/lib/api/client"
import { useIntegrationStore } from "@/lib/store/integration-store"
import {
  getIntegrationCatalog, getPlaneStatus, connectPlane, listPlaneProjects, syncPlane, disconnectPlane,
  getMcpServers, connectMcpServer, disconnectMcpServer, startMcpOAuth,
  CUSTOM_MCP_CATEGORY, NEW_CUSTOM_MCP_KEY,
  type IntegrationCatalog, type ConnectorView, type PlaneProject, type PlaneStatus, type McpServerStatus,
} from "@/lib/api/integration-service"
import { McpActionConsole } from "@/components/integrations/mcp-action-console"
import { DisconnectConfirmDialog, DISCONNECT_CONSEQUENCES } from "@/components/integrations/disconnect-confirm-dialog"

const CAP_LABEL: Record<string, string> = { observe: "Observe", act: "Act", mcp: "MCP" }
const CAP_DESC: Record<string, string> = {
  observe: "Reads this service's data into TaskForce.",
  act: "Acts in the service from TaskForce.",
  mcp: "Its tools go live in Cortex: reads run directly, a change waits for the approval of an owner or admin.",
}
const AUTH_LABEL: Record<ConnectorView["authType"], string> = { OAUTH2: "OAuth", API_KEY: "API key", MCP: "MCP" }
const AUTH_HELP: Record<ConnectorView["authType"], string> = {
  OAUTH2: "One click: you are redirected to the service to authorize access.",
  API_KEY: "Connect with an API key.",
  MCP: "Through its MCP server: OAuth in one click, an access token, or a custom header.",
}

/** Fiche vide d'un serveur MCP ajouté à la main : le backend dérive sa clé `custom-<slug>` du nom saisi. */
const NEW_CUSTOM_SERVER: ConnectorView = {
  key: NEW_CUSTOM_MCP_KEY, name: "", category: CUSTOM_MCP_CATEGORY, authType: "MCP", connected: false,
  fields: [], capabilities: ["mcp"], description: null, docsUrl: null, setupHint: null, websiteUrl: null,
  mcpSuggestedUrl: null,
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

/**
 * App desktop : la connexion de GitHub et de Slack par OAuth n'y marche pas encore (PC-060) ; on ne montre que ce qui
 * marche (R12). Masqués avec revue au 30/11/2026 ; d'ici là, GitHub passe par le GitHub CLI de la personne.
 */
const DESKTOP_HIDDEN_CONNECTORS = new Set(["github", "slack"])

/** Le catalogue tel que l'app peut le tenir : sans les connecteurs masqués, comptes recalculés. */
export function catalogForThisApp(catalog: IntegrationCatalog, desktop: boolean = IS_DESKTOP): IntegrationCatalog {
  if (!desktop) return catalog
  const categories = catalog.categories
    .map((g) => ({ ...g, tools: g.tools.filter((t) => !DESKTOP_HIDDEN_CONNECTORS.has(t.key)) }))
    .filter((g) => g.tools.length > 0)
  const tools = categories.flatMap((g) => g.tools)
  return { ...catalog, categories, total: tools.length, connected: tools.filter((t) => t.connected).length }
}

/**
 * Le catalogue des intégrations (ADR-020) : GitHub, Slack et Plane en natif, les serveurs MCP officiels en
 * préréglage, et tout autre serveur MCP ajouté à la main (« Connect an MCP server »).
 */
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
  // Une déconnexion GitHub ou Slack faite ailleurs (sections de Settings) incrémente ce compteur.
  const changes = useIntegrationStore((s) => s.changes)

  const refresh = useCallback(() => {
    setLoading(true)
    setError(false)
    getIntegrationCatalog(slug)
      .then((loaded) => {
        const c = catalogForThisApp(loaded)
        setCatalog(c)
        setError(false)
        // Garde la fiche ouverte à jour (ex. état « connecté » après connexion) ; un serveur déconnecté
        // disparaît du catalogue, sa fiche se ferme.
        setDetailTool((prev) => prev
          ? c.categories.flatMap((g) => g.tools).find((t) => t.key === prev.key) ?? null
          : null)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => { refresh() }, [refresh, changes])

  async function handleAction(tool: ConnectorView) {
    // GitHub / Slack non connectés : OAuth 1-clic dédié (redirection). Le reste ouvre le dialogue.
    if (!tool.connected && (tool.key === "github" || tool.key === "slack")) {
      try {
        if (tool.key === "github") await connectGitHub(slug)
        else await connectSlack(slug)
      } catch (e) {
        toast.error(getErrorMessage(e))
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

  if (loading && !catalog) {
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
        <p className="text-xs text-muted-foreground">
          Pick an official MCP server below or connect your own. Its tools then go live in Cortex: reads run
          directly, a change waits for the approval of an owner or admin.
        </p>

        {/* Filtre par statut de connexion, et l'ajout d'un serveur MCP hors catalogue. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogTool(NEW_CUSTOM_SERVER)}>
            <Plus className="size-3.5" /> Connect an MCP server
          </Button>
        </div>

        {/* Recherche */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations…"
            className="h-control-lg pl-9"
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

        {/* Grille */}
        {groups.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {statusFilter === "connected"
              ? "No integrations connected yet."
              : "No integration matches your search. If the tool has an MCP server, connect it with Connect an MCP server."}
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

/** Capacités affichées : lecture et actions natives ; un serveur MCP est déjà dit par son mode de connexion. */
function shownCapabilities(tool: ConnectorView): string[] {
  return tool.capabilities.filter((c) => c !== "mcp")
}

/** Tuile d'un connecteur - clic → fiche détaillée. Logo, état, description, capacités. */
function ConnectorCard({ tool, onOpenDetail }: Readonly<{ tool: ConnectorView; onOpenDetail: () => void }>) {
  const caps = shownCapabilities(tool)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDetail() } }}
      className="flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-foreground/20 hover:shadow-sm"
    >
      {/* Ligne haute : logo + état */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-2 text-[11px]">
          <BrandLogo slug={tool.key} name={tool.name} className="size-full" />
        </div>
        {tool.connected ? (
          <Badge variant="outline" className="gap-1 border-shape-green/25 bg-shape-green/10 text-[10px] text-ink-green">
            <Check className="size-3" /> Connected
          </Badge>
        ) : (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{AUTH_LABEL[tool.authType]}</span>
        )}
      </div>

      {/* Nom + description */}
      <div className="flex-1">
        <span className="text-sm font-semibold text-foreground">{tool.name}</span>
        {tool.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>}
      </div>

      {caps.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-1">
          {caps.map((c) => (
            <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{CAP_LABEL[c] ?? c}</span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Fiche détaillée d'un connecteur - infos réelles uniquement : description, ce que permet le connecteur,
 * mode de connexion, catégorie et liens officiels.
 */
function ConnectorDetailView({
  tool, categoryLabel, onBack, onConnect,
}: Readonly<{ tool: ConnectorView; categoryLabel: string; onBack: () => void; onConnect: () => void }>) {
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
                <Badge variant="outline" className="gap-1 border-shape-green/25 bg-shape-green/10 text-[10px] text-ink-green">
                  <Check className="size-3" /> Connected
                </Badge>
              )}
            </div>
            {tool.description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>}
          </div>
        </div>
        <Button size="sm" className="shrink-0 gap-1.5" variant={tool.connected ? "outline" : "default"} onClick={onConnect}>
          <Plug className="size-3.5" />
          {tool.connected ? "Manage" : "Connect"}
        </Button>
      </div>

      {/* Ce que ça permet */}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What this integration can do</h4>
        <ul className="flex flex-col gap-1.5">
          {tool.capabilities.map((c) => (
            <li key={c} className="flex items-start gap-2 text-sm text-foreground">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
              <span><span className="font-medium">{CAP_LABEL[c] ?? c}</span>{CAP_DESC[c] ? `: ${CAP_DESC[c]}` : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Connexion */}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connection</h4>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{AUTH_LABEL[tool.authType]}</span>
          {`: ${AUTH_HELP[tool.authType]}`}
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

/** Dialogue de connexion : natives (GitHub, Slack, Plane) et serveurs MCP (préréglage ou ajouté à la main). */
function ConnectorDialog({
  slug, tool, onClose, onChanged,
}: Readonly<{ slug: string; tool: ConnectorView; onClose: () => void; onChanged: () => void }>) {
  const isNew = tool.key === NEW_CUSTOM_MCP_KEY
  // Plus large quand la console d'actions d'un serveur MCP est dépliée.
  const [wide, setWide] = useState(false)
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className={cn("sm:max-w-md", wide && "sm:max-w-2xl")}>
        <DialogHeader>
          <DialogTitle>{isNew ? "Connect an MCP server" : tool.name}</DialogTitle>
        </DialogHeader>
        {tool.authType === "MCP" ? (
          <McpServerForm slug={slug} tool={tool} onClose={onClose} onChanged={onChanged} onWide={setWide} />
        ) : tool.key === "plane" ? (
          <PlaneForm slug={slug} tool={tool} onClose={onClose} onChanged={onChanged} />
        ) : (
          <NativeOAuthPanel slug={slug} tool={tool} onClose={onClose} onChanged={onChanged} />
        )}
      </DialogContent>
    </Dialog>
  )
}

type PanelProps = Readonly<{ slug: string; tool: ConnectorView; onClose: () => void; onChanged: () => void }>

/**
 * GitHub ou Slack connecté : état et déconnexion par leur propre route (pas une connexion MCP). La déconnexion
 * passe par le store, qui fait relire le catalogue.
 */
function NativeOAuthPanel({ slug, tool, onClose }: PanelProps) {
  const { disconnectGitHub, disconnectSlack } = useIntegrationStore()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleDisconnect() {
    setBusy(true)
    try {
      if (tool.key === "github") await disconnectGitHub(slug)
      else await disconnectSlack(slug)
      toast.success(`${tool.name} disconnected`)
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-md border border-shape-green/25 bg-shape-green/10 p-3 text-xs text-ink-green">
        <Check className="size-4 shrink-0" />
        <span><span className="font-medium">{tool.name}</span> is connected for this workspace.</span>
      </div>
      {tool.key === "github" && (
        <p className="text-xs text-muted-foreground">Each project links its repository in its own settings (Integrations, Code repository).</p>
      )}
      <DialogFooter>
        <Button variant="outline" size="sm"
                className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setConfirming(true)} disabled={busy}>
          {busy && <Loader2 className="size-3.5 animate-spin" />} Disconnect
        </Button>
      </DialogFooter>
      <DisconnectConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        name={tool.name}
        consequence={DISCONNECT_CONSEQUENCES[tool.key === "github" ? "github" : "slack"]}
        onConfirm={() => { setConfirming(false); handleDisconnect() }}
      />
    </div>
  )
}

/** Plane : clé API et slug de workspace, puis synchronisation d'un projet dans le Brain OS. */
function PlaneForm({ slug, tool, onClose, onChanged }: PanelProps) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState<PlaneStatus | null>(null)
  const [projects, setProjects] = useState<PlaneProject[]>([])
  const [projectId, setProjectId] = useState("")
  const [syncing, setSyncing] = useState(false)
  const connected = tool.connected || Boolean(status?.connected)

  const loadConnected = useCallback(async () => {
    try {
      const [st, pr] = await Promise.all([getPlaneStatus(slug), listPlaneProjects(slug)])
      setStatus(st)
      setProjects(pr)
      setProjectId((prev) => prev || pr[0]?.id || "")
    } catch { /* pas encore connecté */ }
  }, [slug])

  useEffect(() => { if (tool.connected) loadConnected() }, [tool.connected, loadConnected])

  async function handleConnect() {
    setConnecting(true)
    try {
      await connectPlane(slug, { apiKey: form.apiKey ?? "", planeWorkspace: form.planeWorkspace ?? "" })
      await loadConnected()
      toast.success(`${tool.name} connected`)
      onChanged()
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
      await disconnectPlane(slug)
      toast.success(`${tool.name} disconnected`)
      onChanged()
      onClose()
    } catch {
      toast.error("Could not disconnect")
    }
  }

  if (!connected) {
    return (
      <div className="flex flex-col gap-3">
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
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {status?.planeWorkspace && <>Workspace <span className="font-medium text-foreground">{status.planeWorkspace}</span> · </>}
        {status?.ingestedNodes ?? 0} item(s) ingested into the Brain OS.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Project to sync</span>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="h-control"><SelectValue placeholder="Choose a project…" /></SelectTrigger>
          <SelectContent position="popper">
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
          {syncing ? "Syncing…" : "Sync to the Brain OS"}
        </Button>
      </DialogFooter>
    </div>
  )
}

/**
 * Serveur MCP : préréglage (URL officielle préremplie) ou serveur ajouté à la main (nom obligatoire). OAuth en
 * un clic, ou jeton envoyé en `Authorization: Bearer` ou dans un en-tête choisi. Une fois connecté : outils
 * exposés, console d'actions, déconnexion.
 */
function McpServerForm({
  slug, tool, onClose, onChanged, onWide,
}: PanelProps & Readonly<{ onWide: (wide: boolean) => void }>) {
  const isNew = tool.key === NEW_CUSTOM_MCP_KEY
  const isCustom = tool.category === CUSTOM_MCP_CATEGORY
  const [name, setName] = useState(isNew ? "" : tool.name)
  const [mcpUrl, setMcpUrl] = useState(tool.mcpSuggestedUrl ?? "")
  const [authMode, setAuthMode] = useState<"bearer" | "header">("bearer")
  const [headerName, setHeaderName] = useState("")
  const [mcpToken, setMcpToken] = useState("")
  const [status, setStatus] = useState<McpServerStatus | null>(null)
  const [busy, setBusy] = useState(false)
  // Console d'actions (TF-MCP-06) : dépliée sous le statut d'un serveur joignable.
  const [showConsole, setShowConsole] = useState(false)

  // Statut du serveur s'il est déjà branché (un nouveau serveur n'en a pas encore).
  useEffect(() => {
    if (isNew) return
    getMcpServers(slug)
      .then((list) => {
        const s = list.find((x) => x.connectorKey === tool.key) ?? null
        setStatus(s)
        if (s) setMcpUrl(s.url)
      })
      .catch(() => { /* pas branché */ })
  }, [isNew, slug, tool.key])

  function toggleConsole() {
    const next = !showConsole
    setShowConsole(next)
    onWide(next)
  }

  const nameMissing = isCustom && !name.trim()
  const headerMissing = authMode === "header" && (!headerName.trim() || !mcpToken.trim())
  const canSubmit = !busy && Boolean(mcpUrl.trim()) && !nameMissing

  async function handleConnect() {
    setBusy(true)
    try {
      const list = await connectMcpServer(slug, {
        connectorKey: tool.key,
        name: isCustom ? name.trim() : undefined,
        mcpUrl: mcpUrl.trim(),
        mcpToken: mcpToken.trim() || undefined,
        headerName: authMode === "header" ? headerName.trim() : undefined,
      })
      const s = isNew
        ? list.find((x) => x.name === name.trim() && x.url === mcpUrl.trim()) ?? null
        : list.find((x) => x.connectorKey === tool.key) ?? null
      const label = isCustom ? name.trim() : tool.name
      if (s?.reachable) toast.success(`${label}: ${s.tools.length} tool(s) live in Cortex`)
      else toast.error(`${label} is saved, but the server can't be reached${s?.error ? `: ${s.error}` : ""}`)
      onChanged()
      // Un nouveau serveur prend sa clé définitive côté serveur : sa carte apparaît au catalogue.
      if (isNew) onClose()
      else setStatus(s)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleOAuth() {
    setBusy(true)
    try {
      const authorizeUrl = await startMcpOAuth(slug, tool.key, mcpUrl.trim(), undefined, isCustom ? name.trim() : undefined)
      window.location.href = authorizeUrl // redirection vers le consentement du service (la page quitte)
    } catch (e) {
      toast.error(getErrorMessage(e))
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    setBusy(true)
    try {
      await disconnectMcpServer(slug, tool.key)
      setStatus(null)
      setMcpUrl(tool.mcpSuggestedUrl ?? ""); setMcpToken("")
      toast.success(`${tool.name} disconnected`)
      onChanged()
      if (isCustom) onClose()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (status) {
    return (
      <div className="flex flex-col gap-3">
        {status.reachable ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-shape-green/25 bg-shape-green/10 p-3 text-xs text-ink-green">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Check className="size-4 shrink-0" /> Connected, {status.tools.length} tool(s) available
              </span>
              {status.tools.length > 0 && (
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={toggleConsole}>
                  <Terminal className="size-3" /> {showConsole ? "Hide actions" : "Run an action"}
                </Button>
              )}
            </div>
            {showConsole ? (
              <McpActionConsole slug={slug} connectorKey={tool.key} connectorName={tool.name} />
            ) : status.tools.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {status.tools.slice(0, 8).map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded bg-shape-green/15 px-1.5 py-0.5 text-[11px] text-ink-green">
                    <Wrench className="size-3" /> {t}
                  </span>
                ))}
                {status.tools.length > 8 && <span className="self-center text-[11px] text-muted-foreground">+{status.tools.length - 8} more</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-shape-yellow/25 bg-shape-yellow/10 p-3 text-xs text-ink-yellow">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>Server saved but <span className="font-medium">unreachable</span>{status.error ? `: ${status.error}` : ""}.</span>
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" size="sm"
                  className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={handleDisconnect} disabled={busy}>
            Disconnect
          </Button>
          <span className="max-w-[55%] self-center truncate text-[11px] text-muted-foreground" title={status.url}>
            {status.url}
          </span>
        </DialogFooter>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 rounded-md border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
        <Server className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span>
          {isNew ? "Any tool with an MCP server" : <><span className="font-medium text-foreground">{tool.name}</span>&apos;s MCP server</>}
          : its tools go live in Cortex. Reads run directly, a change waits for the approval of an owner or admin.
        </span>
      </div>

      {isCustom && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Name *</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Team docs" autoComplete="off" />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">MCP server URL *</span>
        <Input type="text" placeholder="https://.../mcp" value={mcpUrl}
               onChange={(e) => setMcpUrl(e.target.value)} autoComplete="off" />
        <span className="text-[11px] text-muted-foreground/70">
          {tool.mcpSuggestedUrl ? "Official server, prefilled." : "The address of the server (Streamable HTTP)."}
        </span>
      </label>

      {/* 1-clic : OAuth (découverte + DCR + PKCE), aucun jeton à coller. */}
      <Button onClick={handleOAuth} disabled={!canSubmit} className="gap-1.5">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Server className="size-3.5" />}
        Connect with OAuth
      </Button>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
        <span className="h-px flex-1 bg-border" /> or with a token <span className="h-px flex-1 bg-border" />
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Send the token as</span>
        <Select value={authMode} onValueChange={(v) => setAuthMode(v as "bearer" | "header")}>
          <SelectTrigger className="h-control"><SelectValue /></SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="bearer">Authorization: Bearer</SelectItem>
            <SelectItem value="header">A custom header</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {authMode === "header" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Header name *</span>
          <Input value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="X-API-Key" autoComplete="off" />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {authMode === "header" ? "Header value *" : "Access token (optional)"}
        </span>
        <Input type="password" value={mcpToken} onChange={(e) => setMcpToken(e.target.value)} autoComplete="off" />
      </label>
      <DialogFooter>
        <Button variant="outline" onClick={handleConnect} disabled={!canSubmit || headerMissing} className="gap-1.5">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
          Connect
        </Button>
      </DialogFooter>
    </div>
  )
}
