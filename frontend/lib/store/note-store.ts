import { create } from "zustand"

import { getNote, type Note } from "@/lib/api/note-service"

// ---------------------------------------------------------------------------
// Les notes ouvertes dans le volet (R141, séance n°20) : Ctrl+K en trouve une, le volet la lit. Un domaine = un store ;
// un échec rend null.
// ---------------------------------------------------------------------------

export type NoteStatus = "loading" | "ready" | "missing" | "failed"

interface NoteState {
  /** Les notes lues, par espace et par id (`noteKey`). */
  notes: Record<string, Note>
  /** Où en est chaque note. */
  status: Record<string, NoteStatus>
  /** Lit une note : la note, ou null quand elle n'existe plus, n'est pas lisible, ou que l'appel a échoué. */
  fetchNote: (slug: string, id: number) => Promise<Note | null>
}

export const noteKey = (slug: string, id: number): string => `${slug}:${id}`

/** Une note absente et une note d'un projet privé répondent pareil : on ne révèle pas ce que la personne ne voit pas. */
const isMissing = (error: unknown): boolean => (error as { response?: { status?: number } })?.response?.status === 404

export const useNoteStore = create<NoteState>()((set) => ({
  notes: {},
  status: {},

  fetchNote: async (slug, id) => {
    const key = noteKey(slug, id)
    set((s) => ({ status: { ...s.status, [key]: "loading" } }))
    try {
      const note = await getNote(slug, id)
      set((s) => ({ notes: { ...s.notes, [key]: note }, status: { ...s.status, [key]: "ready" } }))
      return note
    } catch (error) {
      set((s) => ({ status: { ...s.status, [key]: isMissing(error) ? "missing" : "failed" } }))
      return null
    }
  },
}))
