"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Info, Loader2, ExternalLink, Check, Plug, Search, ChevronLeft, ChevronRight, Globe, BookOpen, Server, Wrench, AlertTriangle, Terminal, Plus, RotateCw } from "lucide-react"
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
import { DesktopGitHubConnect } from "@/components/desktop/desktop-github-connect"
import { cn } from "@/lib/utils"
import { IS_DESKTOP, type DesktopToolsStatus } from "@/lib/desktop"
import { fillText } from "@/lib/delivery/result-card"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { useDesktopToolsStore } from "@/lib/store/desktop-tools-store"
import { useIntegrationStore } from "@/lib/store/integration-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import {
  getIntegrationCatalog, getPlaneStatus, connectPlane, listPlaneProjects, syncPlane, disconnectPlane,
  getMcpServers, connectMcpServer, disconnectMcpServer, startMcpOAuth,
  CUSTOM_MCP_CATEGORY, NEW_CUSTOM_MCP_KEY,
  type IntegrationCatalog, type ConnectorView, type PlaneProject, type PlaneStatus, type McpServerStatus,
} from "@/lib/api/integration-service"
import { McpActionConsole } from "@/components/integrations/mcp-action-console"
import { ConnectPanel, disconnectedSentence, FailureNote, pathLabel, pathSentence } from "@/components/integrations/connect-panel"
import { failureOf, type ConnectFailure } from "@/lib/integrations/connect-failure"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useUserStore } from "@/lib/store/user-store"
import { DisconnectConfirmDialog, DISCONNECT_CONSEQUENCES } from "@/components/integrations/disconnect-confirm-dialog"

/**
 * Une adresse sur la machine ou le réseau local (Docker Desktop, le serveur local de Figma) : l'accord se demande. Les
 * noms en `.local`, `.internal` et `.localhost` en sont, comme pour le serveur (`McpClient.isLocal`).
 */
const LOCAL_URL = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|[^./:]+(:|\/|$)|[^/:]+\.(local|internal|localhost)(:|\/|$))/i

/** Fiche vide d'un serveur MCP ajouté à la main : le backend dérive sa clé `custom-<slug>` du nom saisi. */
const NEW_CUSTOM_SERVER: ConnectorView = {
  key: NEW_CUSTOM_MCP_KEY, name: "", category: CUSTOM_MCP_CATEGORY, authType: "MCP", connected: false,
  fields: [], capabilities: ["mcp"], description: null, docsUrl: null, setupHint: null, websiteUrl: null,
  mcpSuggestedUrl: null,
}

/** Puce de filtre par catégorie (façon marketplace). */
/**
 * Le nombre d'une pastille : la couleur atténuée du thème, sans opacité par-dessus, pour tenir 4,5:1 dans les deux
 * thèmes, sur une pastille choisie comme sur les autres (R161).
 */
function PillCount({ children }: Readonly<{ children: React.ReactNode }>) {
  return <span className="font-normal tabular-nums text-muted-foreground">{children}</span>
}

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

/** GitHub sur cet ordinateur, tel que la coque le lit avec le GitHub CLI (`gh auth token`, `gh api user`). */
type DesktopGitHub = DesktopToolsStatus["github"]

type IntegrationTexts = (typeof CONSTANTS_EN)["integrations"]
type ConnectTexts = (typeof CONSTANTS_EN)["connect"]

/** Une intégration que l'app desktop ne sait pas encore connecter (PC-060) : elle se montre, avec son état, sans le geste. */
const laterOnDesktop = (tool: ConnectorView, desktop: boolean) => desktop && tool.key === "slack"

/** GitHub dans l'app desktop : par le GitHub CLI de la personne, pas par la connexion OAuth de l'espace. */
const throughGitHubCli = (tool: ConnectorView, desktop: boolean) => desktop && tool.key === "github"

/**
 * Le catalogue tel que l'app peut le tenir. La webapp le montre tel quel. L'app desktop montre aussi GitHub, Slack et
 * Plane à côté des préréglages essayés, avec leur état et une ligne sur ce qu'ils y font (rejeu de la 1.8.0,
 * 02/11/2026) : GitHub est connecté quand le GitHub CLI de la personne l'est sur cet ordinateur ; Slack, pas encore
 * connectable ici, garde l'état que le serveur lui connaît.
 */
export function catalogForThisApp(
  catalog: IntegrationCatalog,
  t: IntegrationTexts,
  desktop: boolean = IS_DESKTOP,
  github: DesktopGitHub | null = null,
): IntegrationCatalog {
  if (!desktop) return catalog
  const categories = catalog.categories.map((g) => ({
    ...g,
    tools: g.tools.map((tool): ConnectorView => {
      if (throughGitHubCli(tool, desktop)) {
        return { ...tool, connected: github?.signedIn === true, description: t.desktopGitHubLine, setupHint: null }
      }
      return laterOnDesktop(tool, desktop) ? { ...tool, description: t.desktopSlackLine, setupHint: null } : tool
    }),
  }))
  const tools = categories.flatMap((g) => g.tools)
  return { ...catalog, categories, total: tools.length, connected: tools.filter(isConnected).length }
}

/** Une carte est branchée quand l'un de ses accès l'est : la native, ou son second accès, les outils de Cortex (R160). */
export function isConnected(tool: ConnectorView): boolean {
  return tool.connected || Boolean(tool.live?.connected)
}

