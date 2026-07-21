"use client"

import { useEffect, useState } from "react"
import {
  Plus,
  FolderKanban,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ProjectIconPicker } from "@/components/ui/project-icon-picker"
import { ColorPalettePicker, PROJECT_COLORS } from "@/components/ui/color-palette-picker"
import { ProjectVisibilityPicker } from "@/components/ui/project-visibility-picker"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useProjectStore } from "@/lib/store/project-store"
import type { Project } from "@/lib/api/project-service"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateProjectDialogProps {
  readonly children?: React.ReactNode
  readonly onCreated?: (project: Project) => void
  /** Ouvre le modal d'emblée (ex : arrivée via « New project » de la sidebar — PROD-8.7). */
  readonly defaultOpen?: boolean
  /** Notifie chaque changement d'état — permet à l'appelant de nettoyer l'URL à la fermeture. */
  readonly onOpenChange?: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// CreateProjectDialog
// ---------------------------------------------------------------------------

export function CreateProjectDialog({ children, onCreated, defaultOpen = false, onOpenChange }: CreateProjectDialogProps) {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)
  const createProject = useProjectStore((s) => s.createProject)

  const [open, setOpen] = useState(defaultOpen)
  const [isLoading, setIsLoading] = useState(false)

  // `defaultOpen` vient d'un paramètre d'URL (`?new=1`). Or `useState` ne lit sa valeur initiale
  // qu'au PREMIER rendu : si l'utilisateur est déjà sur la page Opérations et clique « New Project »,
  // la navigation ne remonte pas le composant, la prop passait de `false` à `true` sans effet, et
  // le modal ne s'ouvrait jamais — le clic semblait ne rien faire. On suit donc les passages à vrai.
  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])
  const [name, setName] = useState("")
  const [identifier, setIdentifier] = useState("")
  const [description, setDescription] = useState("")
  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [color, setColor] = useState<string>(PROJECT_COLORS[0])
  const [isPublic, setIsPublic] = useState(false)

  function handleNameChange(value: string) {
    setName(value)
    const derived = value.toUpperCase().replaceAll(/[^A-Z0-9]/g, "").slice(0, 6)
    const prevDerived = name.toUpperCase().replaceAll(/[^A-Z0-9]/g, "").slice(0, 6)
    if (!identifier || identifier === prevDerived) {
      setIdentifier(derived)
    }
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
        onCreated?.(project)
        changeOpen(false) // passe par le point unique : réinitialise ET prévient l'appelant
      }
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Point de passage UNIQUE pour ouvrir/fermer.
   *
   * Le bouton « Cancel » et la création appelaient `setOpen(false)` en direct, ce qui
   * court-circuitait `onOpenChange` : l'appelant n'était jamais prévenu de la fermeture, et le
   * paramètre `?new=1` restait collé dans l'URL — bloquant toute réouverture ultérieure.
   */
  function changeOpen(next: boolean) {
    setOpen(next)
    onOpenChange?.(next)
    if (!next) resetForm()
  }

  function resetForm() {
    setName("")
    setIdentifier("")
    setDescription("")
    setIconUrl(null)
    setColor(PROJECT_COLORS[0])
    setIsPublic(false)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button size="sm" className="gap-2">
            <Plus className="size-4" />
            New project
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Projects help you track work across issues, cycles, and pages.
          </DialogDescription>
        </DialogHeader>

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

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => changeOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!name.trim() || !identifier.trim() || isLoading} className="gap-2">
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <FolderKanban className="size-4" />}
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
