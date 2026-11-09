import { create } from "zustand";

import {
  answerQuestion as sendAnswer, approveAction, sendAgentMessage, stopTurn, undoAction, type AssistantAnswer, type AssistantToolCall,
  type ModelEscalation, type QuestionAnswer,
} from "@/lib/api/assistant-service";
import {
  compactConversation, deleteConversation, getConversation, listConversations, setConversationProject,
  type ConversationMessage, type ConversationSummary,
} from "@/lib/api/ai-conversation-service";
import { getErrorMessage, getErrorStatus } from "@/lib/api/client";
import { MAX_FILES, type ComposerFile } from "@/lib/cortex/composer-files";
import {
  attachmentKey, COMPACT_COMMAND, toRequest, withAttachment, type ComposerAttachment,
} from "@/lib/cortex/composer-picker";
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
  /** Tour spécial : plafond de tokens IA atteint (une carte d'information), la ligne calme de « /compact » (TF-J1-13), ou « Stopped by you » (R134). */
  kind?: "quota" | "compact" | "stopped";
  /** Les messages que « /compact » a condensés ; 0 quand il n'y avait rien à condenser. */
  compacted?: number;
  /** Ce que TaskForce propose sous la réponse (R118) ; `escalated` une fois la demande envoyée au modèle proposé. */
  escalation?: ModelEscalation | null;
  escalated?: boolean;
  /** Le modèle vers lequel la personne a envoyé la demande, d'un clic : sur sa demande et sur la réponse. */
  sentTo?: string | null;
  /** Ce que la personne a joint à sa demande depuis le compositeur (R123, R134), montré sous elle. */
  attached?: Pick<ComposerAttachment, "label">[];
}

/** Un message qui attend son tour au-dessus de la boîte (R134) : ce qu'il partira avec. */
export interface QueuedMessage {
  id: string;
  text: string;
  attachments: ComposerAttachment[];
  files: ComposerFile[];
}

/** Les messages qui attendent, au plus (R134). */
export const MAX_QUEUE = 5;

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
  /** Ce que la personne joint à sa prochaine demande (R123) : des issues et des projets, trois au plus. */
  attachments: ComposerAttachment[];
  /** Les fichiers texte joints à sa prochaine demande (R134), cinq au plus. */
  files: ComposerFile[];
  /** Les messages tapés pendant que Cortex travaille (R134), visibles au-dessus de la boîte : cinq au plus. */
  queue: QueuedMessage[];
  /** Après un arrêt ou un échec, la file ne repart pas toute seule : un clic envoie le suivant. */
  queueHalted: boolean;
  /** Une ligne dans le compositeur : ce qui n'a pas marché, et quoi faire. */
  notice: string | null;
  /**
   * Le projet où la conversation travaille (R135) : il se voit sous la boîte et se change d'un clic, null pour « No project ».
   * Celui du volet ouvert tant que la conversation n'a pas commencé et que la personne n'en a pas choisi.
   */
  project: number | null;
  /** Le projet ne suit plus le volet : la personne l'a choisi, ou la conversation a commencé. */
  projectPinned: boolean;
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
  /** Le tour en cours peut s'arrêter : le bouton d'envoi est un carré (R134). */
  stoppable: boolean;
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
  /** Joint une issue ou un projet à la prochaine demande : false quand il y est déjà, ou qu'il y en a trois. */
  attach: (item: ComposerAttachment) => boolean;
  /** Retire une pièce jointe, par `attachmentKey`. */
  detach: (key: string) => void;
  /** Ajoute des fichiers lus à la prochaine demande, dans la place qui reste. */
  addFiles: (files: ComposerFile[]) => void;
  /** Retire un fichier de la prochaine demande. */
  removeFile: (id: string) => void;
  /** La ligne du compositeur : ce qui n'a pas marché ; null la retire. */
  setNotice: (text: string | null) => void;
  /** Tant que la conversation n'a pas commencé et que la personne n'a rien choisi, son projet est celui du volet ouvert. */
  followPane: (projectId: number | null) => void;
  /** Choisit le projet de la conversation, gardé tout de suite si elle existe ; false si le serveur le refuse (rien ne change). */
  chooseProject: (slug: string, projectId: number | null) => Promise<boolean>;
  /** L'espace affiché : en changer repart d'une conversation neuve, celle de l'autre espace reste dans son historique. */
  enterWorkspace: (slug: string) => void;
  /** Envoie le texte de la barre : false pour une barre vide, sans espace, ou pendant qu'une réponse est attendue. */
  send: (slug: string) => Promise<boolean>;
  /** Pendant que Cortex travaille, le message tapé attend son tour au-dessus de la boîte : false si la file est pleine. */
  enqueue: () => boolean;
  /** Retire un message de la file. */
  unqueue: (id: string) => void;
  /** Envoie le premier message de la file, d'un clic de la personne après un arrêt ou un échec ; false sinon. */
  sendNext: (slug: string) => Promise<boolean>;
  /** Arrête le tour en cours, tout de suite (R134) : false quand rien ne peut s'arrêter. */
  stop: (slug: string) => boolean;
  /** « /compact » (TF-J1-13) : condense maintenant la conversation, même sous le seuil, et le dit ; false si ça échoue. */
  compact: (slug: string) => Promise<boolean>;
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

