"use client"

import { useState } from "react"
import { FolderOpen, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { StorageChoice, StorageKind, StorageOverview } from "@/lib/api/storage-service"
import { desktopBridge } from "@/lib/desktop"
import { fillText } from "@/lib/delivery/result-card"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useStorageStore } from "@/lib/store/storage-store"
import { cn } from "@/lib/utils"
import type { StorageTexts } from "./storage-panel"

/** Le dossier choisi : chez l'éditeur (son identifiant, et le lecteur chez Microsoft), ou sur l'ordinateur. */
export interface ChosenFolder {
  folderId?: string
  driveId?: string
  path?: string
  label: string
}

/** Le nom de l'outil par lequel une cible s'écrit, pour « Connect … first ». */
const TOOL_OF: Partial<Record<StorageKind, string>> = { "google-drive": "Google Drive", onedrive: "Microsoft 365" }

/** Une cible qui demande un dossier : tout sauf le serveur de TaskForce. */
const needsFolder = (kind: StorageKind) => kind !== "server"

/**
 * Le choix de l'endroit (R156) : une colonne de cibles, chacune avec sa phrase ; pour celle qui en demande un, le dossier,
 * choisi dans la boîte du système (l'ordinateur) ou chez l'éditeur ; ce qu'il faut faire avant (se connecter, accorder
 * l'écriture) ; « Save » en bas à droite (R133, 560 px).
 */
export function StorageDialog({ slug, projectId, overview, onClose }: Readonly<{
  slug: string
  projectId: number | null
  overview: StorageOverview
  onClose: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.storage)
  const chooseStorage = useStorageStore((s) => s.chooseStorage)
  const saving = useStorageStore((s) => s.saving)
  const current = overview.target
  const [kind, setKind] = useState<StorageKind>(current.storage)
  const [folder, setFolder] = useState<ChosenFolder | null>(() => initialFolder(current))
  const [picking, setPicking] = useState(false)
  const choice = overview.choices.find((c) => c.storage === kind)
  const ready = choice?.state === "ready"
  const canSave = ready && (!needsFolder(kind) || folder !== null) && !saving

  function select(next: StorageKind) {
    setKind(next)
    setFolder(next === current.storage ? initialFolder(current) : null)
  }

  async function pick() {
    setPicking(true)
    try {
      const chosen = await chooseFolder(kind)
      if (chosen) setFolder(chosen)
    } finally {
      setPicking(false)
    }
  }

  async function save() {
    const done = await chooseStorage(slug, projectId, {
      storage: kind,
      ...(folder?.folderId ? { folderId: folder.folderId } : {}),
      ...(folder?.driveId ? { driveId: folder.driveId } : {}),
      ...(folder?.path ? { path: folder.path } : {}),
    })
    if (done) {
      toast.success(t.saved)
      onClose()
    } else {
      toast.error(useStorageStore.getState().error ?? t.failed)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{overview.scope === "project" ? t.dialogProjectTitle : t.dialogTitle}</DialogTitle>
          <DialogDescription>{t.asksFirst}</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label={t.settingsLabel} className="flex flex-col gap-2">
          {overview.choices.map((c) => (
            <ChoiceRow key={c.storage} choice={c} selected={c.storage === kind} onSelect={() => select(c.storage)} t={t} />
          ))}
        </div>
        {choice && choice.state !== "ready" && TOOL_OF[kind] && (
          <p className="text-sm text-muted-foreground">
            {fillText(choice.state === "connect" ? t.connectFirst : t.allowChanges, { name: TOOL_OF[kind] ?? "" })}
          </p>
        )}
        {ready && needsFolder(kind) && (
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm text-foreground" title={folder?.label}>
              {folder ? folder.label : <span className="text-muted-foreground">{t.noFolder}</span>}
            </p>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={picking} onClick={() => void pick()}>
              {picking ? <Loader2 className="size-3.5 animate-spin" /> : <FolderOpen className="size-3.5" />}
              {folder ? t.changeFolder : t.chooseFolder}
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => void save()} disabled={!canSave}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {saving ? t.saving : t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChoiceRow({ choice, selected, onSelect, t }: Readonly<{
  choice: StorageChoice; selected: boolean; onSelect: () => void; t: StorageTexts
}>) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
      className={cn("flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
        selected ? "border-foreground/40 bg-muted" : "border-border hover:bg-muted/60")}>
      <span className="text-sm font-medium text-foreground">{t.places[choice.storage]}</span>
      <span className="text-xs text-muted-foreground">{t.placeHelp[choice.storage]}</span>
    </button>
  )
}

/** Le dossier déjà choisi, quand la cible ne change pas. */
function initialFolder(current: StorageOverview["target"]): ChosenFolder | null {
  if (current.storage === "machine" && current.path) return { path: current.path, label: current.path }
  return null
}

/** Choisit le dossier de cette cible ; null quand la personne renonce. */
async function chooseFolder(kind: StorageKind): Promise<ChosenFolder | null> {
  if (kind === "machine") {
    const path = await desktopBridge()?.storage?.chooseFolder()
    return path ? { path, label: path } : null
  }
  return null
}
