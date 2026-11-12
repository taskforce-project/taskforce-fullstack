"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, Folder, HardDrive, Library, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { MicrosoftFolder } from "@/lib/api/storage-service"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useStorageStore } from "@/lib/store/storage-store"
import type { ChosenFolder } from "./storage-dialog"

const ICON = { drive: HardDrive, library: Library, folder: Folder } as const

/**
 * Le choix d'un dossier de OneDrive ou de SharePoint (R156), par la connexion de la personne : d'abord son OneDrive et
 * les bibliothèques des sites qu'elle suit, puis les dossiers, un niveau à la fois ; « Use this folder » en bas à droite
 * (R133, 560 px). Le serveur ne liste que ce qu'elle peut lire.
 */
export function MicrosoftFolderDialog({ slug, onPick, onClose }: Readonly<{
  slug: string
  onPick: (folder: ChosenFolder) => void
  onClose: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.storage.folders)
  const cancel = usePreferencesStore((s) => s.t.storage.cancel)
  const microsoftFolders = useStorageStore((s) => s.microsoftFolders)
  // Le chemin ouvert, de la racine au dossier courant ; vide à la racine.
  const [path, setPath] = useState<MicrosoftFolder[]>([])
  // Ce que le serveur a rendu pour un endroit : la liste, ou null quand il n'a pas pu.
  const [result, setResult] = useState<{ key: string; items: MicrosoftFolder[] | null } | null>(null)
  const here = path.at(-1) ?? null
  // Le OneDrive de la personne se dit « My files », comme chez Microsoft.
  const nameOf = (item: MicrosoftFolder) => (item.kind === "drive" ? t.myFiles : item.name)
  const trail = path.map(nameOf).join(" / ")

  const key = here ? here.driveId + ":" + here.itemId : ""
  useEffect(() => {
    let alive = true
    void microsoftFolders(slug, here?.driveId, here?.itemId).then((list) => {
      if (alive) setResult({ key, items: list })
    })
    return () => { alive = false }
  }, [key, here, microsoftFolders, slug])
  const current = result?.key === key ? result : null
  const items = current?.items ?? null
  const failed = current !== null && current.items === null

  function open(item: MicrosoftFolder) {
    setPath((p) => [...p, item])
  }

  function use() {
    if (!here) return
    onPick({ driveId: here.driveId, folderId: here.itemId, label: trail })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{here ? trail : `${t.myFiles}, ${t.libraries}`}</DialogDescription>
        </DialogHeader>
        {here && (
          <Button variant="ghost" size="sm" className="w-fit gap-1" onClick={() => setPath((p) => p.slice(0, -1))}>
            <ChevronLeft className="size-3.5" /> {t.up}
          </Button>
        )}
        <div className="max-h-[50vh] min-h-24 overflow-y-auto">
          {failed ? (
            <p className="py-2 text-sm text-muted-foreground">{t.failed}</p>
          ) : items === null ? (
            <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-label={t.title} /></div>
          ) : items.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">{t.empty}</p>
          ) : (
            <ul className="flex flex-col">
              {items.map((item) => {
                const Icon = ICON[item.kind]
                return (
                  <li key={`${item.driveId}:${item.itemId}`}>
                    <button type="button" onClick={() => open(item)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted">
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{nameOf(item)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{cancel}</Button>
          <Button onClick={use} disabled={!here}>{t.useThis}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