/** Ce qu'une demande emporte. */
interface Outgoing {
  text: string;
  attached: ComposerAttachment[];
  files: ComposerFile[];
}

/** L'argument d'une carte de questions qui demande le projet (R135). */
const PROJECT_FIELD = "project";

/** Le tour en cours côté client : on l'arrête, ou on le laisse finir sans lui quand la personne change de conversation. */
interface TurnRun {
  controller: AbortController;
  turn: string;
}

let current: TurnRun | null = null;
/** Chaque changement de conversation : ce qui arrive d'un tour d'avant ne touche pas la conversation à l'écran. */
let conversationEpoch = 0;
/** Ce que le serveur finit de dire d'un tour arrêté : le tour suivant l'attend, il continue la même conversation. */
let settling: Promise<void> | null = null;

/** Le nom d'un tour ; `crypto.randomUUID` n'existe qu'en contexte sécurisé, et une instance peut tourner en http. */
const newTurnName = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

const beginRun = (): TurnRun => {
  current = { controller: new AbortController(), turn: newTurnName() };
  return current;
};

/** Le tour en cours continue sur le serveur, mais la fenêtre ne l'attend plus : la personne a changé de conversation. */
const leaveRun = () => {
  current = null;
  conversationEpoch += 1;
};

/** L'écran de maintenant (R114) : il renseigne Cortex. */
const screenNow = () =>
  screenFrom(typeof window === "undefined" ? null : window.location.pathname, useScreenStore.getState().openIssue);

