"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Info, Loader2, ExternalLink, Check, Plug, Search, ChevronLeft, Globe, BookOpen } from "lucide-react"
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
  type IntegrationCatalog, type ConnectorView, type PlaneProject, type PlaneStatus,
} from "@/lib/api/integration-service"

const CAP_LABEL: Record<string, string> = { observe: "Observe", act: "Agit", metrics: "Métriques", recommend: "Composants" }
const CAP_DESC: Record<string, string> = {
  observe: "Alimente le Brain OS avec les données du service (lecture).",
  act: "Peut agir dans le service depuis TaskForce (écriture).",
  metrics: "Remonte des métriques et indicateurs.",
  recommend: "Recommandations de composants par Cortex (à venir).",
}
const AUTH_LABEL: Record<string, string> = { OAUTH2: "OAuth", API_KEY: "Clé API", TOKEN: "Token", CONFIG: "Config", NONE: "Sans auth" }
const AUTH_HELP: Record<string, string> = {
  OAUTH2: "Connexion via OAuth (redirection vers le service).",
  API_KEY: "Connexion par clé API.",
  TOKEN: "Connexion par token d'accès personnel.",
  CONFIG: "Connexion par endpoint + identifiants.",
  NONE: "Aucune authentification requise.",
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
  if (error || !catalog) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">Le catalogue d&apos;intégrations n&apos;a pas pu être chargé.</p>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
          <Loader2 className="size-3.5" /> Réessayer
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
          message="Intégrations : la plupart des connecteurs sont branchables (identifiants stockés), mais la synchronisation des données par outil n'est pas encore active. Quelques intégrations (UI & composants) sont sur la roadmap, affichées « Bientôt »."
        />
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

/** Tuile d'un connecteur — clic → fiche détaillée (façon Claude). Logo, état, description, capacités. */
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
        <span className="text-sm font-semibold text-foreground">{tool.name}</span>
        {tool.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>}
      </div>

      {/* Capacités */}
      <div className="flex min-w-0 flex-wrap gap-1">
        {tool.capabilities.slice(0, 3).map((c) => (
          <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{CAP_LABEL[c] ?? c}</span>
        ))}
      </div>
    </div>
  )
}

/**
 * Fiche détaillée d'un connecteur (façon Claude) — infos honnêtes UNIQUEMENT : description, ce que
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
        <ChevronLeft className="size-4" /> Retour
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
                  <Check className="size-3" /> Connecté
                </Badge>
              )}
              {planned && <Badge variant="outline" className="text-[10px] text-muted-foreground">Bientôt</Badge>}
            </div>
            {tool.description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>}
          </div>
        </div>
        {!planned && (
          <Button size="sm" className="shrink-0 gap-1.5" variant={tool.connected ? "outline" : "default"} onClick={onConnect}>
            <Plug className="size-3.5" />
            {tool.connected ? (tool.authType === "OAUTH2" ? "Gérer" : "Configurer") : "Connecter"}
          </Button>
        )}
      </div>

      {/* Ce que ça permet */}
      {tool.capabilities.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ce que ce connecteur permet</h4>
          <ul className="flex flex-col gap-1.5">
            {tool.capabilities.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span><span className="font-medium">{CAP_LABEL[c] ?? c}</span>{CAP_DESC[c] ? ` — ${CAP_DESC[c]}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Connexion */}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connexion</h4>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{AUTH_LABEL[tool.authType] ?? tool.authType}</span>
          {AUTH_HELP[tool.authType] ? ` — ${AUTH_HELP[tool.authType]}` : ""}
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
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Catégorie</h4>
        <Badge variant="secondary" className="w-fit font-normal">{categoryLabel}</Badge>
      </section>

      {/* Liens réels */}
      {(tool.websiteUrl || tool.docsUrl) && (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Liens</h4>
          <div className="flex flex-wrap gap-2">
            {tool.websiteUrl && (
              <a href={tool.websiteUrl} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
                <Globe className="size-3.5" /> Site officiel <ExternalLink className="size-3 text-muted-foreground" />
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
      if (isPlane) {
        await connectPlane(slug, { apiKey: form.apiKey ?? "", planeWorkspace: form.planeWorkspace ?? "" })
        await loadConnected()
      } else {
        // Connecteur générique : identifiants stockés chiffrés côté back.
        await connectConnector(slug, tool.key, form)
      }
      toast.success(`${tool.name} connecté`)
      onChanged()
      if (!isPlane) onClose()
    } catch {
      toast.error("Connexion échouée — vérifie les informations saisies")
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
      if (isPlane) await disconnectPlane(slug)
      else await disconnectConnector(slug, tool.key)
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
        ) : isPlane ? (
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
        ) : (
          // Connecteur générique connecté : identifiants stockés (chiffrés). La sync par service viendra ensuite.
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="size-4 shrink-0" />
              <span><span className="font-medium">{tool.name}</span> est connecté — identifiants enregistrés (chiffrés).</span>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm"
                      className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={handleDisconnect}>
                Déconnecter
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
