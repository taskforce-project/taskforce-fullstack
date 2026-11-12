"use client"

import { useState } from "react"
import { FileSearch, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { fillText } from "@/lib/delivery/result-card"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useStorageStore } from "@/lib/store/storage-store"

/**
 * Les fichiers de Google Drive que Cortex peut lire (R155, avec la portée drive.file) : ceux que la personne choisit ici,
 * dans le sélecteur de Google, et ceux que TaskForce y a rangés. Cortex les lit en direct, avec leur version.
 */
export function GoogleDriveFiles({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.storage.driveFiles)
  const failed = usePreferencesStore((s) => s.t.storage.pickerFailed)
  const pickGoogle = useStorageStore((s) => s.pickGoogle)
  const [busy, setBusy] = useState(false)

  async function choose() {
    setBusy(true)
    const picked = await pickGoogle(slug, "files", t.title)
    setBusy(false)
    if (picked) {
      toast.success(picked.length === 1 ? t.chosenOne : fillText(t.chosen, { count: picked.length }))
      return
    }
    const error = useStorageStore.getState().error
    if (error) toast.error(error === "picker" ? failed : error)
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border p-3">
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">{t.text}</p>
      <Button variant="outline" size="sm" className="shrink-0 gap-1.5" disabled={busy} onClick={() => void choose()}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileSearch className="size-3.5" />} {t.choose}
      </Button>
    </div>
  )
}
