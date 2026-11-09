import { create } from "zustand";

import { getNote, type BrainNote } from "../api/note-service";

// ---------------------------------------------------------------------------
// La note ouverte depuis ce que Cortex a lu (R137 : « 5 notes » les nomme, chacune s'ouvre). Un domaine = un store ; un
// échec se dit par son état, jamais par une exception.
// ---------------------------------------------------------------------------

interface NoteState {
  /** Son nom, connu dès le clic : le dialogue le montre pendant qu'elle se lit. */
  title: string | null;
  note: BrainNote | null;
  loading: boolean;
  failed: boolean;

  /** Ouvre une note ; false si elle n'a pas pu être lue. */
  openNote: (slug: string, id: number, title: string) => Promise<boolean>;
  closeNote: () => void;
}

const CLOSED = { title: null, note: null, loading: false, failed: false };

/** La dernière note demandée : une réponse qui arrive après une autre ouverture ne la remplace pas. */
let asked = 0;

export const useNoteStore = create<NoteState>((set) => ({
  ...CLOSED,

  openNote: async (slug, id, title) => {
    const mine = ++asked;
    set({ title, note: null, loading: true, failed: false });
    try {
      const note = await getNote(slug, id);
      if (mine === asked) set({ note, loading: false });
      return true;
    } catch {
      if (mine === asked) set({ loading: false, failed: true });
      return false;
    }
  },

  closeNote: () => {
    asked++;
    set(CLOSED);
  },
}));
