import { create } from "zustand";

import {
  answerQuestion as sendAnswer, approveAction, sendAgentMessage, undoAction, type AssistantAnswer, type AssistantToolCall,
  type ModelEscalation, type QuestionAnswer,
} from "@/lib/api/assistant-service";
import {
  deleteConversation, getConversation, listConversations,
  type ConversationMessage, type ConversationSummary,
} from "@/lib/api/ai-conversation-service";
import { getErrorMessage, getErrorStatus } from "@/lib/api/client";
import { contextFrom, type CortexContext } from "@/lib/cortex/context-gauge";
import { screenFrom } from "@/lib/cortex/screen";
import { useIssueStore } from "@/lib/store/issue-store";
import { useScreenStore } from "@/lib/store/screen-store";

// ---------------------------------------------------------------------------
// Store de la conversation avec Cortex et de son compositeur (R76, séance n°13). La conversation vit ici, pas dans un
// composant : depuis la fenêtre (R119, séance n°18), elle tient la colonne du centre, et se replie dans le compositeur
// quand le volet prend toute la largeur, où elle se déplie au-dessus de lui (R120, le motif du 02/11/2026) ; elle ne
// perd rien d'un écran à l'autre. Un domaine = un store ; rien ne part tant que la personne n'envoie pas.
// ---------------------------------------------------------------------------

export interface CortexTurn {
  id: string;
  role: "user" | "assistant";
  text?: string;
  answer?: AssistantAnswer;
  /** Tour spécial : plafond de tokens IA atteint, une carte d'information au lieu d'une réponse. */
  kind?: "quota";
  /** Ce que TaskForce propose sous la réponse (R118) ; `escalated` une fois la demande envoyée au modèle proposé. */
  escalation?: ModelEscalation | null;
  escalated?: boolean;
  /** Le modèle vers lequel la personne a envoyé la demande, d'un clic : sur sa demande et sur la réponse. */
  sentTo?: string | null;
}

/** Où en est « Undo » d'un geste : la conversation et « Changes » (R122) montrent le même état. */
export type UndoState =
  | { status: "running" }
  | { status: "done"; output: string }
  | { status: "error"; output: string };

/** Un geste se nomme par le dossier de sa réponse et son empreinte, ou son outil quand il n'en a pas. */
export const undoKey = (call: Pick<AssistantToolCall, "record" | "ref" | "name">): string =>
  `${call.record ?? ""}:${call.ref ?? call.name}`;

/**
 * Où en est la carte de suppression d'une issue (TF-J1-5) : archivée, rendue, supprimée. La carte et « Changes » (R122)
 * lisent le même état, qui survit à la conversation repliée puis dépliée. `failed` dit pourquoi le dernier geste n'est
 * pas passé : l'archivage, ou la suppression et la raison du serveur.
 */
export interface CardDeletion {
  status: "idle" | "archiving" | "archived" | "restoring" | "deleting" | "deleted";
  /** Ce que le serveur dit de la suppression faite. */
  output?: string;
  failed?: { gesture: "archive" } | { gesture: "delete"; why: string };
}

/** Le geste d'archiver depuis la carte de suppression, tel que « Changes » le montre. */
export const ARCHIVE_GESTURE = "archive_issue";

/** Une carte de suppression se nomme par le dossier de sa réponse et l'issue qu'elle touche. */
export const deletionKey = (call: Pick<AssistantToolCall, "record" | "target" | "name">): string =>
  `${call.record ?? ""}:${call.target?.issueId ?? call.name}`;

const BUSY: ReadonlySet<CardDeletion["status"]> = new Set(["archiving", "restoring", "deleting", "deleted"]);

