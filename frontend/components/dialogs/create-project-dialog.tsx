"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FolderKanban, Loader2, DownloadCloud } from "lucide-react"
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
import { ProjectIconPicker } from "@/components/ui/project-icon-picker"
import { ColorPalettePicker, PROJECT_COLORS } from "@/components/ui/color-palette-picker"
import { ProjectVisibilityPicker } from "@/components/ui/project-visibility-picker"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useProjectStore } from "@/lib/store/project-store"
import { getMcpServers, importMcpProject, type McpServerStatus } from "@/lib/api/integration-service"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateProjectDialogProps {
  /** Contrôlé : ouvert/fermé piloté par l'appelant (le modal est global, cf. `useCreateProjectStore`). */
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

type Mode = "blank" | "import"

// ---------------------------------------------------------------------------
// CreateProjectDialog - contrôlé, sans trigger (ouvert « en place » par le store global)
// Deux modes : projet vierge, ou import d'un projet depuis un outil connecté en MCP (TF-MCP-04).
// ---------------------------------------------------------------------------

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)
  const createProject = useProjectStore((s) => s.createProject)

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
  const [servers, setServers] = useState<McpServerStatus[]>([])
  const [serversLoading, setServersLoading] = useState(false)
  const [importSource, setImportSource] = useState("")
  const [importName, setImportName] = useState("")
  const [importing, setImporting] = useState(false)

  // Charge les serveurs MCP connectés (joignables) quand on passe en mode import.
  useEffect(() => {
    if (!open || mode !== "import" || !slug) return
    setServersLoading(true)
    getMcpServers(slug)
      .then((list) => {
        const reachable = list.filter((s) => s.reachable)
        setServers(reachable)
        setImportSource((prev) => prev || (reachable[0]?.connectorKey ?? ""))
      })
      .catch(() => setServers([])) // 409 (plan) ou aucune connexion → état vide géré ci-dessous
      .finally(() => setServersLoading(false))
  }, [open, mode, slug])

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
    setServers([])
    setImportSource("")
    setImportName("")
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
            className={`rounded px-3 py-1.5 transition-colors ${mode === "blank" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Blank
          </button>
          <button
            type="button"
            onClick={() => setMode("import")}
            className={`rounded px-3 py-1.5 transition-colors ${mode === "import" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
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
          <div className="flex flex-col gap-5 py-2">
            {serversLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading connected tools…
              </div>
            ) : servers.length === 0 ? (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                No connected tool yet. Connect one in{" "}
                <span className="font-medium text-foreground">Settings → Integrations</span> (OAuth 1-click), then come back to import.
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="import-source" className="text-sm font-medium text-foreground">Source</label>
                  <select
                    id="import-source"
                    value={importSource}
                    onChange={(e) => setImportSource(e.target.value)}
                    className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground capitalize outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  >
                    {servers.map((s) => (
                      <option key={s.connectorKey} value={s.connectorKey}>{s.connectorKey}</option>
                    ))}
                  </select>
                  <span className="text-xs text-muted-foreground">Its issues are imported into a new TaskForce project.</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="import-name" className="text-sm font-medium text-foreground">New project name</label>
                  <Input
                    id="import-name"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="Imported project"
                    className="h-9"
                    onKeyDown={(e) => e.key === "Enter" && importSource && importName.trim() && handleImport()}
                  />
                </div>
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
            <Button size="sm" onClick={handleImport} disabled={!importSource || !importName.trim() || busy || serversLoading} className="gap-2">
              {importing ? <Loader2 className="size-4 animate-spin" /> : <DownloadCloud className="size-4" />}
              Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
