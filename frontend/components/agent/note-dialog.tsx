"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { useNoteStore } from "@/lib/store/note-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/** Une note que Cortex a lue, ouverte d'un clic sur son nom (R137) : son titre, son texte, une colonne. */
export function NoteDialog() {
  const t = usePreferencesStore((s) => s.t.thread)
  const title = useNoteStore((s) => s.title)
  const note = useNoteStore((s) => s.note)
  const loading = useNoteStore((s) => s.loading)
  const failed = useNoteStore((s) => s.failed)
  const closeNote = useNoteStore((s) => s.closeNote)

  return (
    <Dialog open={title !== null} onOpenChange={(open) => { if (!open) closeNote() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{note?.title ?? title}</DialogTitle>
          {/* Le nom suffit à la lecture ; la description reste pour un lecteur d'écran. */}
          <DialogDescription className="sr-only">{note?.title ?? title}</DialogDescription>
        </DialogHeader>
        {loading && <p className="text-xs text-muted-foreground">{t.noteOpening}</p>}
        {failed && <p role="alert" className="text-xs text-destructive">{t.noteFailed}</p>}
        {note?.content && <div className="min-w-0 text-sm"><Markdown content={note.content} /></div>}
        <DialogFooter>
          <Button size="sm" onClick={closeNote}>{t.noteClose}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
