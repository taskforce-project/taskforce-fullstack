"use client"

import { useEffect, useState } from "react"
import { ExternalLink, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { StorageTargetView, StoredDocumentView } from "@/lib/api/storage-service"
import { fillText } from "@/lib/delivery/result-card"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useStorageStore } from "@/lib/store/storage-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { parseServerDate } from "@/lib/utils/server-date"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { StorageDialog } from "./storage-dialog"

export type StorageTexts = (typeof CONSTANTS_EN)["storage"]

/** L'endroit en une phrase : « Google Drive, in Reports », « On this computer, in C:\Reports », « In TaskForce ». */
export function placeLine(target: Pick<StorageTargetView, "storage" | "folderName" | "path">, t: StorageTexts): string {
  const place = t.places[target.storage]
  const folder = target.storage === "machine" ? target.path : target.folderName
  return folder ? fillText(t.inFolder, { place, folder }) : place
}

function when(savedAt: string | null): string {
  if (!savedAt) return ""
  return parseServerDate(savedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

/**
 * Settings > Storage et Project settings > Storage (R156) : où TaskForce range ce qu'il écrit, en une phrase, d'où vient
 * ce choix, « Change » pour qui peut choisir, puis les documents rangés et où chacun vit. Une colonne (R133) ; le détail
 * d'un document (sa version, qui l'a accordé) sous son titre.
 */
export function StoragePanel({ projectId, slug: given }: Readonly<{ projectId?: number; slug?: string }>) {
  const t = usePreferencesStore((s) => s.t.storage)
  const active = useWorkspaceStore((s) => s.activeWorkspace?.slug ?? "")
  const slug = given ?? active
  const project = projectId ?? null
  const key = `${slug}:${project ?? ""}`
  const overview = useStorageStore((s) => (s.key === key ? s.overview : null))
  const loadFailed = useStorageStore((s) => s.loadFailed)
  const saving = useStorageStore((s) => s.saving)
  const fetchStorage = useStorageStore((s) => s.fetchStorage)
  const resetStorage = useStorageStore((s) => s.resetStorage)
  const [choosing, setChoosing] = useState(false)

  useEffect(() => {
    if (slug) void fetchStorage(slug, project)
  }, [slug, project, fetchStorage])

  if (!overview) {
    return loadFailed ? (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">{t.loadFailed}</p>
        <Button variant="outline" size="sm" onClick={() => void fetchStorage(slug, project)}>{t.retry}</Button>
      </div>
    ) : (
      <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-label={t.settingsLabel} /></div>
    )
  }

  const target = overview.target
  const own = overview.scope === "project" && target.from === "project"
  const note = overview.scope === "project"
    ? (own ? t.ownNote : t.inheritedNote)
    : (target.from === "default" ? t.defaultNote : target.chosenBy ? fillText(t.chosenBy, { name: target.chosenBy }) : null)
  const canGoBack = overview.canEdit && (overview.scope === "project" ? own : target.from !== "default")

  async function goBack() {
    const done = await resetStorage(slug, project)
    if (done) toast.success(t.saved)
    else toast.error(useStorageStore.getState().error ?? t.failed)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t.settingsLabel}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{overview.scope === "project" ? t.projectIntro : t.intro}</p>
      </div>

      <section aria-label={t.settingsLabel} className="flex flex-col gap-2 rounded-md border border-border p-3">
        <p className="text-sm text-foreground">{fillText(t.currentLine, { where: placeLine(target, t) })}</p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        <p className="text-xs text-muted-foreground">{t.asksFirst}</p>
        {overview.canEdit ? (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {canGoBack && (
              <Button variant="ghost" size="sm" disabled={saving} onClick={() => void goBack()}>
                {overview.scope === "project" ? t.useWorkspace : t.keepInTaskForce}
              </Button>
            )}
            <Button size="sm" onClick={() => setChoosing(true)}>{t.change}</Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{overview.scope === "project" ? t.readOnlyProject : t.readOnlyWorkspace}</p>
        )}
      </section>

      <section aria-labelledby="storage-documents" className="flex flex-col gap-1">
        <h4 id="storage-documents" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.documentsTitle}</h4>
        {overview.documents.length === 0 ? (
          <p className="py-1 text-sm text-muted-foreground">{t.documentsEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {overview.documents.map((doc) => <DocumentRow key={doc.id} slug={slug} doc={doc} t={t} />)}
          </ul>
        )}
      </section>

      {choosing && (
        <StorageDialog slug={slug} projectId={project} overview={overview} onClose={() => setChoosing(false)} />
      )}
    </div>
  )
}

/** Un document rangé : son titre, où il vit, quand et pour qui ; « Open » quand il a un lien. */
function DocumentRow({ slug, doc, t }: Readonly<{ slug: string; doc: StoredDocumentView; t: StorageTexts }>) {
  const documentLink = useStorageStore((s) => s.documentLink)
  const [opening, setOpening] = useState(false)
  const place = placeLine({ storage: doc.storage, folderName: doc.folderName, path: null }, t)
  const saved = doc.savedFor ? fillText(t.savedFor, { when: when(doc.savedAt), name: doc.savedFor })
    : fillText(t.savedAt, { when: when(doc.savedAt) })
  const detail = [place, saved, doc.version ? fillText(t.version, { version: doc.version }) : null]
    .filter(Boolean).join(" · ")

  async function open() {
    if (doc.webUrl) {
      window.open(doc.webUrl, "_blank", "noopener,noreferrer")
      return
    }
    setOpening(true)
    const url = await documentLink(slug, doc.id)
    setOpening(false)
    if (url) window.open(url, "_blank", "noopener,noreferrer")
    else toast.error(t.linkFailed)
  }

  return (
    <li className="flex items-start gap-2 py-2">
      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground" title={doc.fileName}>{doc.title}</p>
        <p className="truncate text-xs text-muted-foreground" title={detail}>{detail}</p>
      </div>
      {doc.storage !== "machine" && (
        <Button variant="ghost" size="sm" className="gap-1" disabled={opening} onClick={() => void open()}
          title={t.open}>
          {opening ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />} {t.open}
        </Button>
      )}
    </li>
  )
}