/**
 * Comment l'intégration se connecte dans cette app : le mot de la carte, la phrase simple de sa fiche (R160 : jamais
 * « OAuth » ni « MCP »), et si le geste existe ici.
 */
export function connectionOf(
  tool: ConnectorView,
  t: IntegrationTexts,
  desktop: boolean,
  c: ConnectTexts,
): { label: string; help: string; canConnect: boolean } {
  if (throughGitHubCli(tool, desktop)) return { label: t.githubCli, help: t.githubCliHelp, canConnect: true }
  if (laterOnDesktop(tool, desktop)) return { label: t.webAppOnly, help: t.slackDesktopHelp, canConnect: false }
  // Un préréglage dit son chemin en mots de la personne (séance n°22, R154) : un clic, l'administrateur d'abord, une clé.
  const path = pathLabel(tool, c)
  if (path) return { label: path, help: pathSentence(tool, c) ?? "", canConnect: !tool.blocked }
  // Une native : GitHub et Slack en un clic, Plane par une clé ; un serveur ajouté à la main, par son adresse.
  if (tool.authType === "OAUTH2") return { label: c.pathOneClick, help: fillText(c.pathSentence.oauth, { name: tool.name }), canConnect: true }
  if (tool.authType === "API_KEY") return { label: c.pathKey, help: fillText(c.pathSentence.key, { name: tool.name }), canConnect: true }
  return { label: c.pathAddress, help: c.pathSentence.custom, canConnect: true }
}

/**
 * L'accès dont la carte dit l'état (R160) : la native, sauf quand elle n'est pas branchée et que le second accès a une
 * connexion (branchée, à refaire, en attente) ; la carte dit alors son état, sa portée et son compte.
 */
export function shownAccess(tool: ConnectorView): ConnectorView {
  return !tool.connected && tool.live?.scope ? tool.live : tool
}

/** Le second accès est-il celui que la carte montre ? Ses mots le nomment alors : « Cortex connected ». */
const liveShown = (tool: ConnectorView) => shownAccess(tool) !== tool

/**
 * Le geste de la carte (R160) : « Connect » ouvre la connexion tout de suite, sans passer par la fiche ; « Manage » pour
 * un outil branché, « Set it up » quand l'étape de l'administrateur revient à la personne, « Reconnect » quand l'accès
 * montré doit se refaire ; null quand rien ne se connecte ici (un outil que l'éditeur ferme encore).
 */
export function cardAction(
  tool: ConnectorView, t: IntegrationTexts, desktop: boolean, c: ConnectTexts, manager = true,
): string | null {
  if (isConnected(tool)) return t.manage
  if (tool.blocked) return null
  const native = nativeConnects(tool, t, desktop, c, manager)
  if (!native && !tool.live) return null
  // La native que la personne ne connecte pas : la carte ouvre le second accès, le sien.
  const shown = !native && tool.live ? tool.live : shownAccess(tool)
  if (shown.state === "NEEDS_SETUP") return t.setUp
  if (shown.state === "NEEDS_RECONNECT") return c.reconnect
  // Un outil qui attend l'administrateur : le geste montre le message à lui envoyer (R161).
  if (shown.state === "WAITING_FOR_ADMIN") return c.seeWhatToSend
  return c.connect
}

/**
 * La personne connecte-t-elle elle-même cet outil ici ? Une native (GitHub, Slack, Plane) se connecte pour tout l'espace,
 * par un propriétaire ou un administrateur seulement ; un préréglage, par chacun, avec son propre compte.
 */
export function nativeConnects(tool: ConnectorView, t: IntegrationTexts, desktop: boolean, c: ConnectTexts, manager: boolean): boolean {
  return connectionOf(tool, t, desktop, c).canConnect && (manager || tool.authType === "MCP")
}

/**
 * Le chemin que la carte dit, à côté de son geste : celui de la native, ou, quand elle ne se connecte pas ici (Slack
 * dans l'app desktop), celui du second accès, que « Connect » ouvre (R160).
 */
export function cardPathLabel(tool: ConnectorView, t: IntegrationTexts, desktop: boolean, c: ConnectTexts, manager = true): string {
  const native = connectionOf(tool, t, desktop, c)
  return !nativeConnects(tool, t, desktop, c, manager) && tool.live ? connectionOf(tool.live, t, desktop, c).label : native.label
}

/** Le badge d'un outil branché : « Connected » pour sa native, « Cortex connected » quand seul le second accès l'est. */
export function connectedLabel(tool: ConnectorView, c: ConnectTexts): string {
  return tool.connected || !tool.live?.connected ? c.connected : c.liveConnected
}

/** Les filtres de la grille : la recherche, la catégorie choisie, et ce que la personne a connecté ou pas. */
export interface CatalogFilters {
  query: string
  category: string
  status: "all" | "connected" | "disconnected"
}

/** Le nombre d'outils qu'une catégorie montre d'abord, quand toutes les catégories s'affichent sans recherche. */
export const FOLDED_COUNT = 6

/**
 * Les catégories que la grille montre : filtrées par catégorie et par état, et par la recherche, qui lit le nom,
 * la description et l'intitulé de la catégorie (« finance » trouve tous les outils de la finance). Une catégorie vide
 * disparaît.
 */