interface CortexState {
  /** Le texte de la barre, que la personne écrit ou qu'une suggestion remplit. */
  draft: string;
  /** L'espace de la conversation en cours : changer d'espace repart d'une conversation neuve. */
  workspace: string | null;
  turns: CortexTurn[];
  conversationId: number | null;
  conversations: ConversationSummary[];
  /** Tokens consommés par la conversation en cours. */
  tokens: number;
  /**
   * Ce que le modèle a lu à la dernière demande de la conversation (son prompt, la fenêtre que la passerelle lui a donnée) :
   * la jauge de contexte. null avant la première réponse d'un modèle, et dans une conversation rouverte.
   */
  context: CortexContext | null;
  /** Une réponse est attendue depuis cet instant (ms), sinon null. */
  sentAt: number | null;
  /** Durée de la dernière réponse, en ms. */
  lastMs: number | null;
  /** La conversation est dépliée au-dessus de la barre. */
  open: boolean;
  /** Une réponse est arrivée pendant que la conversation était repliée. */
  unread: boolean;
  /**
   * Les gestes faits hors des tours, sur leurs cartes : une issue préparée puis créée, une action accordée, la suite
   * d'une carte de questions. « Changes » les montre avec ceux des tours (R122).
   */
  done: AssistantToolCall[];
  /** « Undo » de chaque geste, par `undoKey`. */
  undos: Record<string, UndoState>;
  /** Les cartes de suppression de la conversation, par `deletionKey`. */
  deletions: Record<string, CardDeletion>;

  setDraft: (text: string) => void;
  /** L'espace affiché : en changer repart d'une conversation neuve, celle de l'autre espace reste dans son historique. */
  enterWorkspace: (slug: string) => void;
  /** Envoie le texte de la barre : false pour une barre vide, sans espace, ou pendant qu'une réponse est attendue. */
  send: (slug: string) => Promise<boolean>;
  /**
   * Envoie de nouveau la demande d'une réponse au modèle que TaskForce y propose (R118), d'un clic de la personne ; false
   * sans proposition, déjà envoyée, ou pendant qu'une réponse est attendue.
   */
  escalate: (slug: string, turnId: string) => Promise<boolean>;
  /** Liste les conversations de l'espace ; false en cas d'échec (la liste reste celle d'avant). */
  loadConversations: (slug: string) => Promise<boolean>;
  /** Rouvre une conversation et son historique ; false en cas d'échec. */
  openConversation: (slug: string, id: number) => Promise<boolean>;
  newConversation: () => void;
  /** Supprime une conversation ; false en cas d'échec. */
  removeConversation: (slug: string, id: number) => Promise<boolean>;
  setOpen: (open: boolean) => void;
  /**
   * Envoie les réponses d'une carte de TaskForce (R115), toutes à la fois : la suite du geste (d'autres questions, sa
   * carte, ce qu'il a fait), ou null en cas d'échec, et la raison dans `questionProblem`.
   */
  answerQuestion: (slug: string, call: AssistantToolCall, answers: QuestionAnswer[]) => Promise<AssistantToolCall | null>;
  /** Pourquoi les dernières réponses à une carte ne sont pas passées, dans les mots du serveur ; null sinon. */
  questionProblem: string | null;
  /** Garde un geste abouti sur sa carte, pour « Changes ». */
  noteDone: (call: AssistantToolCall) => void;
  /**
   * Défait un geste de Cortex (R77), une fois : false si le serveur refuse (l'issue a changé depuis), la raison dans
   * `undos`, ou si « Undo » de ce geste est déjà parti.
   */
  undo: (slug: string, call: AssistantToolCall) => Promise<boolean>;
  /**
   * Archive l'issue d'une carte de suppression, ou la rend (`archived` faux) : « Changes » montre l'archivage tant qu'il
   * tient. false en cas d'échec, la raison dans `deletions`, ou pendant un autre geste de la même carte.
   */
  archiveFromCard: (slug: string, call: AssistantToolCall, archived: boolean) => Promise<boolean>;
  /**
   * Supprime l'issue d'une carte de suppression, par l'accord de la personne, que le serveur rejuge (R1) : « Changes » la
   * montre. false sur un refus ou un échec, la raison dans `deletions`.
   */
  deleteFromCard: (slug: string, call: AssistantToolCall) => Promise<boolean>;
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
            model: m.model ?? null,
          },
        },
  );
}

