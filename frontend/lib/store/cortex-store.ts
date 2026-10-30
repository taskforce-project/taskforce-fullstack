import { create } from "zustand";

// ---------------------------------------------------------------------------
// Store de la barre unique (R76, séance n°13) : ce qui s'écrit en bas de chaque écran, et la demande envoyée que la
// conversation de Cortex prend une seule fois. Un domaine = un store. Rien ne part tant que la personne n'envoie pas.
// ---------------------------------------------------------------------------

export interface CortexRequest {
  id: number;
  text: string;
}

interface CortexState {
  /** Le texte de la barre, que la personne écrit ou qu'une suggestion remplit. */
  draft: string;
  /** La demande envoyée et pas encore prise par la conversation. */
  pending: CortexRequest | null;

  setDraft: (text: string) => void;
  /** Envoie le texte de la barre et la vide ; un texte vide n'envoie rien (false). */
  submit: () => boolean;
  /** La conversation prend la demande en attente, une seule fois : null si elle est déjà prise. */
  take: (id: number) => string | null;
}

let lastId = 0;

export const useCortexStore = create<CortexState>((set, get) => ({
  draft: "",
  pending: null,

  setDraft: (text) => set({ draft: text }),

  submit: () => {
    const text = get().draft.trim();
    if (!text) return false;
    lastId += 1;
    set({ draft: "", pending: { id: lastId, text } });
    return true;
  },

  take: (id) => {
    const pending = get().pending;
    if (!pending || pending.id !== id) return null;
    set({ pending: null });
    return pending.text;
  },
}));
