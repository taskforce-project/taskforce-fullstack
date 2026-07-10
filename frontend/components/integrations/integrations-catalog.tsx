"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Info, Loader2, ExternalLink, Check, Plug, Search } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BrandLogo } from "@/components/ui/brand-logo"
import { cn } from "@/lib/utils"
import { useIntegrationStore } from "@/lib/store/integration-store"
import {
  getIntegrationCatalog, getPlaneStatus, connectPlane, listPlaneProjects, syncPlane, disconnectPlane,
  type IntegrationCatalog, type ConnectorView, type PlaneProject, type PlaneStatus,
} from "@/lib/api/integration-service"

const CAP_LABEL: Record<string, string> = { observe: "Observe", act: "Agit", metrics: "Métriques" }
const AUTH_LABEL: Record<string, string> = { OAUTH2: "OAuth", API_KEY: "Clé API", TOKEN: "Token", CONFIG: "Config", NONE: "Sans auth" }

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
  const [dialogTool, setDialogTool] = useState<ConnectorView | null>(null)
  const [query, setQuery] = useState("")
  const [activeCat, setActiveCat] = useState<string>("all")
  const { connectGitHub, connectSlack } = useIntegrationStore()

  const refresh = useCallback(() => {
    getIntegrationCatalog(slug)
      .then(setCatalog)
      .catch(() => toast.error("Impossible de charger le catalogue d'intégrations"))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => { refresh() }, [refresh])

  async function handleAction(tool: ConnectorView) {
    if (tool.status !== "AVAILABLE") return
    // OAuth = 1 clic (redirection). Clé/config = dialog avec formulaire + aide.
    if (tool.authType === "OAUTH2" && !tool.connected) {
      try {
        if (tool.key === "github") await connectGitHub(slug)
        else if (tool.key === "slack") await connectSlack(slug)
      } catch {
        toast.error(`Impossible de démarrer la connexion ${tool.name}`)
      }
      return
    }
    setDialogTool(tool)
  }

  // Filtrage recherche + catégorie (marketplace) — catégories vides masquées.
  const groups = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    return catalog.categories
      .filter((g) => activeCat === "all" || g.category === activeCat)
      .map((g) => ({
        ...g,
        tools: q
          ? g.tools.filter((t) => t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q))
          : g.tools,
      }))
      .filter((g) => g.tools.length > 0)
  }, [catalog, query, activeCat])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  if (!catalog) return null

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-5">
        {/* Recherche */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un connecteur…"
            className="h-10 pl-9"
          />
        </div>

        {/* Filtres par catégorie */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide">
          <CatPill active={activeCat === "all"} onClick={() => setActiveCat("all")}>
            Tous <span className="tabular-nums opacity-60">{catalog.total}</span>
          </CatPill>
          {catalog.categories.map((g) => (
            <CatPill key={g.category} active={activeCat === g.category} onClick={() => setActiveCat(g.category)}>
              {g.label} <span className="tabular-nums opacity-60">{g.tools.length}</span>
            </CatPill>
          ))}
        </div>

        {/* Résumé */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500" /><span className="font-medium text-foreground">{catalog.connected}</span> connecté(s)</span>
          <span className="text-muted-foreground/40">·</span>
          <span><span className="font-medium text-foreground">{catalog.available}</span> disponible(s)</span>
          <span className="text-muted-foreground/40">·</span>
          <span>{catalog.total} au total</span>
        </div>

        {/* Grille */}
        {groups.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Aucun connecteur ne correspond à ta recherche.</p>
        ) : (
          groups.map((group) => (
            <section key={group.category} className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.tools.map((tool) => (
                  <ConnectorCard key={tool.key} tool={tool} onAction={() => handleAction(tool)} />
                ))}
              </div>
            </section>
          ))
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

/** Tuile d'un connecteur — façon marketplace (logo, description, capacités, action). */
function ConnectorCard({ tool, onAction }: Readonly<{ tool: ConnectorView; onAction: () => void }>) {
  const planned = tool.status === "PLANNED"

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all",
        planned ? "opacity-70" : "hover:border-foreground/20 hover:shadow-sm",
      )}
    >
      {/* Ligne haute : logo + état */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-2 text-[11px]">
          <BrandLogo slug={tool.key} name={tool.name} className="size-full" />
        </div>
        {tool.connected ? (
          <Badge variant="outline" className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-[10px] text-emerald-500">
            <Check className="size-3" /> Connecté
          </Badge>
        ) : planned ? (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Bientôt</Badge>
        ) : (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{AUTH_LABEL[tool.authType] ?? tool.authType}</span>
        )}
      </div>

      {/* Nom + description */}
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">{tool.name}</span>
          {tool.setupHint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground/50 hover:text-foreground" aria-label="Aide à la connexion">
                  <Info className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">{tool.setupHint}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {tool.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>}
      </div>

      {/* Ligne basse : capacités + action */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          {tool.capabilities.slice(0, 3).map((c) => (
            <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{CAP_LABEL[c] ?? c}</span>
          ))}
        </div>
        {!planned && (
          tool.connected ? (
            <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={onAction}>
              {tool.authType === "OAUTH2" ? "Gérer" : "Configurer"}
            </Button>
          ) : (
            <Button size="sm" className="h-7 shrink-0 gap-1 text-xs" onClick={onAction}>
              <Plug className="size-3" /> Connecter
            </Button>
          )
        )}
      </div>
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

  async function handleConnect() {
    setConnecting(true)
    try {
      await connectPlane(slug, { apiKey: form.apiKey ?? "", planeWorkspace: form.planeWorkspace ?? "" })
      toast.success(`${tool.name} connecté`)
      await loadConnected()
      onChanged()
    } catch {
      toast.error("Connexion échouée — vérifie la clé API et le slug du workspace")
    } finally {
      setConnecting(false)
    }
  }

  async function handleSync() {
    if (!projectId) return
    setSyncing(true)
    try {
      const r = await syncPlane(slug, projectId)
      toast.success(`Synchronisé : ${r.created} créé(s), ${r.updated} mis à jour`)
      await loadConnected()
      onChanged()
    } catch {
      toast.error("Synchronisation échouée")
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectPlane(slug)
      toast.success(`${tool.name} déconnecté`)
      onChanged()
      onClose()
    } catch {
      toast.error("Impossible de déconnecter")
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

        {!connected ? (
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
                {connecting ? "Connexion…" : "Connecter"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {status?.planeWorkspace && <>Workspace <span className="font-medium text-foreground">{status.planeWorkspace}</span> · </>}
              {status?.ingestedNodes ?? 0} élément(s) ingéré(s) dans le Brain OS.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Projet à synchroniser</span>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choisir un projet…" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <DialogFooter className="sm:justify-between">
              <Button variant="outline" size="sm"
                      className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={handleDisconnect}>
                Déconnecter
              </Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSync} disabled={syncing || !projectId}>
                {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
                {syncing ? "Synchronisation…" : "Synchroniser → Brain OS"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