const EMPTY_CONVERSATION = {
  turns: [], conversationId: null, tokens: 0, context: null, lastMs: null, unread: false, done: [], deletions: {},
};

/** L'archivage d'une carte de suppression, gardé pour « Changes » sous le dossier et l'issue de sa carte. */
const archivedCall = (call: AssistantToolCall): AssistantToolCall =>
  ({ ...call, name: ARCHIVE_GESTURE, status: "success", output: null, ref: null });

/** Les gestes de la conversation, sans l'archivage de cette carte : rendue ou supprimée, l'issue n'est plus archivée. */
const withoutArchive = (done: AssistantToolCall[], key: string): AssistantToolCall[] =>
  done.filter((call) => call.name !== ARCHIVE_GESTURE || deletionKey(call) !== key);

/**
 * Le tour d'une demande qui n'a pas abouti. 409 : le plafond de tokens de l'instance, une carte d'information plutôt
 * qu'un « réessayez » trompeur. 429 : le frein de débit, avec sa limite et la vraie attente (R52). Le reste : un repli.
 */
function failedTurn(e: unknown): CortexTurn {
  const status = getErrorStatus(e);
  return status === 409
    ? { id: nextId("a"), role: "assistant", kind: "quota" }
    : {
        id: nextId("a"), role: "assistant",
        answer: fallbackAnswer(status === 429 ? getErrorMessage(e) : "Sorry, I couldn't answer. Please try again."),
      };
}

