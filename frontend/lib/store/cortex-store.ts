import { create } from "zustand";

import { sendAgentMessage, type AssistantAnswer } from "@/lib/api/assistant-service";
import {
  deleteConversation, getConversation, listConversations,
  type ConversationMessage, type ConversationSummary,
} from "@/lib/api/ai-conversation-service";
import { getErrorMessage, getErrorStatus } from "@/lib/api/client";

// ---------------------------------------------------------------------------
// Store de la barre unique (R76, séance n°13) et de la conversation qu'elle ouvre. La conversation vit ici, pas dans
// un composant : elle se déplie au-dessus de la barre et s'y replie sans rien perdre, d'un écran à l'autre (revue UX
// du 01/11/2026). Depuis le 02/11/2026, elle est toujours en bas, jamais sur le côté : rien d'autre à retenir dans le
// navigateur. Un domaine = un store ; rien ne part tant que la personne n'envoie pas.
// ---------------------------------------------------------------------------

export interface CortexTurn {
  id: string;
  role: "user" | "assistant";
  text?: string;
  answer?: AssistantAnswer;
  /** Tour spécial : plafond de tokens IA atteint, une carte d'information au lieu d'une réponse. */
  kind?: "quota";
}

interface CortexState {
  /** Le texte de la barre, que la personne écrit ou qu'une suggestion remplit. */
  draft: string;
  /** L'espace de la conversation en cours : changer d'espace repart d'une conversation neuve. */
  workspace: string | null;
  turns: CortexTurn[];
  conversationId: number | null;
  conversations: ConversationSummary[];
  /** Tokens de la conversation en cours (la jauge de contexte). */
  tokens: number;
  /** Une réponse est attendue depuis cet instant (ms), sinon null. */
  sentAt: number | null;
  /** Durée de la dernière réponse, en ms. */
  lastMs: number | null;
  /** La conversation est dépliée au-dessus de la barre. */
  open: boolean;
  /** Une réponse est arrivée pendant que la conversation était repliée. */
  unread: boolean;

  setDraft: (text: string) => void;
  /** L'espace affiché : en changer repart d'une conversation neuve, celle de l'autre espace reste dans son historique. */
  enterWorkspace: (slug: string) => void;
  /** Envoie le texte de la barre : false pour une barre vide, sans espace, ou pendant qu'une réponse est attendue. */
  send: (slug: string) => Promise<boolean>;
  /** Liste les conversations de l'espace ; false en cas d'échec (la liste reste celle d'avant). */
  loadConversations: (slug: string) => Promise<boolean>;
  /** Rouvre une conversation et son historique ; false en cas d'échec. */
  openConversation: (slug: string, id: number) => Promise<boolean>;
  newConversation: () => void;
  /** Supprime une conversation ; false en cas d'échec. */
  removeConversation: (slug: string, id: number) => Promise<boolean>;
  setOpen: (open: boolean) => void;
}

let lastId = 0;
const nextId = (prefix: string) => `${prefix}${++lastId}`;

/** Une réponse de repli, rendue comme une réponse de Cortex pour rester dans le fil. */
function fallbackAnswer(text: string): AssistantAnswer {
  return {
    answer: text, reasoning: null, mode: "fallback", sources: [], steps: [], toolCalls: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

/** Reconstruit des tours à partir des messages gardés par le serveur (l'historique d'une conversation). */
export function messagesToTurns(messages: ConversationMessage[]): CortexTurn[] {
  return messages.map((m) =>
    m.role === "user"
      ? { id: `m${m.id}`, role: "user", text: m.content }
      : {
          id: `m${m.id}`, role: "assistant",
          answer: {
            ...fallbackAnswer(m.content),
            mode: (m.mode as AssistantAnswer["mode"] | null) ?? "fast",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: m.totalTokens },
          },
        },
  );
}

const EMPTY_CONVERSATION = { turns: [], conversationId: null, tokens: 0, lastMs: null, unread: false };

export const useCortexStore = create<CortexState>()((set, get) => ({
  draft: "",
  workspace: null,
  ...EMPTY_CONVERSATION,
  conversations: [],
  sentAt: null,
  open: false,

  setDraft: (text) => set({ draft: text }),

  enterWorkspace: (slug) => {
    if (!slug || get().workspace === slug) return;
    set({ ...EMPTY_CONVERSATION, conversations: [], workspace: slug });
  },

  send: async (slug) => {
    const text = get().draft.trim();
    if (!text || !slug || get().sentAt !== null) return false;
    // Une conversation appartient à son espace : une demande d'un autre espace en ouvre une neuve.
    get().enterWorkspace(slug);
    const sentAt = Date.now();
    set((s) => ({ draft: "", sentAt, open: true, unread: false, turns: [...s.turns, { id: nextId("u"), role: "user", text }] }));
    try {
      const res = await sendAgentMessage(slug, text, get().conversationId);
      set((s) => ({
        conversationId: res.conversationId,
        tokens: s.tokens + (res.answer.usage?.totalTokens ?? 0),
        turns: [...s.turns, { id: nextId("a"), role: "assistant", answer: res.answer }],
      }));
      void get().loadConversations(slug);
      return true;
    } catch (e) {
      // 409 : le plafond de tokens de l'instance, une carte d'information plutôt qu'un « réessayez » trompeur.
      // 429 : le frein de débit, avec sa limite et la vraie attente (R52). Le reste : un repli générique.
      const status = getErrorStatus(e);
      const turn: CortexTurn = status === 409
        ? { id: nextId("a"), role: "assistant", kind: "quota" }
        : {
            id: nextId("a"), role: "assistant",
            answer: fallbackAnswer(status === 429 ? getErrorMessage(e) : "Sorry, I couldn't answer. Please try again."),
          };
      set((s) => ({ turns: [...s.turns, turn] }));
      return false;
    } finally {
      // Repliée pendant l'attente : la barre signale qu'une réponse attend d'être lue.
      set((s) => ({ sentAt: null, lastMs: Date.now() - sentAt, unread: !s.open }));
    }
  },

  loadConversations: async (slug) => {
    if (!slug) return false;
    try {
      const conversations = await listConversations(slug);
      set({ conversations });
      return true;
    } catch {
      return false;
    }
  },

  openConversation: async (slug, id) => {
    try {
      const detail = await getConversation(slug, id);
      set({
        workspace: slug, turns: messagesToTurns(detail.messages), conversationId: detail.id,
        tokens: detail.totalTokens, lastMs: null, unread: false,
      });
      return true;
    } catch {
      return false;
    }
  },

  newConversation: () => set({ ...EMPTY_CONVERSATION }),

  removeConversation: async (slug, id) => {
    try {
      await deleteConversation(slug, id);
    } catch {
      return false;
    }
    if (get().conversationId === id) set({ ...EMPTY_CONVERSATION });
    set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) }));
    return true;
  },

  setOpen: (open) => set(open ? { open, unread: false } : { open }),
}));