/** Une réponse de repli, rendue comme une réponse de Cortex pour rester dans le fil. */
function fallbackAnswer(text: string): AssistantAnswer {
  return {
    answer: text, reasoning: null, mode: "fallback", sources: [], steps: [], toolCalls: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

/** Ce que le serveur garde d'un tour arrêté sans rien avoir fait (R134) : la fenêtre le relit comme une ligne calme. */
const STOPPED_TEXT = "Stopped by you.";

/**
 * Reconstruit des tours à partir des messages gardés par le serveur (l'historique d'une conversation) : le modèle et ce
 * qu'il a lu restent avec chaque réponse, la ligne grise se relit pareil (R123).
 */
export function messagesToTurns(messages: ConversationMessage[]): CortexTurn[] {
  return messages.map((m) =>
    m.role === "user"
      ? { id: `m${m.id}`, role: "user", text: m.content, ...(m.files?.length ? { attached: m.files.map((file) => ({ label: file.name })) } : {}) }
      : m.mode === "compact"
      ? { id: `m${m.id}`, role: "assistant", kind: "compact", compacted: m.read?.context?.summarized ?? 0 }
      : m.mode === "stopped" && m.content === STOPPED_TEXT
      ? { id: `m${m.id}`, role: "assistant", kind: "stopped" }
      : {
          id: `m${m.id}`, role: "assistant",
          answer: {
            ...fallbackAnswer(m.content),
            mode: (m.mode as AssistantAnswer["mode"] | null) ?? "fast",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: m.totalTokens },
            model: m.model ?? null,
            read: m.read ?? null,
          },
        },
  );
}

const EMPTY_CONVERSATION = {
  turns: [], conversationId: null, tokens: 0, context: null, lastMs: null, unread: false, done: [], deletions: {},
  project: null, projectPinned: false,
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

/** Le tour se finit : la file repart s'il a abouti ; après un échec, elle attend un clic (R134). */
function afterTurn(slug: string, ok: boolean): void {
  const { queue, queueHalted } = useCortexStore.getState();
  if (queue.length === 0) {
    if (queueHalted) useCortexStore.setState({ queueHalted: false });
    return;
  }
  if (!ok || queueHalted) {
    useCortexStore.setState({ queueHalted: true });
    return;
  }
  const [next, ...rest] = queue;
  useCortexStore.setState({ queue: rest });
  void dispatch(slug, next);
}

/** Fait partir un message de la file : « /compact » garde son geste. */
function dispatch(slug: string, message: QueuedMessage): Promise<boolean> {
  if (message.text.toLowerCase() === COMPACT_COMMAND) return useCortexStore.getState().compact(slug);
  return speak(slug, { text: message.text, attached: message.attachments, files: message.files });
}

/**
 * Envoie une demande à Cortex, avec son projet (R135) et ce qui est joint (R123, R134), et attend sa réponse. Elle peut
 * s'arrêter (`stop`) ; quand la personne change de conversation, le tour finit sur le serveur, sans toucher celle à l'écran.
 */
async function speak(slug: string, out: Outgoing): Promise<boolean> {
  const { text, attached, files } = out;
  const run = beginRun();
  const sentAt = Date.now();
  // Ce qui est joint part avec la demande, et se montre sous elle (R123).
  const shown = [...attached.map((a) => ({ label: a.label })), ...files.map((f) => ({ label: f.name }))];
  useCortexStore.setState((s) => ({
    sentAt, stoppable: true, open: true, unread: false, projectPinned: true,
    turns: [...s.turns, { id: nextId("u"), role: "user", text, ...(shown.length > 0 ? { attached: shown } : {}) }],
  }));
  let ok = false;
  try {
    if (settling) await settling;
    const { conversationId, project } = useCortexStore.getState();
    const res = await sendAgentMessage(slug, text, conversationId, screenNow(), null, toRequest(attached), {
      turn: run.turn, project, signal: run.controller.signal,
      files: files.map((file) => ({ name: file.name, text: file.text })),
    });
    if (current !== run) return false;
    useCortexStore.setState((s) => ({
      conversationId: res.conversationId,
      tokens: s.tokens + (res.answer.usage?.totalTokens ?? 0),
      // Une réponse sans modèle (un repli) ne mesure rien : la jauge garde la dernière mesure.
      context: contextFrom(res.answer.usage) ?? s.context,
      ...(res.projectId !== undefined ? { project: res.projectId } : {}),
      turns: [...s.turns, { id: nextId("a"), role: "assistant", answer: res.answer, escalation: res.escalation ?? null }],
    }));
    void useCortexStore.getState().loadConversations(slug);
    ok = true;
    return true;
  } catch (e) {
    if (current === run) useCortexStore.setState((s) => ({ turns: [...s.turns, failedTurn(e)] }));
    return false;
  } finally {
    if (current === run) {
      current = null;
      // Repliée pendant l'attente : la barre signale qu'une réponse attend d'être lue.
      useCortexStore.setState((s) => ({ sentAt: null, stoppable: false, lastMs: Date.now() - sentAt, unread: !s.open }));
      afterTurn(slug, ok);
    }
  }
}

/**
 * Ce que le serveur dit du tour arrêté (R134) : sa conversation, quand c'était la première demande ; ce qu'il a coûté ; et ce
 * qu'il a déjà fait, qui remplace la ligne « Stopped by you ». Une panne ici ne change rien à ce que la personne voit.
 */
async function settleStop(slug: string, turn: string, line: string): Promise<void> {
  const epoch = conversationEpoch;
  const res = await stopTurn(slug, turn).catch(() => null);
  void useCortexStore.getState().loadConversations(slug);
  if (!res || epoch !== conversationEpoch) return;
  const worked = res.answer.mode !== "stopped" || res.answer.toolCalls.length > 0;
  useCortexStore.setState((s) => ({
    conversationId: res.conversationId,
    tokens: s.tokens + (res.answer.usage?.totalTokens ?? 0),
    context: contextFrom(res.answer.usage) ?? s.context,
    ...(res.projectId !== undefined ? { project: res.projectId } : {}),
    turns: worked ? s.turns.map((t) => (t.id === line ? { id: line, role: "assistant" as const, answer: res.answer } : t)) : s.turns,
  }));
}

/** Après la réponse à une carte qui demandait le projet : la conversation y travaille désormais (R135). */
async function adoptProject(slug: string): Promise<void> {
  const store = useCortexStore.getState();
  await store.loadConversations(slug);
  const { conversations, conversationId } = useCortexStore.getState();
  const conversation = conversations.find((c) => c.id === conversationId);
  if (conversation) useCortexStore.setState({ project: conversation.projectId ?? null, projectPinned: true });
}

export const useCortexStore = create<CortexState>()((set, get) => ({
  draft: "",
  attachments: [],
  files: [],
  queue: [],
  queueHalted: false,
  notice: null,
  workspace: null,
  ...EMPTY_CONVERSATION,
  conversations: [],
  sentAt: null,
  stoppable: false,
  open: false,
  undos: {},
  deletions: {},

  setDraft: (text) => set({ draft: text }),

  attach: (item) => {
    const before = get().attachments;
    const after = withAttachment(before, item);
    if (after.length === before.length) return false;
    set({ attachments: after });
    return true;
  },

  detach: (key) => set((s) => ({ attachments: s.attachments.filter((a) => attachmentKey(a) !== key) })),

  addFiles: (files) => set((s) => ({ files: [...s.files, ...files].slice(0, MAX_FILES) })),

  removeFile: (id) => set((s) => ({ files: s.files.filter((file) => file.id !== id) })),

  setNotice: (text) => set({ notice: text }),

  followPane: (projectId) => {
    const { projectPinned, conversationId, turns, project } = get();
    if (projectPinned || conversationId !== null || turns.length > 0 || project === projectId) return;
    set({ project: projectId });
  },

  chooseProject: async (slug, projectId) => {
    const { conversationId, project: before, projectPinned: pinnedBefore } = get();
    set({ project: projectId, projectPinned: true });
    if (conversationId === null) return true;
    try {
      await setConversationProject(slug, conversationId, projectId);
      set((s) => ({ conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, projectId } : c)) }));
      return true;
    } catch {
      set({ project: before, projectPinned: pinnedBefore });
      return false;
    }
  },

  enterWorkspace: (slug) => {
    if (!slug || get().workspace === slug) return;
    if (get().workspace !== null) leaveRun();
    // Ce qui est joint et ce qui attend n'ont pas de sens dans un autre espace : ils partent avec sa conversation.
    set({ ...EMPTY_CONVERSATION, conversations: [], workspace: slug, attachments: [], files: [], queue: [], queueHalted: false, notice: null, sentAt: null, stoppable: false });
  },

  send: async (slug) => {
    const text = get().draft.trim();
    if (!text || !slug || get().sentAt !== null) return false;
    if (text.toLowerCase() === COMPACT_COMMAND) return get().compact(slug);
    // Une conversation appartient à son espace : une demande d'un autre espace en ouvre une neuve.
    get().enterWorkspace(slug);
    const { attachments, files } = get();
    set({ draft: "", attachments: [], files: [], notice: null });
    return speak(slug, { text, attached: attachments, files });
  },

  enqueue: () => {
    const { draft, attachments, files, queue } = get();
    const text = draft.trim();
    if (!text || queue.length >= MAX_QUEUE) return false;
    set({ draft: "", attachments: [], files: [], queue: [...queue, { id: nextId("q"), text, attachments, files }] });
    return true;
  },

  unqueue: (id) => set((s) => {
    const queue = s.queue.filter((message) => message.id !== id);
    return { queue, queueHalted: s.queueHalted && queue.length > 0 };
  }),

  sendNext: async (slug) => {
    const { queue, sentAt } = get();
    if (!slug || sentAt !== null || queue.length === 0) return false;
    const [next, ...rest] = queue;
    set({ queue: rest, queueHalted: rest.length > 0 });
    return dispatch(slug, next);
  },

  stop: (slug) => {
    const run = current;
    if (!run) return false;
    current = null;
    run.controller.abort();
    const line = nextId("a");
    set((s) => ({
      sentAt: null, stoppable: false, lastMs: s.sentAt === null ? s.lastMs : Date.now() - s.sentAt, unread: !s.open,
      queueHalted: s.queue.length > 0,
      turns: [...s.turns, { id: line, role: "assistant" as const, kind: "stopped" as const }],
    }));
    settling = settleStop(slug, run.turn, line).finally(() => { settling = null; });
    return true;
  },

  compact: async (slug) => {
    if (!slug || get().sentAt !== null) return false;
    get().enterWorkspace(slug);
    const sentAt = Date.now();
    set({ draft: "", sentAt, open: true, unread: false });
    const say = (compacted: number) => (s: CortexState) => ({
      turns: [...s.turns, { id: nextId("a"), role: "assistant" as const, kind: "compact" as const, compacted }],
      // Le prochain prompt sera plus court : la jauge ne garde pas la mesure d'avant.
      context: compacted > 0 ? null : s.context,
    });
    let ok = false;
    try {
      const id = get().conversationId;
      if (id === null) {
        set(say(0));
        ok = true;
        return true;
      }
      const { summarized } = await compactConversation(slug, id);
      set(say(summarized));
      ok = true;
      return true;
    } catch (e) {
      // 400 : ce que le serveur dit de son échec (rien n'a changé) ; le quota et le frein gardent leur tour.
      const status = getErrorStatus(e);
      set((s) => ({ turns: [...s.turns, status === 400
        ? { id: nextId("a"), role: "assistant", answer: fallbackAnswer(getErrorMessage(e)) }
        : failedTurn(e)] }));
      return false;
    } finally {
      set((s) => ({ sentAt: null, lastMs: Date.now() - sentAt, unread: !s.open }));
      afterTurn(slug, ok);
    }
  },

  escalate: async (slug, turnId) => {
    const turns = get().turns;
    const at = turns.findIndex((turn) => turn.id === turnId);
    const offer = at >= 0 ? turns[at].escalation : null;
    const asked = turns.slice(0, Math.max(at, 0)).reverse().find((turn) => turn.role === "user")?.text;
    if (!offer || turns[at].escalated || !asked || !slug || get().sentAt !== null) return false;
    const run = beginRun();
    const sentAt = Date.now();
    // La demande repart telle quelle, vers le modèle proposé : la conversation montre où elle va.
    set((s) => ({
      sentAt, stoppable: true, open: true, unread: false,
      turns: [
        ...s.turns.map((turn) => (turn.id === turnId ? { ...turn, escalated: true } : turn)),
        { id: nextId("u"), role: "user", text: asked, sentTo: offer.to },
      ],
    }));
    let ok = false;
    try {
      // L'écran de maintenant (R114), comme pour une demande écrite dans la barre.
      const res = await sendAgentMessage(slug, asked, get().conversationId, screenNow(), offer.to, null, {
        turn: run.turn, project: get().project, signal: run.controller.signal,
      });
      if (current !== run) return false;
      set((s) => ({
        conversationId: res.conversationId,
        tokens: s.tokens + (res.answer.usage?.totalTokens ?? 0),
        context: contextFrom(res.answer.usage) ?? s.context,
        turns: [...s.turns, { id: nextId("a"), role: "assistant", answer: res.answer, sentTo: res.sentTo ?? offer.to }],
      }));
      void get().loadConversations(slug);
      ok = true;
      return true;
    } catch (e) {
      if (current === run) set((s) => ({ turns: [...s.turns, failedTurn(e)] }));
      return false;
    } finally {
      if (current === run) {
        current = null;
        set((s) => ({ sentAt: null, stoppable: false, lastMs: Date.now() - sentAt, unread: !s.open }));
        afterTurn(slug, ok);
      }
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
      leaveRun();
      // Les gestes faits sur les cartes restent à la conversation qui les a faits : « Changes » repart de celle-ci. Son
      // projet est le sien (R135). Ce qui attendait reste visible, et ne part que d'un clic.
      set((s) => ({
        workspace: slug, turns: messagesToTurns(detail.messages), conversationId: detail.id,
        tokens: detail.totalTokens, context: null, lastMs: null, unread: false, done: [], deletions: {},
        project: detail.projectId ?? null, projectPinned: true, sentAt: null, stoppable: false,
        queueHalted: s.queue.length > 0,
      }));
      return true;
    } catch {
      return false;
    }
  },

  newConversation: () => {
    leaveRun();
    set((s) => ({ ...EMPTY_CONVERSATION, sentAt: null, stoppable: false, queueHalted: s.queue.length > 0 }));
  },

  removeConversation: async (slug, id) => {
    try {
      await deleteConversation(slug, id);
    } catch {
      return false;
    }
    if (get().conversationId === id) get().newConversation();
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
      if (next.status === "pending" && said.some((answer) => answer.field === PROJECT_FIELD)) void adoptProject(slug);
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