export const useCortexStore = create<CortexState>()((set, get) => ({
  draft: "",
  workspace: null,
  ...EMPTY_CONVERSATION,
  conversations: [],
  sentAt: null,
  open: false,
  undos: {},
  deletions: {},

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
    // Ce que la personne voit (R114) : le projet de la route, l'issue de la route ou de la fiche ouverte.
    const screen = screenFrom(typeof window === "undefined" ? null : window.location.pathname,
      useScreenStore.getState().openIssue);
    try {
      const res = screen
        ? await sendAgentMessage(slug, text, get().conversationId, screen)
        : await sendAgentMessage(slug, text, get().conversationId);
      set((s) => ({
        conversationId: res.conversationId,
        tokens: s.tokens + (res.answer.usage?.totalTokens ?? 0),
        // Une réponse sans modèle (un repli) ne mesure rien : la jauge garde la dernière mesure.
        context: contextFrom(res.answer.usage) ?? s.context,
        turns: [...s.turns, { id: nextId("a"), role: "assistant", answer: res.answer, escalation: res.escalation ?? null }],
      }));
      void get().loadConversations(slug);
      return true;
    } catch (e) {
      set((s) => ({ turns: [...s.turns, failedTurn(e)] }));
      return false;
    } finally {
      // Repliée pendant l'attente : la barre signale qu'une réponse attend d'être lue.
      set((s) => ({ sentAt: null, lastMs: Date.now() - sentAt, unread: !s.open }));
    }
  },

  escalate: async (slug, turnId) => {
    const turns = get().turns;
    const at = turns.findIndex((turn) => turn.id === turnId);
    const offer = at >= 0 ? turns[at].escalation : null;
    const asked = turns.slice(0, Math.max(at, 0)).reverse().find((turn) => turn.role === "user")?.text;
    if (!offer || turns[at].escalated || !asked || !slug || get().sentAt !== null) return false;
    const sentAt = Date.now();
    // La demande repart telle quelle, vers le modèle proposé : la conversation montre où elle va.
    set((s) => ({
      sentAt, open: true, unread: false,
      turns: [
        ...s.turns.map((turn) => (turn.id === turnId ? { ...turn, escalated: true } : turn)),
        { id: nextId("u"), role: "user", text: asked, sentTo: offer.to },
      ],
    }));
    try {
      // L'écran de maintenant (R114), comme pour une demande écrite dans la barre.
      const screen = screenFrom(typeof window === "undefined" ? null : window.location.pathname,
        useScreenStore.getState().openIssue);
      const res = await sendAgentMessage(slug, asked, get().conversationId, screen, offer.to);
      set((s) => ({
        conversationId: res.conversationId,
        tokens: s.tokens + (res.answer.usage?.totalTokens ?? 0),
        context: contextFrom(res.answer.usage) ?? s.context,
        turns: [...s.turns, { id: nextId("a"), role: "assistant", answer: res.answer, sentTo: res.sentTo ?? offer.to }],
      }));
      void get().loadConversations(slug);
      return true;
    } catch (e) {
      set((s) => ({ turns: [...s.turns, failedTurn(e)] }));
      return false;
    } finally {
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
      // Les gestes faits sur les cartes restent à la conversation qui les a faits : « Changes » repart de celle-ci.
      set({
        workspace: slug, turns: messagesToTurns(detail.messages), conversationId: detail.id,
        tokens: detail.totalTokens, context: null, lastMs: null, unread: false, done: [], deletions: {},
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

  questionProblem: null,

  answerQuestion: async (slug, call, answers) => {
    // Une réponse vide ne part pas : ni choix coché, ni mot tapé.
    const said = answers
      .map((answer) => ({ field: answer.field, values: answer.values, other: answer.other?.trim() || undefined }))
      .filter((answer) => answer.values.length > 0 || answer.other);
    if (!slug || said.length === 0) return null;
    set({ questionProblem: null });
    try {
      const next = await sendAnswer(slug, call, said);
      if (next.status === "success") get().noteDone(next);
      return next;
    } catch (e) {
      set({ questionProblem: getErrorMessage(e) });
      return null;
    }
  },

  noteDone: (call) => set((s) => ({ done: [...s.done, call] })),

  undo: async (slug, call) => {
    const key = undoKey(call);
    const known = get().undos[key];
    if (!slug || known?.status === "running" || known?.status === "done") return false;
    set((s) => ({ undos: { ...s.undos, [key]: { status: "running" } } }));
    try {
      const result = await undoAction(slug, call);
      set((s) => ({ undos: { ...s.undos, [key]: { status: "done", output: result.output } } }));
      return true;
    } catch (e) {
      set((s) => ({ undos: { ...s.undos, [key]: { status: "error", output: getErrorMessage(e) } } }));
      return false;
    }
  },

  archiveFromCard: async (slug, call, archived) => {
    const target = call.target;
    const key = deletionKey(call);
    const known = get().deletions[key]?.status ?? "idle";
    if (!slug || !target || BUSY.has(known)) return false;
    const put = (state: CardDeletion) => set((s) => ({ deletions: { ...s.deletions, [key]: state } }));
    put({ status: archived ? "archiving" : "restoring" });
    const issue = await useIssueStore.getState().archiveIssue(slug, target.projectId, target.issueId, archived);
    if (!issue) {
      put({ status: archived ? "idle" : "archived", failed: { gesture: "archive" } });
      return false;
    }
    set((s) => ({
      deletions: { ...s.deletions, [key]: { status: archived ? "archived" : "idle" } },
      done: archived ? [...withoutArchive(s.done, key), archivedCall(call)] : withoutArchive(s.done, key),
    }));
    return true;
  },

  deleteFromCard: async (slug, call) => {
    const key = deletionKey(call);
    const known = get().deletions[key]?.status ?? "idle";
    if (!slug || BUSY.has(known)) return false;
    const put = (state: CardDeletion) => set((s) => ({ deletions: { ...s.deletions, [key]: state } }));
    put({ status: "deleting" });
    try {
      const result = await approveAction(slug, call);
      if (result.status !== "success") {
        put({ status: known, failed: { gesture: "delete", why: result.output } });
        return false;
      }
      // Supprimée, l'issue n'est plus archivée : « Changes » ne garde que la suppression.
      set((s) => ({
        deletions: { ...s.deletions, [key]: { status: "deleted", output: result.output } },
        done: [...withoutArchive(s.done, key), { ...call, status: "success", output: result.output, ref: result.ref ?? null }],
      }));
      return true;
    } catch (e) {
      put({ status: known, failed: { gesture: "delete", why: getErrorMessage(e) } });
      return false;
    }
  },
}));