export function filterCatalog(catalog: IntegrationCatalog, filters: CatalogFilters): IntegrationCatalog["categories"] {
  const q = filters.query.trim().toLowerCase()
  return catalog.categories
    .filter((g) => filters.category === "all" || g.category === filters.category)
    .map((g) => ({
      ...g,
      tools: g.tools
        .filter((tool) => filters.status === "all" || (filters.status === "connected" ? isConnected(tool) : !isConnected(tool)))
        // La description du second accès aussi : « channels » trouve Slack par ce que Cortex y lit (R160).
        .filter((tool) => !q || g.label.toLowerCase().includes(q) || tool.name.toLowerCase().includes(q)
          || (tool.description ?? "").toLowerCase().includes(q) || (tool.live?.description ?? "").toLowerCase().includes(q))
        // Ce qui se connecte d'abord ; un outil que l'éditeur ferme encore vient en dernier (tri stable).
        .sort((a, b) => Number(Boolean(a.blocked)) - Number(Boolean(b.blocked))),
    }))
    .filter((g) => g.tools.length > 0)
}

/**
 * Plus de cent outils (R153) : toutes catégories affichées, sans recherche ni filtre, chaque catégorie montre ses
 * premiers outils et un bouton pour le reste ; une recherche, une catégorie ou un filtre montre tout.
 */
export function folds(filters: CatalogFilters, count: number): boolean {
  return filters.category === "all" && !filters.query.trim() && filters.status === "all" && count > FOLDED_COUNT
}

/** L'état de la connexion que la personne utilise, sur la carte : branché, à reconnecter, en attente, ou le chemin. */
function CardState({ tool, manager }: Readonly<{ tool: ConnectorView; manager: boolean }>) {
  const t = usePreferencesStore((s) => s.t.integrations)
  const c = usePreferencesStore((s) => s.t.connect)
  // Un outil que l'éditeur ferme encore ne promet pas un chemin qu'il ne tient pas (R15).
  // Les petites étiquettes gardent le contraste du texte secondaire, 4,5:1 au moins (axe-core, R161).
  if (tool.blocked && !tool.connected) {
    return <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{c.notAvailable}</span>
  }
  // L'accès que la carte montre : la native, ou le second accès quand lui seul a une connexion (sa portée, son compte).
  const shown = shownAccess(tool)
  const live = liveShown(tool)
  const shared = shown.scope === "WORKSPACE" ? <span className="text-[10px] text-muted-foreground">{c.shared}</span> : null
  if (isConnected(tool)) {
    return (
      <span className="flex flex-col items-end gap-0.5">
        <Badge variant="outline" title={shown.accountLabel ? c.connectedAs.replace("{account}", shown.accountLabel) : undefined}
               className="gap-1 border-shape-green/25 bg-shape-green/10 text-[10px] text-ink-green">
          <Check className="size-3" /> {connectedLabel(tool, c)}
        </Badge>
        {shared}
      </span>
    )
  }
  if (shown.state === "NEEDS_RECONNECT" || shown.state === "WAITING_FOR_ADMIN") {
    const words = shown.state === "NEEDS_RECONNECT"
      ? (live ? c.liveNeedsReconnecting : c.needsReconnecting)
      : (live ? c.liveWaitingForAdmin : c.waitingForAdmin)
    return (
      <span className="flex flex-col items-end gap-0.5">
        <Badge variant="outline" className="gap-1 border-shape-yellow/25 bg-shape-yellow/10 text-[10px] text-ink-yellow">
          <AlertTriangle className="size-3" /> {words}
        </Badge>
        {shared}
      </span>
    )
  }
  return <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{cardPathLabel(tool, t, IS_DESKTOP, c, manager)}</span>
}

/**
 * Le catalogue des intégrations (ADR-020) : GitHub, Slack et Plane en natif, les serveurs MCP officiels en
 * préréglage, et tout autre serveur MCP ajouté à la main (« Connect an MCP server »).
 */
