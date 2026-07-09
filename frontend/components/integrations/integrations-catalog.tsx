"use client"

import { useState, useEffect, useCallback } from "react"
import { Info, Loader2, ExternalLink, Check, Plug } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useIntegrationStore } from "@/lib/store/integration-store"
import {
  getIntegrationCatalog, getPlaneStatus, connectPlane, listPlaneProjects, syncPlane, disconnectPlane,
  type IntegrationCatalog, type ConnectorView, type PlaneProject, type PlaneStatus,
} from "@/lib/api/integration-service"

const CAP_LABEL: Record<string, string> = { observe: "Observe", act: "Agit", metrics: "Métriques" }

/** Le catalogue générique : rend le « pool » d'outils (GET /integrations/catalog) groupé par catégorie. */
export function IntegrationsCatalog({ slug }: Readonly<{ slug: string }>) {
  const [catalog, setCatalog] = useState<IntegrationCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogTool, setDialogTool] = useState<ConnectorView | null>(null)
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
      <div className="flex flex-col gap-6">
        {/* Résumé du pool */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="gap-1"><Plug className="size-3" />{catalog.total} outils</Badge>
          <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400">{catalog.connected} connecté(s)</Badge>
          <Badge variant="secondary">{catalog.available} disponible(s)</Badge>
          <span>· le reste arrive bientôt</span>
        </div>

        {catalog.categories.map((group) => (
          <section key={group.category} className="flex flex-col gap-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.tools.map((tool) => (
                <ConnectorCard key={tool.key} tool={tool} onAction={() => handleAction(tool)} />
              ))}
            </div>
          </section>
        ))}

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

/** Carte d'un outil du catalogue. */
function ConnectorCard({ tool, onAction }: Readonly<{ tool: ConnectorView; onAction: () => void }>) {
  const planned = tool.status === "PLANNED"
  const initials = tool.name.replaceAll(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5",
      planned && "opacity-60"
    )}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[11px] font-bold text-foreground">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{tool.name}</span>
          {tool.connected && <Check className="size-3.5 shrink-0 text-emerald-500" />}
        </div>
        {tool.description && <p className="truncate text-xs text-muted-foreground">{tool.description}</p>}
      </div>

      {/* Aide (tooltip) : quoi faire pour configurer, quand ce n'est pas du 1-clic */}
      {tool.setupHint && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="shrink-0 text-muted-foreground/60 hover:text-foreground" aria-label="Aide à la connexion">
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
            {tool.setupHint}
          </TooltipContent>
        </Tooltip>
      )}

      {planned ? (
        <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">Bientôt</Badge>
      ) : tool.connected ? (
        <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={onAction}>
          {tool.authType === "OAUTH2" ? "Gérer" : "Synchroniser"}
        </Button>
      ) : (
        <Button size="sm" className="h-7 shrink-0 gap-1 text-xs" onClick={onAction}>
          <Plug className="size-3" />Connecter
        </Button>
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
