"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FolderKanban, Loader2, DownloadCloud, Plug } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BrandLogo } from "@/components/ui/brand-logo"
import { ProjectIconPicker } from "@/components/ui/project-icon-picker"
import { ColorPalettePicker, PROJECT_COLORS } from "@/components/ui/color-palette-picker"
import { ProjectVisibilityPicker } from "@/components/ui/project-visibility-picker"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useCreateProjectStore } from "@/lib/store/create-project-store"
import {
  getIntegrationCatalog,
  importMcpProject,
  startMcpOAuth,
  type ConnectorView,
} from "@/lib/api/integration-service"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateProjectDialogProps {
  /** Contrôlé : ouvert/fermé piloté par l'appelant (le modal est global, cf. `useCreateProjectStore`). */
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

type Mode = "blank" | "import"

/** Catégorie des outils depuis lesquels on peut importer un projet (des issues). */
const PM_CATEGORY = "PROJECT_MANAGEMENT"

// ---------------------------------------------------------------------------
// CreateProjectDialog - deux modes : projet vierge, ou import d'un projet depuis un outil connecté
// en MCP (TF-MCP-04). En mode import : grille de logos (Linear, Asana, Jira…), avec connexion 1-clic
// inline pour les outils pas encore branchés.
// ---------------------------------------------------------------------------

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)
  const createProject = useProjectStore((s) => s.createProject)
  const preselectImportSource = useCreateProjectStore((s) => s.importSource)

  const [mode, setMode] = useState<Mode>("blank")
  const [isLoading, setIsLoading] = useState(false)

  // -- Mode « vierge » --
  const [name, setName] = useState("")
  const [identifier, setIdentifier] = useState("")
  const [description, setDescription] = useState("")
  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [color, setColor] = useState<string>(PROJECT_COLORS[0])
  const [isPublic, setIsPublic] = useState(false)

  // -- Mode « import » --
  const [tools, setTools] = useState<ConnectorView[]>([])
  const [toolsLoading, setToolsLoading] = useState(false)
  const [importSource, setImportSource] = useState("")
  const [importName, setImportName] = useState("")
  const [importing, setImporting] = useState(false)
  const [connectingKey, setConnectingKey] = useState<string | null>(null)

  // Charge les outils MCP-ready de gestion de projet (logos + état connecté) quand on passe en import.
  useEffect(() => {
    if (!open || mode !== "import" || !slug) return
    setToolsLoading(true)
    getIntegrationCatalog(slug)
      .then((cat) => {
        const pm = cat.categories
          .flatMap((g) => g.tools)
          .filter((t) => t.mcpSuggestedUrl && t.category === PM_CATEGORY)
        setTools(pm)
      })
      .catch(() => setTools([]))
      .finally(() => setToolsLoading(false))
  }, [open, mode, slug])

  // Retour OAuth fluide : le modal a été rouvert avec une source présélectionnée (outil qu'on vient de
  // connecter) → basculer en mode import et sélectionner cet outil.
  useEffect(() => {
    if (open && preselectImportSource) {
      setMode("import")
      setImportSource(preselectImportSource)
    }
  }, [open, preselectImportSource])

  function handleNameChange(value: string) {
    setName(value)
    const derived = value.toUpperCase().replaceAll(/[^A-Z0-9]/g, "").slice(0, 6)
    const prevDerived = name.toUpperCase().replaceAll(/[^A-Z0-9]/g, "").slice(0, 6)
    if (!identifier || identifier === prevDerived) {
      setIdentifier(derived)
    }
  }

  function resetForm() {
    setMode("blank")
    setName("")
    setIdentifier("")
    setDescription("")
    setIconUrl(null)
    setColor(PROJECT_COLORS[0])
    setIsPublic(false)
    setTools([])
    setImportSource("")
    setImportName("")
    setConnectingKey(null)
  }

  /** Point de passage unique : prévient l'appelant (store) et réinitialise le formulaire à la fermeture. */
  function changeOpen(next: boolean) {
    onOpenChange(next)
    if (!next) resetForm()
  }

  async function handleCreate() {
    if (!name.trim() || !identifier.trim() || !slug) return
    setIsLoading(true)
    try {
      const project = await createProject(slug, {
        name: name.trim(),
        identifier: identifier.trim().toUpperCase(),
        description: description.trim() || undefined,
        iconUrl: iconUrl ?? undefined,
        color,
        isPublic,
      })
      if (project) {
        toast.success(`Project "${project.name}" created`)
        changeOpen(false)
        router.push(`/${slug}/projects/${project.id}`)
      } else {
        toast.error("Unable to create the project")
      }
    } catch {
      toast.error("Something went wrong while creating the project")
    } finally {
      setIsLoading(false)
    }
  }

  /** Connexion 1-clic (OAuth) d'un outil pas encore branché, directement depuis le dialog. */
  async function handleConnect(tool: ConnectorView) {
    if (!slug || !tool.mcpSuggestedUrl) return
    setConnectingKey(tool.key)
    try {
      // Retour fluide : après le consentement, on revient sur ce wizard (mode import, outil sélectionné),
      // pas sur Settings.
      const url = await startMcpOAuth(slug, tool.key, tool.mcpSuggestedUrl, `/${slug}?import=${tool.key}`)
      window.location.href = url // redirection vers le consentement du service (la page quitte)
    } catch {
      toast.error("Couldn't start the connection - it may require a Business plan")
      setConnectingKey(null)
    }
  }

  async function handleImport() {
    if (!importSource || !importName.trim() || !slug) return
    setImporting(true)
    try {
      const result = await importMcpProject(slug, importSource, importName.trim())
      toast.success(`Imported ${result.imported}/${result.found} issues into "${result.projectName}"`)
      changeOpen(false)
      router.push(`/${slug}/projects/${result.projectId}`)
    } catch {
      toast.error("Import failed - check the connected tool and try again")
    } finally {
      setImporting(false)
    }
  }

  const busy = isLoading || importing

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            {mode === "blank"
              ? "Projects help you track work across issues, cycles, and pages."
              : "Import an existing project's issues from a connected tool into a new TaskForce project."}
          </DialogDescription>
        </DialogHeader>

        {/* Sélecteur de mode : vierge / import */}
        <div className="inline-flex w-fit rounded-md border border-border p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode("blank")}
            className={cn(
              "rounded px-3 py-1.5 transition-colors",
              mode === "blank" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Blank
          </button>
          <button
            type="button"
            onClick={() => setMode("import")}
            className={cn(
              "rounded px-3 py-1.5 transition-colors",
              mode === "import" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Import from a tool
          </button>
        </div>

        {mode === "blank" ? (
          <div className="flex flex-col gap-5 py-2">
            {/* Icon + Name row */}
            <div className="flex items-end gap-4">
              <ProjectIconPicker value={iconUrl} onChange={setIconUrl} />

              <div className="flex-1 flex flex-col gap-1.5 pb-0.5">
                <label htmlFor="project-name" className="text-sm font-medium text-foreground">Project name</label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="My New Project"
                  className="h-9"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && name.trim() && identifier.trim() && handleCreate()}
                />
              </div>
            </div>

            {/* Identifier */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="project-identifier" className="text-sm font-medium text-foreground">
                Identifier{" "}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">Used as issue prefix (e.g. WEB-42)</span>
              </label>
              <Input
                id="project-identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value.toUpperCase().replaceAll(/[^A-Z0-9-]/g, "").slice(0, 10))}
                placeholder="WEB"
                className="h-9 font-mono uppercase"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="project-description" className="text-sm font-medium text-foreground">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-18"
              />
            </div>

            {/* Color */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Color</label>
              <ColorPalettePicker value={color} onChange={setColor} />
            </div>

            {/* Visibility */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Visibility</label>
              <ProjectVisibilityPicker value={isPublic} onChange={setIsPublic} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            {toolsLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading tools…
              </div>
            ) : tools.length === 0 ? (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                No importable tool available yet.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {tools.map((t) => {
                    const selected = importSource === t.key
                    return (
                      <button
                        key={t.key}
                        type="button"
                        disabled={connectingKey !== null && connectingKey !== t.key}
                        onClick={() => (t.connected ? setImportSource(selected ? "" : t.key) : handleConnect(t))}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors",
                          selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                          connectingKey !== null && connectingKey !== t.key && "opacity-50",
                        )}
                      >
                        <BrandLogo slug={t.key} name={t.name} className="size-7" />
                        <span className="text-[12.5px] font-medium text-foreground">{t.name}</span>
                        {t.connected ? (
                          <span className="text-[10px] font-medium text-emerald-600">Connected</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                            {connectingKey === t.key ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Plug className="size-3" />
                            )}
                            Connect
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {importSource && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="import-name" className="text-sm font-medium text-foreground">New project name</label>
                    <Input
                      id="import-name"
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                      placeholder="Imported project"
                      className="h-9"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && importSource && importName.trim() && handleImport()}
                    />
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  Pick a connected tool to import its issues, or connect one in 1 click - no need to open Settings.
                </p>
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => changeOpen(false)} disabled={busy}>
            Cancel
          </Button>
          {mode === "blank" ? (
            <Button size="sm" onClick={handleCreate} disabled={!name.trim() || !identifier.trim() || busy} className="gap-2">
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <FolderKanban className="size-4" />}
              Create project
            </Button>
          ) : (
            <Button size="sm" onClick={handleImport} disabled={!importSource || !importName.trim() || busy || toolsLoading} className="gap-2">
              {importing ? <Loader2 className="size-4 animate-spin" /> : <DownloadCloud className="size-4" />}
              Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
