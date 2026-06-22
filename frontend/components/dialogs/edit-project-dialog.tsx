"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
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
import { useProjectStore } from "@/lib/store/project-store"
import type { Project } from "@/lib/api/project-service"

interface EditProjectDialogProps {
  readonly project: Project
  readonly slug: string
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

/**
 * Édition des **infos globales** d'un projet (nom, description) dans un modal (PROD-2.10).
 * Les réglages techniques restent dans la page Settings du projet.
 */
export function EditProjectDialog({ project, slug, open, onOpenChange }: EditProjectDialogProps) {
  const updateProject = useProjectStore((s) => s.updateProject)
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? "")
  const [iconUrl, setIconUrl] = useState<string | null>(project.iconUrl)
  const [color, setColor] = useState(project.color || PROJECT_COLORS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(project.name)
      setDescription(project.description ?? "")
      setIconUrl(project.iconUrl)
      setColor(project.color || PROJECT_COLORS[0])
    }
  }, [open, project])

  async function handleSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await updateProject(slug, project.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        iconUrl: iconUrl ?? undefined,
        color,
      })
      toast.success("Opération mise à jour")
      onOpenChange(false)
    } catch {
      toast.error("Échec de la mise à jour")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier l'opération</DialogTitle>
          <DialogDescription>
            Infos globales du projet. Les réglages techniques sont dans l'onglet Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex items-end gap-3">
            <ProjectIconPicker value={iconUrl} onChange={setIconUrl} />
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-medium text-muted-foreground">Nom</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nom de l'opération"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSave() } }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optionnel)"
              rows={3}
              className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Couleur</label>
            <ColorPalettePicker value={color} onChange={setColor} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim() || saving} className="gap-1.5">
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