export function IntegrationsCatalog({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.integrations)
  const catalogText = usePreferencesStore((s) => s.t.catalog)
  const [loaded, setLoaded] = useState<IntegrationCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  // Le dialogue de connexion ouvert, par la clé de l'outil : il le relit dans le catalogue rafraîchi après chaque geste
  // (R160), comme la fiche. `live` : il s'ouvre sur le second accès (Cortex), quand la native ne se connecte pas ici.
  const [dialog, setDialog] = useState<{ key: string; live: boolean } | null>(null)
  // Connecteur affiché en fiche détaillée (clic sur une carte), par sa clé : la fiche suit le catalogue. null = grille.
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const connectTexts = usePreferencesStore((s) => s.t.connect)
  const [query, setQuery] = useState("")
  const [activeCat, setActiveCat] = useState<string>("all")
  // Filtre « ce que j'ai connecté ou pas » (en plus du filtre par catégorie).
  const [statusFilter, setStatusFilter] = useState<"all" | "connected" | "disconnected">("all")
  // Une déconnexion GitHub ou Slack faite ailleurs (sections de Settings) incrémente ce compteur.
  const changes = useIntegrationStore((s) => s.changes)
  // App desktop : GitHub est connecté quand le GitHub CLI de la personne l'est sur cet ordinateur.
  const desktopGitHub = useDesktopToolsStore((s) => s.status?.github ?? null)
  const refreshDesktopTools = useDesktopToolsStore((s) => s.refresh)
  // Propriétaire ou administrateur : il partage une source et saisit l'application de l'entreprise (R154).
  const members = useWorkspaceStore((s) => s.members)
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers)
  const me = useUserStore((s) => s.user)
  const manager = members.some((m) => String(m.userId) === String(me?.id) && (m.role === "OWNER" || m.role === "ADMIN"))
  useEffect(() => {
    if (members.length === 0) void fetchMembers().catch(() => undefined)
  }, [members.length, fetchMembers])

  useEffect(() => {
    if (IS_DESKTOP && useDesktopToolsStore.getState().status === null) void refreshDesktopTools()
  }, [refreshDesktopTools])

  const refresh = useCallback(() => {
    setLoading(true)
    setError(false)
    getIntegrationCatalog(slug)
      .then((c) => {
        setLoaded(c)
        setError(false)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => { refresh() }, [refresh, changes])
  // Retour du navigateur (l'app desktop ouvre celui du système) : la fenêtre reprend le focus, le catalogue se relit.
  useEffect(() => {
    const onFocus = () => refresh()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [refresh])

  const catalog = useMemo(
    () => (loaded ? catalogForThisApp(loaded, t, IS_DESKTOP, desktopGitHub) : null),
    [loaded, t, desktopGitHub],
  )
  // La fiche ouverte suit le catalogue (ex. « connecté » après connexion) ; un serveur déconnecté en disparaît, sa
  // fiche se ferme.
  const detailTool = useMemo(
    () => (detailKey && catalog ? catalog.categories.flatMap((g) => g.tools).find((tool) => tool.key === detailKey) ?? null : null),
    [detailKey, catalog],
  )
  // L'outil du dialogue, relu dans le catalogue à chaque rafraîchissement : après une connexion ou une déconnexion, le
  // panneau dit le nouvel état (R160). Un serveur ajouté qui disparaît du catalogue ferme son dialogue.
  const dialogTool = useMemo(() => {
    if (!dialog) return null
    if (dialog.key === NEW_CUSTOM_MCP_KEY) return NEW_CUSTOM_SERVER
    return catalog?.categories.flatMap((g) => g.tools).find((tool) => tool.key === dialog.key) ?? null
  }, [dialog, catalog])

  /** « Connect » depuis la carte ou la fiche : le panneau s'ouvre tout de suite (R160), sur le second accès quand la
   *  native ne se connecte pas ici (Slack dans l'app desktop). */
  function openConnection(tool: ConnectorView) {
    const nativeHere = nativeConnects(tool, t, IS_DESKTOP, connectTexts, manager)
    setDialog({ key: tool.key, live: Boolean(tool.live) && (!nativeHere || liveShown(tool)) })
  }

  // Filtrage recherche + catégorie (marketplace) - catégories vides masquées.
  const filters: CatalogFilters = useMemo(
    () => ({ query, category: activeCat, status: statusFilter }),
    [query, activeCat, statusFilter],
  )
  const groups = useMemo(() => (catalog ? filterCatalog(catalog, filters) : []), [catalog, filters])

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
        {/* Réessayer, pas « en cours » : l'icône d'un chargement disait le contraire du bouton (R161). */}
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
          <RotateCw className="size-3.5" aria-hidden="true" /> Retry
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
            manager={manager}
            onBack={() => setDetailKey(null)}
            onConnect={() => openConnection(detailTool)}
          />
        ) : (
        <>
        <p className="text-xs text-muted-foreground">{t.catalogIntro}</p>

        {/* Filtre par statut de connexion, et l'ajout d'un serveur MCP hors catalogue. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <CatPill active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
              All <PillCount>{catalog.total}</PillCount>
            </CatPill>
            <CatPill active={statusFilter === "connected"} onClick={() => setStatusFilter("connected")}>
              Connected <PillCount>{catalog.connected}</PillCount>
            </CatPill>
            <CatPill active={statusFilter === "disconnected"} onClick={() => setStatusFilter("disconnected")}>
              Not connected <PillCount>{Math.max(0, catalog.total - catalog.connected)}</PillCount>
            </CatPill>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog({ key: NEW_CUSTOM_MCP_KEY, live: false })}>
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

        {/* Filtres par catégorie : treize catégories, sur plusieurs lignes plutôt qu'un défilement caché. Une recherche
            dans tout le catalogue les efface : à 375 px, ses résultats tiennent dans le premier écran (R161). Une
            catégorie choisie les garde, pour qu'on voie ce qui filtre. */}
        {(!query.trim() || activeCat !== "all") && (
          <div className="flex flex-wrap gap-1.5">
            <CatPill active={activeCat === "all"} onClick={() => setActiveCat("all")}>
              All <PillCount>{catalog.total}</PillCount>
            </CatPill>
            {catalog.categories.map((g) => (
              <CatPill key={g.category} active={activeCat === g.category} onClick={() => setActiveCat(g.category)}>
                {g.label} <PillCount>{g.tools.length}</PillCount>
              </CatPill>
            ))}
          </div>
        )}

        {/* Grille */}
        {groups.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {statusFilter === "connected"
              ? "No integrations connected yet."
              : "No integration matches your search. If the tool has an MCP server, connect it with Connect an MCP server."}
          </p>
        ) : (
          groups.map((group) => {
            const folded = folds(filters, group.tools.length)
            return (
              <section key={group.category} className="flex flex-col gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {(folded ? group.tools.slice(0, FOLDED_COUNT) : group.tools).map((tool) => (
                    <ConnectorCard key={tool.key} tool={tool} manager={manager} onOpenDetail={() => setDetailKey(tool.key)}
                                   onConnect={() => openConnection(tool)} />
                  ))}
                </div>
                {folded && (
                  <Button variant="ghost" size="sm" className="w-fit gap-1 px-2 text-xs text-muted-foreground"
                          onClick={() => setActiveCat(group.category)}>
                    {fillText(catalogText.showAll, { count: String(group.tools.length), category: group.label })}
                    <ChevronRight className="size-3.5" />
                  </Button>
                )}
              </section>
            )
          })
        )}
        </>
        )}

        {dialog && dialogTool && (
          <ConnectorDialog
            key={dialog.key}
            slug={slug}
            tool={dialogTool}
            startLive={dialog.live}
            manager={manager}
            onClose={() => setDialog(null)}
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

/**
 * Tuile d'un connecteur (R160) : logo, état, description, capacités, puis « Connect », qui ouvre la connexion tout de
 * suite, et « Learn more », qui ouvre la fiche (toute la tuile y mène aussi).
 */
function ConnectorCard({ tool, manager, onOpenDetail, onConnect }: Readonly<{
  tool: ConnectorView; manager: boolean; onOpenDetail: () => void; onConnect: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.integrations)
  const c = usePreferencesStore((s) => s.t.connect)
  const caps = shownCapabilities(tool)
  const action = cardAction(tool, t, IS_DESKTOP, c, manager)
  return (
    <div className="relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all focus-within:border-foreground/20 hover:border-foreground/20 hover:shadow-sm">
      {/* Ligne haute : logo + état */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-2 text-[11px]">
          <BrandLogo slug={tool.key} name={tool.name} className="size-full" />
        </div>
        <CardState tool={tool} manager={manager} />
      </div>

      {/* Nom + description */}
      <div className="flex-1">
        <h5 className="text-sm font-semibold text-foreground">{tool.name}</h5>
        {tool.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>}
      </div>

      {caps.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-1">
          {caps.map((cap) => (
            <span key={cap} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {capabilityOf(cap, t).label}
            </span>
          ))}
        </div>
      )}

      {/* Le geste, puis la fiche : « Learn more » couvre la tuile, « Connect » reste au-dessus. */}
      <div className="flex items-center justify-between gap-2">
        {action ? (
          <Button size="sm" variant="outline" className="relative z-10 h-7 gap-1.5 px-2.5 text-xs" onClick={onConnect}>
            {!isConnected(tool) && <Plug className="size-3.5" />}
            {action}
          </Button>
        ) : <span />}
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={fillText(t.learnMoreAbout, { name: tool.name })}
          className="rounded-sm text-xs text-muted-foreground transition-colors after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:text-foreground"
        >
          {t.learnMore}
        </button>
      </div>
    </div>
  )
}

/** Une capacité en mots : son nom court (la tuile) et sa phrase (la fiche). */
function capabilityOf(cap: string, t: IntegrationTexts): { label: string; text: string } {
  const known = (t.capabilities as Readonly<Record<string, { label: string; text: string } | undefined>>)[cap]
  return known ?? { label: cap, text: "" }
}

/**
 * Fiche détaillée d'un connecteur, pour en savoir plus (R160) : description, ce qu'il permet, une phrase simple par
 * chemin de connexion (le second accès compris), catégorie et liens officiels.
 */
function ConnectorDetailView({
  tool, categoryLabel, manager, onBack, onConnect,
}: Readonly<{ tool: ConnectorView; categoryLabel: string; manager: boolean; onBack: () => void; onConnect: () => void }>) {
  const c = usePreferencesStore((s) => s.t.connect)
  const t = usePreferencesStore((s) => s.t.integrations)
  const connection = connectionOf(tool, t, IS_DESKTOP, c)
  const action = cardAction(tool, t, IS_DESKTOP, c, manager)
  const connected = isConnected(tool)
  // Ce que fait la native, puis ce qu'ajoute Cortex : un préréglage, ou le second accès d'une native. Un accès que
  // l'éditeur ferme encore ne promet rien : la connexion dit pourquoi, plus bas (R161).
  const admits = (x: ConnectorView) => !x.blocked || x.connected
  const cortexReads = (tool.capabilities.includes("mcp") && admits(tool)) || (tool.live != null && admits(tool.live))
  const lines = [
    ...tool.capabilities.filter((cap) => cap !== "mcp").map((cap) => capabilityOf(cap, t)),
    ...(cortexReads ? [{ label: null, text: t.capabilities.mcp.text }] : []),
  ]
  const live = tool.live ? connectionOf(tool.live, t, IS_DESKTOP, c) : null
  return (
    <div className="flex flex-col gap-6">
      {/* Retour */}
      <button type="button" onClick={onBack} className="flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ChevronLeft className="size-4" /> Back
      </button>

      {/* En-tête : sur un écran étroit, le bouton passe sous la description au lieu de la serrer (R161). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted p-2">
            <BrandLogo slug={tool.key} name={tool.name} className="size-full" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">{tool.name}</h3>
              {connected && (
                <Badge variant="outline" className="gap-1 border-shape-green/25 bg-shape-green/10 text-[10px] text-ink-green">
                  <Check className="size-3" /> {connectedLabel(tool, c)}
                </Badge>
              )}
            </div>
            {tool.description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>}
          </div>
        </div>
        {action && (
          <Button size="sm" className="shrink-0 gap-1.5 self-start" variant={connected ? "outline" : "default"} onClick={onConnect}>
            <Plug className="size-3.5" />
            {action}
          </Button>
        )}
      </div>

      {/* Ce que ça permet */}
      {lines.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What this integration can do</h4>
          <ul className="flex flex-col gap-1.5">
            {lines.map((line) => (
              <li key={line.text} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span>{line.label ? <><span className="font-medium">{line.label}</span>: {line.text}</> : line.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Connexion : une phrase simple par chemin ; un outil que l'éditeur ferme encore dit pourquoi (R15, R160) */}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connection</h4>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{tool.blocked && !tool.connected ? c.notAvailable : connection.label}</span>
          {`: ${tool.blocked && !tool.connected ? tool.blocked : connection.help}`}
        </p>
        {tool.live && live && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{fillText(c.liveTitle, { name: tool.name })}</span>
            {`: ${tool.live.blocked ? tool.live.blocked : live.help}`}
          </p>
        )}
        {tool.setupHint && tool.authType === "API_KEY" && (
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
 * Dialogue de connexion d'une carte : un préréglage (le panneau de connexion), un serveur ajouté à la main, ou une
 * native (GitHub, Slack, Plane) avec, dedans, son second accès : les outils de Cortex (R160).
 */
function ConnectorDialog({
  slug, tool, startLive, manager, onClose, onChanged,
}: Readonly<{
  slug: string; tool: ConnectorView; startLive: boolean; manager: boolean; onClose: () => void; onChanged: () => void
}>) {
  const isNew = tool.key === NEW_CUSTOM_MCP_KEY
  // Plus large quand la console d'actions d'un serveur MCP est dépliée.
  const [wide, setWide] = useState(false)
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent size={wide ? "lg" : "sm"}>
        <DialogHeader>
          <DialogTitle>{isNew ? "Connect an MCP server" : tool.name}</DialogTitle>
        </DialogHeader>
        {tool.authType === "MCP" && tool.connection ? (
          <ConnectPanel slug={slug} tool={tool} manager={manager} onChanged={onChanged} onWide={setWide} />
        ) : tool.authType === "MCP" ? (
          <McpServerForm slug={slug} tool={tool} onClose={onClose} onChanged={onChanged} onWide={setWide} />
        ) : (
          <NativeAccess slug={slug} tool={tool} startLive={startLive} manager={manager} onClose={onClose}
                        onChanged={onChanged} onWide={setWide} />
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Une native et son second accès (R160) : la native d'abord (sa connexion, ou ce qu'elle fait dans cette app), puis
 * « Cortex reads … », nommé par ce qu'il ajoute ; un clic ouvre le panneau de connexion de ce second accès.
 */
function NativeAccess({ slug, tool, startLive, manager, onClose, onChanged, onWide }: Readonly<{
  slug: string; tool: ConnectorView; startLive: boolean; manager: boolean; onClose: () => void; onChanged: () => void
  onWide: (wide: boolean) => void
}>) {
  const c = usePreferencesStore((s) => s.t.connect)
  const t = usePreferencesStore((s) => s.t.integrations)
  const [live, setLive] = useState(startLive)
  if (live && tool.live) {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => { setLive(false); onWide(false) }}
                className="flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft className="size-3.5" /> {fillText(c.liveBack, { name: tool.name })}
        </button>
        <ConnectPanel slug={slug} tool={tool.live} manager={manager} onChanged={onChanged} onWide={onWide} live />
      </div>
    )
  }
  const second = tool.live ? <LiveAccessRow tool={tool} onOpen={() => setLive(true)} /> : null
  if (tool.key === "plane") {
    return <PlaneForm slug={slug} tool={tool} manager={manager} onClose={onClose} onChanged={onChanged} second={second} />
  }
  if (throughGitHubCli(tool, IS_DESKTOP)) return <DesktopGitHubPanel second={second} />
  if (laterOnDesktop(tool, IS_DESKTOP)) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t.slackDesktopHelp}</p>
        {second}
      </div>
    )
  }
  if (!tool.connected) return <NativeConnectPanel slug={slug} tool={tool} manager={manager} second={second} />
  return <NativeOAuthPanel slug={slug} tool={tool} manager={manager} onClose={onClose} onChanged={onChanged} second={second} />
}

/** Le second accès d'une native, dans son dialogue : ce qu'il ajoute, son état, et le geste qui ouvre sa connexion. */
function LiveAccessRow({ tool, onOpen }: Readonly<{ tool: ConnectorView; onOpen: () => void }>) {
  const c = usePreferencesStore((s) => s.t.connect)
  const t = usePreferencesStore((s) => s.t.integrations)
  const live = tool.live
  if (!live) return null
  const state = live.connected
    ? (live.accountLabel ? fillText(c.connectedAs, { account: live.accountLabel }) : c.connected)
    : live.state === "WAITING_FOR_ADMIN" ? c.waitingForAdmin
      : live.state === "NEEDS_RECONNECT" ? c.needsReconnecting
        : fillText(c.liveText, { name: tool.name })
  const label = live.connected ? t.manage
    : live.state === "NEEDS_SETUP" ? t.setUp
      : live.state === "NEEDS_RECONNECT" ? c.reconnect
        : live.state === "WAITING_FOR_ADMIN" ? c.seeWhatToSend
          : c.liveConnect
  return (
    <section className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{fillText(c.liveTitle, { name: tool.name })}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{state}</p>
      </div>
      {!live.blocked && (
        <Button variant="outline" size="sm" className="h-7 w-fit shrink-0 gap-1.5 px-2.5 text-xs" onClick={onOpen}>
          {label}
        </Button>
      )}
    </section>
  )
}

/**
 * GitHub ou Slack pas encore connecté, sur le web : ce que la native fait, puis « Connect », qui mène au
 * consentement de l'éditeur. Un échec se dit dans le dialogue, pas dans un toast (R160).
 */
function NativeConnectPanel({ slug, tool, manager, second }: Readonly<{
  slug: string; tool: ConnectorView; manager: boolean; second: React.ReactNode
}>) {
  const c = usePreferencesStore((s) => s.t.connect)
  const { connectGitHub, connectSlack } = useIntegrationStore()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ConnectFailure | null>(null)

  async function go() {
    setBusy(true)
    setFailure(null)
    try {
      if (tool.key === "github") await connectGitHub(slug)
      else await connectSlack(slug)
    } catch (e) {
      setFailure(failureOf(e, tool.key))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {failure && <FailureNote failure={failure} name={tool.name} />}
      {tool.description && <p className="text-sm text-muted-foreground">{tool.description}</p>}
      {/* Qui la connecte, et pour qui : une fois, pour tout l'espace ; un membre n'a pas le bouton (R161). */}
      <p className="text-sm text-foreground">{fillText(c.nativeManagersOnly, { name: tool.name })}</p>
      {second}
      {manager && failure?.kind !== "forbidden" && (
        <DialogFooter>
          <Button onClick={go} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
            {busy ? c.connecting : failure ? c.tryAgain : c.connectForWorkspace}
          </Button>
        </DialogFooter>
      )}
    </div>
  )
}

/**
 * GitHub dans l'app desktop : le GitHub CLI de la personne, connecté ou à connecter (code à usage unique, comme
 * `gh auth login`). La connexion reste dans le trousseau du système : rien à déconnecter ici.
 */
function DesktopGitHubPanel({ second }: Readonly<{ second?: React.ReactNode }>) {
  const t = usePreferencesStore((s) => s.t.integrations)
  const github = useDesktopToolsStore((s) => s.status?.github ?? null)
  return (
    <div className="flex flex-col gap-3">
      {github?.signedIn && (
        <div className="flex items-center gap-2 rounded-md border border-shape-green/25 bg-shape-green/10 p-3 text-xs text-ink-green">
          <Check className="size-4 shrink-0" />
          <span>{github.login ? t.githubCliSignedIn.replace("{login}", github.login) : t.githubCliSignedInNoLogin}</span>
        </div>
      )}
      <DesktopGitHubConnect purpose={t.githubCliPurpose} />
      {second}
    </div>
  )
}

/**
 * `second` : le second accès de la native (R160), posé avant les gestes du bas. `manager` : un propriétaire ou un
 * administrateur, seul à connecter ou déconnecter une native.
 */
type PanelProps = Readonly<{
  slug: string; tool: ConnectorView; manager: boolean; onClose: () => void; onChanged: () => void; second?: React.ReactNode
}>

/**
 * GitHub ou Slack connecté : état et déconnexion par leur propre route (pas une connexion MCP). La déconnexion
 * passe par le store, qui fait relire le catalogue.
 */
function NativeOAuthPanel({ slug, tool, manager, onClose, second }: PanelProps) {
  const c = usePreferencesStore((s) => s.t.connect)
  const { disconnectGitHub, disconnectSlack } = useIntegrationStore()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [failure, setFailure] = useState<ConnectFailure | null>(null)

  async function handleDisconnect() {
    setBusy(true)
    setFailure(null)
    try {
      if (tool.key === "github") await disconnectGitHub(slug)
      else await disconnectSlack(slug)
      toast.success(`${tool.name} disconnected`)
      onClose()
    } catch (e) {
      setFailure(failureOf(e, tool.key, "notDisconnected"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {failure && <FailureNote failure={failure} name={tool.name} />}
      <div className="flex items-center gap-2 rounded-md border border-shape-green/25 bg-shape-green/10 p-3 text-xs text-ink-green">
        <Check className="size-4 shrink-0" />
        <span>{fillText(c.nativeConnected, { name: tool.name })}</span>
      </div>
      {tool.key === "github" && (
        <p className="text-xs text-muted-foreground">Each project links its repository in its own settings (Integrations, Code repository).</p>
      )}
      {second}
      {manager && (
        <DialogFooter>
          <Button variant="outline" size="sm"
                  className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => setConfirming(true)} disabled={busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" />} Disconnect
          </Button>
        </DialogFooter>
      )}
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
function PlaneForm({ slug, tool, manager, onClose, onChanged, second }: PanelProps) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState<PlaneStatus | null>(null)
  const [projects, setProjects] = useState<PlaneProject[]>([])
  const [projectId, setProjectId] = useState("")
  const [syncing, setSyncing] = useState(false)
  const connectTexts = usePreferencesStore((s) => s.t.connect)
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

  // Un membre : Plane se connecte et se synchronise par un propriétaire ou un administrateur (R161).
  if (!manager) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{tool.description}</p>
        <p className="text-sm text-foreground">
          {connected ? fillText(connectTexts.nativeConnected, { name: tool.name }) : fillText(connectTexts.nativeManagersOnly, { name: tool.name })}
        </p>
        {second}
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="flex flex-col gap-3">
        {second}
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
      {second}
      <p className="text-xs text-muted-foreground">
        {status?.planeWorkspace && <>Workspace <span className="font-medium text-foreground">{status.planeWorkspace}</span> · </>}
        {status?.ingestedNodes ?? 0} item(s) added to the workspace&apos;s knowledge.
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
          {syncing ? "Syncing…" : "Sync"}
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
}: Omit<PanelProps, "manager"> & Readonly<{ onWide: (wide: boolean) => void }>) {
  const isNew = tool.key === NEW_CUSTOM_MCP_KEY
  const isCustom = tool.category === CUSTOM_MCP_CATEGORY
  const texts = usePreferencesStore((s) => s.t.connect)
  const [name, setName] = useState(isNew ? "" : tool.name)
  const [mcpUrl, setMcpUrl] = useState(tool.mcpSuggestedUrl ?? "")
  const [authMode, setAuthMode] = useState<"bearer" | "header">("bearer")
  const [withToken, setWithToken] = useState(false)
  const [headerName, setHeaderName] = useState("")
  const [mcpToken, setMcpToken] = useState("")
  // Un serveur sur cette machine ou le réseau local (app desktop) : la personne voit son adresse et l'accepte.
  const [localOk, setLocalOk] = useState(false)
  const [failure, setFailure] = useState<ConnectFailure | null>(null)
  // Un nom que le motif ne reconnaît pas peut viser le réseau local : le serveur le dit, la case apparaît alors.
  const local = LOCAL_URL.test(mcpUrl.trim()) || failure?.kind === "CONNECT_LOCAL_NEEDS_APPROVAL"
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
  const canSubmit = !busy && Boolean(mcpUrl.trim()) && !nameMissing && (!local || localOk)

  async function handleConnect() {
    setBusy(true)
    setFailure(null)
    try {
      const list = await connectMcpServer(slug, {
        connectorKey: tool.key,
        name: isCustom ? name.trim() : undefined,
        mcpUrl: mcpUrl.trim(),
        mcpToken: mcpToken.trim() || undefined,
        headerName: authMode === "header" ? headerName.trim() : undefined,
        localApproved: local && localOk ? true : undefined,
      })
      const s = isNew
        ? list.find((x) => x.name === name.trim()) ?? null
        : list.find((x) => x.connectorKey === tool.key) ?? null
      const label = isCustom ? name.trim() : tool.name
      if (s?.reachable) toast.success(`${label}: ${s.tools.length} tool(s) live in Cortex`)
      // Sans le texte du serveur : il reste dans le dialogue du serveur, à deux clics (R161).
      else toast.error(fillText(texts.savedUnreachableToast, { name: label }))
      onChanged()
      // Un nouveau serveur prend sa clé définitive côté serveur : sa carte apparaît au catalogue.
      if (isNew) onClose()
      else setStatus(s)
    } catch (e) {
      setFailure(failureOf(e, tool.key))
    } finally {
      setBusy(false)
    }
  }

  async function handleOAuth() {
    setBusy(true)
    setFailure(null)
    try {
      const authorizeUrl = await startMcpOAuth(slug, tool.key, mcpUrl.trim(), undefined, isCustom ? name.trim() : undefined)
      window.location.href = authorizeUrl // redirection vers le consentement du service (la page quitte)
    } catch (e) {
      setFailure(failureOf(e, tool.key))
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    setBusy(true)
    try {
      const result = await disconnectMcpServer(slug, tool.key, status?.scope === "WORKSPACE")
      setStatus(null)
      setMcpUrl(tool.mcpSuggestedUrl ?? ""); setMcpToken("")
      toast.success(disconnectedSentence(tool, result.revoked, texts))
      onChanged()
      if (isCustom) onClose()
    } catch (e) {
      setFailure(failureOf(e, tool.key, "notDisconnected"))
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
          // La cause d'abord ; le texte du serveur, qui peut porter son adresse entière, à deux clics (R161).
          <FailureNote failure={{ key: tool.key, kind: "savedUnreachable", raw: status.error }} name={tool.name} />
        )}
        {failure && <FailureNote failure={failure} name={tool.name} />}
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" size="sm"
                  className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={handleDisconnect} disabled={busy}>
            Disconnect
          </Button>
          <span className="max-w-[55%] self-center truncate text-[11px] text-muted-foreground" title={status.host ?? undefined}>
            {status.host}
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
          {texts.unknownServerTail}
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
      {local && (
        <label className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground">
          <input type="checkbox" className="mt-0.5" checked={localOk} onChange={(e) => setLocalOk(e.target.checked)} />
          <span><span className="font-medium">{texts.localTitle}</span>: {texts.localConfirm}</span>
        </label>
      )}

      {/* Le jeton, un clic plus loin : OAuth (découverte + DCR + PKCE) reste le geste par défaut, aucun jeton à coller. */}
      {withToken && (
        <>
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
        </>
      )}
      <button
        type="button"
        onClick={() => setWithToken((value) => !value)}
        className="w-fit text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
      >
        {withToken ? "Sign in with OAuth instead" : "Use a token instead"}
      </button>
      {failure && <FailureNote failure={failure} name={(isCustom ? name.trim() : tool.name) || texts.thisServer} withKey />}
      {/* Une action principale, en bas à droite (R133) : celle de la façon de se connecter choisie. */}
      <DialogFooter>
        {withToken ? (
          <Button onClick={handleConnect} disabled={!canSubmit || headerMissing} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
            Connect
          </Button>
        ) : (
          <Button onClick={handleOAuth} disabled={!canSubmit} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Server className="size-3.5" />}
            Connect with OAuth
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}
