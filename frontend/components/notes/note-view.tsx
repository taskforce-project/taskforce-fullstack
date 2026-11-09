"use client"

import { useEffect } from "react"
import { useParams } from "next/navigation"
import { AlertTriangle, ExternalLink, FileText } from "lucide-react"

import { PageContainer } from "@/components/layout/page-shell"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { Skeleton } from "@/components/ui/skeleton"
import { fillText } from "@/lib/delivery/result-card"
import { noteKey, useNoteStore } from "@/lib/store/note-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { relativeTime } from "@/lib/utils/server-date"

/**
 * Une note de l'espace, dans le volet (R141, séance n°20) : Ctrl+K la trouve, on la lit ici, la conversation gardée. Rien
 * d'autre que la note : son titre, quand elle a changé, son texte, et le lien vers le document d'où elle vient.
 */
export function NoteView({ id }: Readonly<{ id: number }>) {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.note)
  const key = noteKey(slug, id)
  const note = useNoteStore((s) => s.notes[key])
  const status = useNoteStore((s) => s.status[key])
  const fetchNote = useNoteStore((s) => s.fetchNote)

  useEffect(() => {
    if (slug && Number.isFinite(id)) void fetchNote(slug, id)
  }, [slug, id, fetchNote])

  if (!Number.isFinite(id) || status === "missing") {
    return <p className="text-sm text-muted-foreground">{t.missing}</p>
  }
  if (status === "failed" && !note) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertTriangle className="size-4 shrink-0 text-ink-yellow" aria-hidden="true" />
        <p className="min-w-0 flex-1">{t.failed}</p>
        <Button variant="ghost" size="sm" onClick={() => void fetchNote(slug, id)}>{t.retry}</Button>
      </div>
    )
  }
  if (!note) {
    return (
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    )
  }

  return (
    <PageContainer size="narrow" className="gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 break-words">{note.title}</span>
        </h1>
        {note.updatedAt && <p className="text-xs text-muted-foreground">{fillText(t.updated, { when: relativeTime(note.updatedAt) })}</p>}
      </header>
      {note.content ? <Markdown content={note.content} /> : <p className="text-sm text-muted-foreground">{t.empty}</p>}
      {note.contentUrl && (
        <a
          href={note.contentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" /> {t.source}
        </a>
      )}
    </PageContainer>
  )
}
