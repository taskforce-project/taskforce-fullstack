import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

import { deletionKey, messagesToTurns, undoKey, useCortexStore } from "./cortex-store";
import { useIssueStore } from "./issue-store";
import { useScreenStore } from "./screen-store";
import {
  answerQuestion, approveAction, sendAgentMessage, stopTurn, undoAction, type AssistantAnswer, type AssistantToolCall,
  type ChatTurnResponse,
} from "@/lib/api/assistant-service";
import {
  compactConversation, deleteConversation, getConversation, listConversations, setConversationProject, type ConversationSummary,
} from "@/lib/api/ai-conversation-service";

// Aucun réseau : la réponse de Cortex et les conversations sont simulées ; les erreurs passent par le vrai client.
vi.mock("@/lib/api/assistant-service", () => ({
  sendAgentMessage: vi.fn(), answerQuestion: vi.fn(), undoAction: vi.fn(), approveAction: vi.fn(), stopTurn: vi.fn(),
}));
vi.mock("@/lib/api/ai-conversation-service", () => ({
  listConversations: vi.fn(), getConversation: vi.fn(), deleteConversation: vi.fn(), compactConversation: vi.fn(),
  setConversationProject: vi.fn(),
}));

const answer = (text: string, totalTokens = 120): AssistantAnswer => ({
  answer: text, reasoning: null, mode: "deep", sources: [], steps: [], toolCalls: [],
  usage: { promptTokens: totalTokens - 20, completionTokens: 20, totalTokens },
});

const summary = (id: number, title: string): ConversationSummary => ({
  id, title, updatedAt: null, messageCount: 2, totalTokens: 0,
});

function httpError(status: number, data: Record<string, unknown> = {}): AxiosError {
  const response = { status, data, headers: {}, statusText: "", config: {} } as AxiosResponse;
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", {} as InternalAxiosRequestConfig, undefined, response);
}

const initial = useCortexStore.getState();

describe("useCortexStore : /compact (TF-J1-13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCortexStore.setState({ ...initial, draft: "", workspace: "acme", turns: [], conversations: [], conversationId: 7, context: { tokens: 3400, window: 8192 } });
  });

  it("sends /compact to TaskForce, not to Cortex, and says it in the conversation", async () => {
    vi.mocked(compactConversation).mockResolvedValue({ summarized: 12 });
    useCortexStore.getState().setDraft(" /compact ");

    await expect(useCortexStore.getState().send("acme")).resolves.toBe(true);

    expect(compactConversation).toHaveBeenCalledWith("acme", 7);
    expect(sendAgentMessage).not.toHaveBeenCalled();
    const state = useCortexStore.getState();
    expect(state.draft).toBe("");
    expect(state.turns).toEqual([expect.objectContaining({ kind: "compact", compacted: 12, role: "assistant" })]);
    // Le prochain prompt sera plus court : la jauge ne garde pas la mesure d'avant.
    expect(state.context).toBeNull();
    expect(state.sentAt).toBeNull();
    expect(state.open).toBe(true);
  });

  it("a conversation that has not started has nothing to compact: no call, and it says so", async () => {
    useCortexStore.setState({ conversationId: null });
    useCortexStore.getState().setDraft("/compact");

    await expect(useCortexStore.getState().send("acme")).resolves.toBe(true);

    expect(compactConversation).not.toHaveBeenCalled();
    expect(useCortexStore.getState().turns).toEqual([expect.objectContaining({ kind: "compact", compacted: 0 })]);
    expect(useCortexStore.getState().sentAt).toBeNull();
  });

  it("nothing to condense: the gauge keeps its measure", async () => {
    vi.mocked(compactConversation).mockResolvedValue({ summarized: 0 });

    await expect(useCortexStore.getState().compact("acme")).resolves.toBe(true);

    expect(useCortexStore.getState().context).toEqual({ tokens: 3400, window: 8192 });
  });

  it("a refused summary says what the server says, nothing changed", async () => {
    vi.mocked(compactConversation).mockRejectedValue(httpError(400, { message: "The conversation could not be compacted: nothing changed. Try again." }));

    await expect(useCortexStore.getState().compact("acme")).resolves.toBe(false);

    expect(useCortexStore.getState().turns.at(-1)?.answer?.answer).toContain("could not be compacted");
    expect(useCortexStore.getState().sentAt).toBeNull();
  });

  it("the monthly limit gets its card, as for an answer", async () => {
    vi.mocked(compactConversation).mockRejectedValue(httpError(409));

    await expect(useCortexStore.getState().compact("acme")).resolves.toBe(false);

    expect(useCortexStore.getState().turns.at(-1)?.kind).toBe("quota");
  });

  it("does nothing while an answer is awaited, or without a workspace", async () => {
    await expect(useCortexStore.getState().compact("")).resolves.toBe(false);
    useCortexStore.setState({ sentAt: Date.now() });
    await expect(useCortexStore.getState().compact("acme")).resolves.toBe(false);

    expect(compactConversation).not.toHaveBeenCalled();
  });

  it("a reopened conversation reads the same: the compact line, not an answer", () => {
    const turns = messagesToTurns([
      { id: 1, role: "user", content: "Hello", mode: null, totalTokens: 0, createdAt: null },
      { id: 2, role: "assistant", content: "Conversation compacted", mode: "compact", totalTokens: 0, createdAt: null,
        read: { issues: [], boards: [], tools: [], notes: 0, context: { summarized: 8, leftOut: 0, toolResults: 0 } } },
      { id: 3, role: "assistant", content: "Conversation compacted", mode: "compact", totalTokens: 0, createdAt: null },
    ]);

    expect(turns[1]).toEqual({ id: "m2", role: "assistant", kind: "compact", compacted: 8 });
    expect(turns[2].compacted).toBe(0);
  });

  it("the quiet line of a compacted turn is kept with the answer on reopening", () => {
    const read = { issues: [], boards: [], tools: [], notes: 0, context: { summarized: 8, leftOut: 1, toolResults: 0 } };
    const [turn] = messagesToTurns([{ id: 2, role: "assistant", content: "Zephyr-7.", mode: "fast", totalTokens: 40, createdAt: null, model: "qwen3:8b", read }]);

    expect(turn.answer?.read?.context).toEqual({ summarized: 8, leftOut: 1, toolResults: 0 });
  });
});

describe("useCortexStore : la barre unique et la conversation qu'elle déplie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useCortexStore.setState({ ...initial, draft: "", workspace: null, turns: [], conversations: [], open: false });
    vi.mocked(listConversations).mockResolvedValue([]);
  });

  it("sends what the bar says, unfolds the conversation and keeps the answer", async () => {
    vi.mocked(sendAgentMessage).mockResolvedValue({ conversationId: 7, title: "Blocked issues", answer: answer("Two issues are blocked.") });
    vi.mocked(listConversations).mockResolvedValue([summary(7, "Blocked issues")]);
    useCortexStore.getState().setDraft("  Which issues are blocked?  ");

    const sent = useCortexStore.getState().send("acme");
    // Dès l'envoi : la barre se vide, la demande est dans le fil, la conversation est dépliée.
    expect(useCortexStore.getState().draft).toBe("");
    expect(useCortexStore.getState().open).toBe(true);
    expect(useCortexStore.getState().sentAt).not.toBeNull();
    expect(useCortexStore.getState().turns[0]).toMatchObject({ role: "user", text: "Which issues are blocked?" });

    await expect(sent).resolves.toBe(true);
    const state = useCortexStore.getState();
    expect(sendAgentMessage).toHaveBeenCalledWith("acme", "Which issues are blocked?", null, null, null, [], expect.objectContaining({ project: null, files: [] }));
    expect(state.turns[1].answer?.answer).toBe("Two issues are blocked.");
    expect(state.conversationId).toBe(7);
    expect(state.tokens).toBe(120);
    expect(state.sentAt).toBeNull();
    expect(state.lastMs).not.toBeNull();
    expect(state.unread).toBe(false);
    await vi.waitFor(() => expect(useCortexStore.getState().conversations).toEqual([summary(7, "Blocked issues")]));
  });

  it("continues the same conversation with the next request", async () => {
    vi.mocked(sendAgentMessage).mockResolvedValue({ conversationId: 7, title: "t", answer: answer("ok", 50) });
    useCortexStore.getState().setDraft("first");
    await useCortexStore.getState().send("acme");
    useCortexStore.getState().setDraft("second");
    await useCortexStore.getState().send("acme");

    expect(vi.mocked(sendAgentMessage).mock.calls[1].slice(0, 3)).toEqual(["acme", "second", 7]);
    expect(useCortexStore.getState().turns).toHaveLength(4);
    expect(useCortexStore.getState().tokens).toBe(100);
  });

  it.each([
    ["an empty bar", "   ", "acme"],
    ["no workspace", "Create a project Pricing", ""],
  ])("sends nothing from %s", async (_label, draft, slug) => {
    useCortexStore.getState().setDraft(draft);

    await expect(useCortexStore.getState().send(slug)).resolves.toBe(false);
    expect(sendAgentMessage).not.toHaveBeenCalled();
    expect(useCortexStore.getState().turns).toEqual([]);
  });

  it("keeps a second request in the bar while Cortex is answering", async () => {
    useCortexStore.setState({ sentAt: Date.now(), draft: "second" });

    await expect(useCortexStore.getState().send("acme")).resolves.toBe(false);
    expect(useCortexStore.getState().draft).toBe("second");
    expect(sendAgentMessage).not.toHaveBeenCalled();
  });

  it("lights the bar when the answer arrives while the conversation is folded", async () => {
    let answerNow: (value: Awaited<ReturnType<typeof sendAgentMessage>>) => void = () => {};
    vi.mocked(sendAgentMessage).mockReturnValue(new Promise((resolve) => { answerNow = resolve; }));
    useCortexStore.getState().setDraft("What changed this week?");

    const sent = useCortexStore.getState().send("acme");
    useCortexStore.getState().setOpen(false);
    answerNow({ conversationId: 3, title: "t", answer: answer("Three issues moved.") });
    await sent;

    expect(useCortexStore.getState().unread).toBe(true);
    useCortexStore.getState().setOpen(true);
    expect(useCortexStore.getState().unread).toBe(false);
  });

  it.each([
    [409, {}, { kind: "quota" }],
    [429, { error: "AI Rate Limited", message: "Too many AI requests: wait 40 s." }, { answer: { answer: "Too many AI requests: wait 40 s." } }],
    [500, {}, { answer: { answer: "Sorry, I couldn't answer. Please try again." } }],
  ])("answers a refusal of the server (%i) in the conversation", async (status, data, expected) => {
    vi.mocked(sendAgentMessage).mockRejectedValue(httpError(status, data));
    useCortexStore.getState().setDraft("Summarize the decisions");

    await expect(useCortexStore.getState().send("acme")).resolves.toBe(false);
    const state = useCortexStore.getState();
    expect(state.turns[1]).toMatchObject({ role: "assistant", ...expected });
    expect(state.sentAt).toBeNull();
  });

  it("starts a new conversation in another workspace", () => {
    useCortexStore.setState({ workspace: "acme", conversationId: 7, turns: [{ id: "u1", role: "user", text: "hi" }], conversations: [summary(7, "t")] });

    useCortexStore.getState().enterWorkspace("acme");
    expect(useCortexStore.getState().conversationId).toBe(7);
    useCortexStore.getState().enterWorkspace("");
    expect(useCortexStore.getState().workspace).toBe("acme");

    useCortexStore.getState().enterWorkspace("globex");
    const state = useCortexStore.getState();
    expect(state.workspace).toBe("globex");
    expect(state.conversationId).toBeNull();
    expect(state.turns).toEqual([]);
    expect(state.conversations).toEqual([]);
  });

  it("lists the conversations, and keeps the list when the server fails", async () => {
    vi.mocked(listConversations).mockResolvedValueOnce([summary(1, "One")]);
    await expect(useCortexStore.getState().loadConversations("acme")).resolves.toBe(true);
    expect(useCortexStore.getState().conversations).toHaveLength(1);

    vi.mocked(listConversations).mockRejectedValueOnce(new Error("network"));
    await expect(useCortexStore.getState().loadConversations("acme")).resolves.toBe(false);
    expect(useCortexStore.getState().conversations).toHaveLength(1);
    await expect(useCortexStore.getState().loadConversations("")).resolves.toBe(false);
  });

  it("reopens a conversation with its history", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      id: 4, title: "Pricing", totalTokens: 900,
      messages: [
        { id: 1, role: "user", content: "Create an issue for the pricing page", mode: null, totalTokens: 0, createdAt: null },
        { id: 2, role: "assistant", content: "The card is ready to review.", mode: "deep", totalTokens: 900, createdAt: null },
      ],
    });
    useCortexStore.setState({ unread: true });

    await expect(useCortexStore.getState().openConversation("acme", 4)).resolves.toBe(true);
    const state = useCortexStore.getState();
    expect(state.conversationId).toBe(4);
    expect(state.tokens).toBe(900);
    expect(state.unread).toBe(false);
    expect(state.turns.map((t) => t.role)).toEqual(["user", "assistant"]);
    expect(state.turns[1].answer).toMatchObject({ answer: "The card is ready to review.", mode: "deep" });

    vi.mocked(getConversation).mockRejectedValue(new Error("gone"));
    await expect(useCortexStore.getState().openConversation("acme", 5)).resolves.toBe(false);
    expect(useCortexStore.getState().conversationId).toBe(4);
  });

  // « Changes » est celui de la conversation : en rouvrir une autre repart de ses gestes à elle.
  it("leaves the gestures of the cards with the conversation that made them", async () => {
    vi.mocked(getConversation).mockResolvedValue({ id: 6, title: "Other", totalTokens: 0, messages: [] });
    useCortexStore.setState({
      done: [{ name: "create_issue", status: "success", input: null, output: null, record: "r" }],
      deletions: { "r:1": { status: "archived" } },
    });

    await useCortexStore.getState().openConversation("acme", 6);
    expect(useCortexStore.getState()).toMatchObject({ done: [], deletions: {} });
  });

  // Test du CEO de la 1.10.0 : quel modèle a répondu ? Une réponse rouverte le dit encore, quand il a été gardé.
  it("reopens an answer with the model that wrote it, when it was kept", () => {
    const turns = messagesToTurns([
      { id: 9, role: "assistant", content: "ok", mode: "deep", totalTokens: 3, createdAt: null, model: "qwen3:8b" },
      { id: 10, role: "assistant", content: "ok", mode: "deep", totalTokens: 3, createdAt: null },
    ]);

    expect(turns[0].answer?.model).toBe("qwen3:8b");
    expect(turns[1].answer?.model).toBeNull();
  });

  it("keeps what the model read with each answer of a reopened conversation: the grey line reads the same (R123)", () => {
    const read = { issues: [{ key: "OPS-35", comments: 3 }], boards: [], tools: [], notes: 0 };
    const turns = messagesToTurns([
      { id: 9, role: "assistant", content: "ok", mode: "deep", totalTokens: 3, createdAt: null, model: "qwen3:8b", read },
      { id: 10, role: "assistant", content: "ok", mode: "deep", totalTokens: 3, createdAt: null },
    ]);

    expect(turns[0].answer?.read).toEqual(read);
    expect(turns[1].answer?.read).toBeNull();
  });

  // R123 : « + » et « @ » joignent une issue ou un projet ; la demande les emporte, et le fil les montre sous elle.
  it("attaches issues and projects to the next request, three at most, each once", () => {
    const issue = (id: number) => ({ kind: "issue" as const, projectId: 3, issueId: id, label: `OPS-${id}`, title: "T" });
    const { attach, detach } = useCortexStore.getState();

    expect(attach(issue(35))).toBe(true);
    expect(attach(issue(35))).toBe(false);
    expect(attach({ kind: "project", projectId: 4, issueId: null, label: "Website", title: null })).toBe(true);
    expect(attach(issue(36))).toBe(true);
    expect(attach(issue(37))).toBe(false);
    expect(useCortexStore.getState().attachments.map((a) => a.label)).toEqual(["OPS-35", "Website", "OPS-36"]);

    detach("project:4");
    expect(useCortexStore.getState().attachments.map((a) => a.label)).toEqual(["OPS-35", "OPS-36"]);
  });

  it("sends what is attached with the request, shows it under the request, and empties the composer", async () => {
    vi.mocked(sendAgentMessage).mockResolvedValue({ conversationId: 7, title: "t", answer: answer("ok") });
    useCortexStore.setState({
      workspace: "acme",
      attachments: [
        { kind: "issue", projectId: 3, issueId: 35, label: "OPS-35", title: "Iteration #35" },
        { kind: "project", projectId: 4, issueId: null, label: "Website", title: null },
      ],
    });
    useCortexStore.getState().setDraft("Summarize OPS-35");

    await expect(useCortexStore.getState().send("acme")).resolves.toBe(true);

    expect(sendAgentMessage).toHaveBeenCalledWith("acme", "Summarize OPS-35", null, null, null,
      [{ projectId: 3, issueId: 35 }, { projectId: 4 }], expect.anything());
    expect(useCortexStore.getState().attachments).toEqual([]);
    expect(useCortexStore.getState().turns[0].attached?.map((a) => a.label)).toEqual(["OPS-35", "Website"]);
  });

  it("leaves the attachments of another workspace behind", () => {
    useCortexStore.setState({
      workspace: "acme", attachments: [{ kind: "project", projectId: 4, issueId: null, label: "Website", title: null }],
    });

    useCortexStore.getState().enterWorkspace("partner");

    expect(useCortexStore.getState().attachments).toEqual([]);
  });

  it("deletes a conversation, and starts afresh when it was the open one", async () => {
    vi.mocked(deleteConversation).mockResolvedValue(undefined);
    useCortexStore.setState({ conversationId: 4, turns: [{ id: "u1", role: "user", text: "x" }], conversations: [summary(4, "a"), summary(5, "b")] });

    await expect(useCortexStore.getState().removeConversation("acme", 5)).resolves.toBe(true);
    expect(useCortexStore.getState().conversationId).toBe(4);
    await expect(useCortexStore.getState().removeConversation("acme", 4)).resolves.toBe(true);
    expect(useCortexStore.getState().conversationId).toBeNull();
    expect(useCortexStore.getState().turns).toEqual([]);
    expect(useCortexStore.getState().conversations).toEqual([]);

    vi.mocked(deleteConversation).mockRejectedValue(new Error("forbidden"));
    useCortexStore.setState({ conversations: [summary(6, "c")] });
    await expect(useCortexStore.getState().removeConversation("acme", 6)).resolves.toBe(false);
    expect(useCortexStore.getState().conversations).toHaveLength(1);
  });

  it("starts a new conversation on demand", () => {
    useCortexStore.setState({ conversationId: 4, tokens: 30, turns: [{ id: "u1", role: "user", text: "x" }] });

    useCortexStore.getState().newConversation();

    expect(useCortexStore.getState()).toMatchObject({ conversationId: null, tokens: 0, turns: [] });
  });

  it("keeps nothing in the browser, not even the draft", () => {
    useCortexStore.getState().setDraft("secret draft");
    useCortexStore.getState().setOpen(true);
    useCortexStore.getState().setOpen(false);

    // localStorage est simulé par la configuration des tests : la conversation, toujours en bas, n'y écrit plus rien.
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("reads an answer without a mode as a fast one", () => {
    const turns = messagesToTurns([{ id: 9, role: "assistant", content: "ok", mode: null, totalTokens: 3, createdAt: null }]);

    expect(turns[0].answer).toMatchObject({ mode: "fast", usage: { totalTokens: 3 } });
  });

  /**
   * Test du CEO de la 1.10.0 : la jauge montrait le cumul de la conversation contre une fenêtre écrite en dur (« 45k / 33k
   * (100%) »). Elle garde ce que le modèle a lu à la dernière demande : son prompt et la fenêtre que la passerelle lui a
   * donnée ; un repli ne mesure rien, une conversation neuve ou rouverte repart sans mesure.
   */
  it("keeps what the model read at the last request, not the sum of the conversation", async () => {
    const measured = (prompt: number, window: number | null, total: number): AssistantAnswer => ({
      ...answer("ok", total), usage: { promptTokens: total - 20, completionTokens: 20, totalTokens: total, lastPromptTokens: prompt, contextWindow: window },
    });
    vi.mocked(sendAgentMessage)
      .mockResolvedValueOnce({ conversationId: 7, title: "t", answer: measured(2900, 8192, 6000) })
      .mockResolvedValueOnce({ conversationId: 7, title: "t", answer: measured(3400, 8192, 7000) })
      .mockResolvedValueOnce({ conversationId: 7, title: "t", answer: { ...answer("fallback", 0), mode: "fallback" } });

    for (const text of ["one", "two", "three"]) {
      useCortexStore.getState().setDraft(text);
      await useCortexStore.getState().send("acme");
    }

    expect(useCortexStore.getState().tokens).toBe(13_000);
    expect(useCortexStore.getState().context).toEqual({ tokens: 3400, window: 8192 });
    useCortexStore.getState().newConversation();
    expect(useCortexStore.getState().context).toBeNull();
  });

  // R114 : la barre envoie ce que la personne voit.
  it("sends the screen: the project of the route and the issue whose sheet is open", async () => {
    vi.mocked(sendAgentMessage).mockResolvedValue({ conversationId: 3, title: "t", answer: answer("ok") });
    window.history.pushState({}, "", "/acme/projects/12");
    useScreenStore.setState({ openIssue: { projectId: 12, issueId: 34 } });
    useCortexStore.getState().setDraft("supprime ça");

    await useCortexStore.getState().send("acme");

    expect(sendAgentMessage).toHaveBeenCalledWith("acme", "supprime ça", null, { projectId: 12, issueId: 34 }, null, [], expect.anything());
    useScreenStore.setState({ openIssue: null });
    window.history.pushState({}, "", "/");
  });

  // R115 : les réponses d'une carte de TaskForce partent ensemble et reprennent le geste ; un refus dit pourquoi.
  const card: AssistantToolCall = {
    name: "create_project", status: "question", input: "{}", output: "", record: "r", ref: "q",
    questions: [
      { field: "name", header: "Name", text: "What should the project be called?", multiple: false, choices: [] },
      { field: "repository", header: "Repository", text: "Where does its code live?", multiple: false, choices: [] },
    ],
  };

  it("sends all the answers of a card at once, typed words trimmed, and returns how the gesture goes on", async () => {
    const next: AssistantToolCall = { name: "create_project", status: "success", input: "{}", output: "Project created.", record: "r" };
    vi.mocked(answerQuestion).mockResolvedValue(next);

    await expect(useCortexStore.getState().answerQuestion("acme", card, [
      { field: "name", values: [], other: "  Atlas " }, { field: "repository", values: ["new-private"], other: "  " },
    ])).resolves.toEqual(next);
    expect(answerQuestion).toHaveBeenCalledWith("acme", card, [
      { field: "name", values: [], other: "Atlas" }, { field: "repository", values: ["new-private"], other: undefined },
    ]);
    expect(useCortexStore.getState().questionProblem).toBeNull();
    // Le geste a abouti après les questions : « Changes » le montre (R122).
    expect(useCortexStore.getState().done).toEqual([next]);
  });

  it("keeps out of Changes what the answers to a card only ask further", async () => {
    vi.mocked(answerQuestion).mockResolvedValue({ ...card, status: "question" });

    await useCortexStore.getState().answerQuestion("acme", card, [{ field: "name", values: ["Atlas"] }]);

    expect(useCortexStore.getState().done).toEqual([]);
  });

  it("returns null with the server's reason when the answers fail, and sends nothing empty", async () => {
    vi.mocked(answerQuestion).mockRejectedValue(httpError(400, { message: "This question is already answered." }));

    await expect(useCortexStore.getState().answerQuestion("acme", card, [{ field: "name", values: ["Atlas"] }])).resolves.toBeNull();
    expect(useCortexStore.getState().questionProblem).toBe("This question is already answered.");
    await expect(useCortexStore.getState().answerQuestion("acme", card, [{ field: "name", values: [], other: "   " }]))
      .resolves.toBeNull();
    await expect(useCortexStore.getState().answerQuestion("", card, [{ field: "name", values: ["Atlas"] }])).resolves.toBeNull();
    expect(answerQuestion).toHaveBeenCalledTimes(1);
  });

  const OFFER = {
    capability: "tools", from: "qwen2.5:7b-instruct", to: "qwen3:8b",
    text: "qwen2.5:7b-instruct failed 1 of 2 test cases for requests that use TaskForce's tools; qwen3:8b passed them all.",
  };

  it("keeps TaskForce's offer of a stronger model with the answer, and sends the request there on a click (R118)", async () => {
    vi.mocked(sendAgentMessage)
      .mockResolvedValueOnce({ conversationId: 7, title: "Move", answer: answer("Done."), escalation: OFFER })
      .mockResolvedValueOnce({ conversationId: 7, title: "Move", answer: answer("Moved ATLAS-3.", 80), sentTo: "qwen3:8b" });
    useCortexStore.getState().setDraft("Move ATLAS-3 to Done");
    await useCortexStore.getState().send("acme");
    const offered = useCortexStore.getState().turns[1];
    expect(offered.escalation).toEqual(OFFER);

    await expect(useCortexStore.getState().escalate("acme", offered.id)).resolves.toBe(true);

    expect(sendAgentMessage).toHaveBeenLastCalledWith("acme", "Move ATLAS-3 to Done", 7, null, "qwen3:8b", null, expect.anything());
    const turns = useCortexStore.getState().turns;
    expect(turns).toHaveLength(4);
    expect(turns[1].escalated).toBe(true);
    expect(turns[2]).toMatchObject({ role: "user", text: "Move ATLAS-3 to Done", sentTo: "qwen3:8b" });
    expect(turns[3]).toMatchObject({ role: "assistant", sentTo: "qwen3:8b" });
    expect(turns[3].answer?.answer).toBe("Moved ATLAS-3.");
    expect(useCortexStore.getState().tokens).toBe(200);
    // Une seule fois : la proposition est faite.
    await expect(useCortexStore.getState().escalate("acme", offered.id)).resolves.toBe(false);
    expect(sendAgentMessage).toHaveBeenCalledTimes(2);
  });

  it("sends nothing without an offer, and shows a failure like any answer", async () => {
    vi.mocked(sendAgentMessage)
      .mockResolvedValueOnce({ conversationId: 7, title: "Move", answer: answer("Done."), escalation: OFFER })
      .mockRejectedValueOnce(httpError(409));
    useCortexStore.getState().setDraft("Move ATLAS-3 to Done");
    await useCortexStore.getState().send("acme");

    await expect(useCortexStore.getState().escalate("acme", "missing")).resolves.toBe(false);
    await expect(useCortexStore.getState().escalate("acme", useCortexStore.getState().turns[0].id)).resolves.toBe(false);
    await expect(useCortexStore.getState().escalate("acme", useCortexStore.getState().turns[1].id)).resolves.toBe(false);

    expect(useCortexStore.getState().turns.at(-1)).toMatchObject({ role: "assistant", kind: "quota" });
    expect(useCortexStore.getState().sentAt).toBeNull();
  });
});

describe("useCortexStore : le compositeur (R134, R135)", () => {
  type Reply = (value: ChatTurnResponse) => void;

  /** Un tour qui attend sa réponse : ce que la personne fait pendant ce temps est testé ici. */
  function waiting() {
    const replies: Reply[] = [];
    vi.mocked(sendAgentMessage).mockImplementation(() => new Promise((resolve) => { replies.push(resolve); }));
    return replies;
  }

  const reply = (text: string): ChatTurnResponse => ({ conversationId: 7, title: "t", answer: answer(text, 40) });
  const stoppedTurn = (toolCalls: AssistantToolCall[] = []): ChatTurnResponse => ({
    conversationId: 7, title: "t", answer: { ...answer("Stopped by you.", 12), mode: "stopped", toolCalls },
  });

  async function sendText(text: string) {
    useCortexStore.getState().setDraft(text);
    return useCortexStore.getState().send("acme");
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useCortexStore.getState().newConversation();
    useCortexStore.setState({
      ...initial, draft: "", workspace: "acme", turns: [], conversations: [], attachments: [], files: [], queue: [], queueHalted: false,
      project: null, projectPinned: false, conversationId: null, sentAt: null, stoppable: false,
    });
    vi.mocked(listConversations).mockResolvedValue([]);
    vi.mocked(stopTurn).mockResolvedValue(null);
  });

  describe("Stop", () => {
    it("stops at once: the client aborts, the turn says so, the server is told by the same name", async () => {
      waiting();
      const sent = sendText("Long question");
      const [, , , , , , options] = vi.mocked(sendAgentMessage).mock.calls[0];
      expect(useCortexStore.getState().stoppable).toBe(true);

      expect(useCortexStore.getState().stop("acme")).toBe(true);

      expect(options?.signal?.aborted).toBe(true);
      expect(stopTurn).toHaveBeenCalledWith("acme", options?.turn);
      const state = useCortexStore.getState();
      expect(state.sentAt).toBeNull();
      expect(state.stoppable).toBe(false);
      expect(state.turns.at(-1)).toMatchObject({ role: "assistant", kind: "stopped" });

      // La réponse abandonnée n'écrit rien.
      vi.mocked(sendAgentMessage).mock.results[0].value.catch(() => undefined);
      await vi.waitFor(() => expect(useCortexStore.getState().turns).toHaveLength(2));
      void sent;
    });

    it("has nothing to stop when no turn runs", () => {
      expect(useCortexStore.getState().stop("acme")).toBe(false);
      expect(stopTurn).not.toHaveBeenCalled();
    });

    it("learns from the server the conversation of a first turn, and its usage", async () => {
      waiting();
      void sendText("first");
      vi.mocked(stopTurn).mockResolvedValue(stoppedTurn());

      useCortexStore.getState().stop("acme");

      await vi.waitFor(() => expect(useCortexStore.getState().conversationId).toBe(7));
      expect(useCortexStore.getState().tokens).toBe(12);
      expect(useCortexStore.getState().turns.at(-1)).toMatchObject({ kind: "stopped" });
    });

    it("shows what had already been done before the stop", async () => {
      waiting();
      void sendText("Move these");
      const call: AssistantToolCall = { name: "update_issue", status: "success", input: "{}", output: "Moved.", record: "r" };
      vi.mocked(stopTurn).mockResolvedValue(stoppedTurn([call]));

      useCortexStore.getState().stop("acme");

      await vi.waitFor(() => expect(useCortexStore.getState().turns.at(-1)?.answer?.toolCalls).toEqual([call]));
      expect(useCortexStore.getState().turns.at(-1)?.kind).toBeUndefined();
    });

    it("keeps its line when the server can't be told", async () => {
      waiting();
      void sendText("q");
      vi.mocked(stopTurn).mockRejectedValue(new Error("down"));

      useCortexStore.getState().stop("acme");

      await vi.waitFor(() => expect(listConversations).toHaveBeenCalled());
      expect(useCortexStore.getState().turns.at(-1)).toMatchObject({ kind: "stopped" });
    });
  });

  describe("after a stop", () => {
    it("waits for what the server says of the stopped turn, so the next message continues the same conversation", async () => {
      let tell: (value: ChatTurnResponse | null) => void = () => undefined;
      vi.mocked(stopTurn).mockReturnValue(new Promise((resolve) => { tell = resolve; }));
      const replies = waiting();
      void sendText("first");
      useCortexStore.getState().stop("acme");

      void sendText("second");
      await Promise.resolve();
      expect(sendAgentMessage).toHaveBeenCalledTimes(1);

      tell(stoppedTurn());
      await vi.waitFor(() => expect(sendAgentMessage).toHaveBeenCalledTimes(2));
      expect(vi.mocked(sendAgentMessage).mock.calls[1][2]).toBe(7);
      replies[1](reply("ok"));
      await vi.waitFor(() => expect(useCortexStore.getState().sentAt).toBeNull());
    });

    it("ignores what the server says once the person is in another conversation", async () => {
      let tell: (value: ChatTurnResponse | null) => void = () => undefined;
      vi.mocked(stopTurn).mockReturnValue(new Promise((resolve) => { tell = resolve; }));
      waiting();
      void sendText("first");
      useCortexStore.getState().stop("acme");
      useCortexStore.getState().newConversation();

      tell(stoppedTurn());
      await vi.waitFor(() => expect(listConversations).toHaveBeenCalled());

      expect(useCortexStore.getState().conversationId).toBeNull();
      expect(useCortexStore.getState().tokens).toBe(0);
    });
  });

  describe("a turn the window stopped waiting for", () => {
    it("fails silently when the person has moved on", async () => {
      let fail: (reason: unknown) => void = () => undefined;
      vi.mocked(sendAgentMessage).mockReturnValue(new Promise((_, reject) => { fail = reject; }));
      void sendText("first");

      useCortexStore.getState().newConversation();
      fail(httpError(500));
      await Promise.resolve();

      expect(useCortexStore.getState().turns).toEqual([]);
      expect(useCortexStore.getState().sentAt).toBeNull();
    });

    it("an offered model can be stopped too, and leaves the conversation alone when the person moves on", async () => {
      vi.mocked(sendAgentMessage).mockResolvedValueOnce({ ...reply("Done."), escalation: { capability: "tools", from: "a", to: "b", text: "t" } });
      await sendText("Move it");
      const offered = useCortexStore.getState().turns[1];
      const replies = waiting();
      const escalating = useCortexStore.getState().escalate("acme", offered.id);
      expect(useCortexStore.getState().stoppable).toBe(true);

      useCortexStore.getState().newConversation();
      replies[0](reply("late"));
      await escalating;

      expect(useCortexStore.getState().turns).toEqual([]);
    });

    it("a failed offer leaves the queue waiting for a click", async () => {
      vi.mocked(sendAgentMessage).mockResolvedValueOnce({ ...reply("Done."), escalation: { capability: "tools", from: "a", to: "b", text: "t" } });
      await sendText("Move it");
      const offered = useCortexStore.getState().turns[1];
      vi.mocked(sendAgentMessage).mockRejectedValueOnce(httpError(500));
      useCortexStore.setState({ queue: [{ id: "q1", text: "next", attachments: [], files: [] }] });

      await useCortexStore.getState().escalate("acme", offered.id);

      expect(useCortexStore.getState().queueHalted).toBe(true);
      expect(useCortexStore.getState().stoppable).toBe(false);
    });
  });

  describe("the queue", () => {
    it("waits while Cortex works, five at most, with what is attached", async () => {
      useCortexStore.setState({ sentAt: Date.now(), attachments: [{ kind: "project", projectId: 4, issueId: null, label: "Website", title: null }] });
      for (const text of ["one", "two", "three", "four", "five"]) {
        useCortexStore.getState().setDraft(text);
        expect(useCortexStore.getState().enqueue()).toBe(true);
      }
      useCortexStore.getState().setDraft("six");

      expect(useCortexStore.getState().enqueue()).toBe(false);
      const state = useCortexStore.getState();
      expect(state.queue.map((message) => message.text)).toEqual(["one", "two", "three", "four", "five"]);
      expect(state.queue[0].attachments.map((a) => a.label)).toEqual(["Website"]);
      expect(state.attachments).toEqual([]);
      expect(state.draft).toBe("six");
    });

    it("leaves when the turn ends, under the person's eyes", async () => {
      const replies = waiting();
      void sendText("first");
      useCortexStore.getState().setDraft("second");
      useCortexStore.getState().enqueue();

      replies[0](reply("answer one"));
      await vi.waitFor(() => expect(sendAgentMessage).toHaveBeenCalledTimes(2));

      const state = useCortexStore.getState();
      expect(state.queue).toEqual([]);
      expect(state.turns.map((t) => t.text ?? t.answer?.answer)).toEqual(["first", "answer one", "second"]);
      expect(state.sentAt).not.toBeNull();
    });

    it("does not go on after a stop: one click sends the next, and only the next", async () => {
      const replies = waiting();
      void sendText("first");
      useCortexStore.getState().setDraft("second");
      useCortexStore.getState().enqueue();
      useCortexStore.getState().setDraft("third");
      useCortexStore.getState().enqueue();

      useCortexStore.getState().stop("acme");
      await Promise.resolve();
      expect(sendAgentMessage).toHaveBeenCalledTimes(1);
      expect(useCortexStore.getState().queueHalted).toBe(true);

      void useCortexStore.getState().sendNext("acme");
      await vi.waitFor(() => expect(sendAgentMessage).toHaveBeenCalledTimes(2));
      expect(useCortexStore.getState().queue.map((m) => m.text)).toEqual(["third"]);

      replies[1](reply("two"));
      await vi.waitFor(() => expect(useCortexStore.getState().sentAt).toBeNull());
      expect(sendAgentMessage).toHaveBeenCalledTimes(2);
      expect(useCortexStore.getState().queueHalted).toBe(true);
    });

    it("does not go on after a failure", async () => {
      vi.mocked(sendAgentMessage).mockRejectedValueOnce(httpError(500));
      useCortexStore.setState({ queue: [{ id: "q1", text: "next", attachments: [], files: [] }] });

      await sendText("first");

      expect(sendAgentMessage).toHaveBeenCalledTimes(1);
      expect(useCortexStore.getState().queueHalted).toBe(true);
      expect(useCortexStore.getState().queue).toHaveLength(1);
    });

    it("removes one message, and stops being halted once empty", () => {
      useCortexStore.setState({ queue: [{ id: "q1", text: "a", attachments: [], files: [] }], queueHalted: true });
      useCortexStore.getState().unqueue("q1");
      expect(useCortexStore.getState().queue).toEqual([]);
      expect(useCortexStore.getState().queueHalted).toBe(false);
    });

    it("has nothing to send without a queue, or while Cortex works", async () => {
      await expect(useCortexStore.getState().sendNext("acme")).resolves.toBe(false);
      useCortexStore.setState({ queue: [{ id: "q1", text: "a", attachments: [], files: [] }], sentAt: Date.now() });
      await expect(useCortexStore.getState().sendNext("acme")).resolves.toBe(false);
      expect(useCortexStore.getState().enqueue()).toBe(false);
    });

    it("keeps its gesture for /compact", async () => {
      vi.mocked(compactConversation).mockResolvedValue({ summarized: 2 });
      useCortexStore.setState({ queue: [{ id: "q1", text: "/compact", attachments: [], files: [] }], queueHalted: true, conversationId: 7 });

      await useCortexStore.getState().sendNext("acme");

      expect(compactConversation).toHaveBeenCalledWith("acme", 7);
      expect(sendAgentMessage).not.toHaveBeenCalled();
    });

    it("stays visible when the person changes conversation, and only a click sends it", async () => {
      const replies = waiting();
      void sendText("first");
      useCortexStore.getState().setDraft("second");
      useCortexStore.getState().enqueue();

      useCortexStore.getState().newConversation();
      replies[0](reply("late"));
      await Promise.resolve();

      const state = useCortexStore.getState();
      expect(state.turns).toEqual([]);
      expect(state.sentAt).toBeNull();
      expect(state.queue).toHaveLength(1);
      expect(state.queueHalted).toBe(true);
      expect(sendAgentMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe("the project of the conversation", () => {
    it("follows the pane until the conversation starts", () => {
      useCortexStore.getState().followPane(12);
      expect(useCortexStore.getState().project).toBe(12);
      useCortexStore.getState().followPane(null);
      expect(useCortexStore.getState().project).toBeNull();
    });

    it("never moves by itself once it has started, or once the person has chosen", async () => {
      vi.mocked(sendAgentMessage).mockResolvedValue({ ...reply("ok"), projectId: 12 });
      useCortexStore.getState().followPane(12);
      await sendText("first");

      useCortexStore.getState().followPane(99);

      expect(useCortexStore.getState().project).toBe(12);
      expect(vi.mocked(sendAgentMessage).mock.calls[0][6]).toMatchObject({ project: 12 });
    });

    it("chooses for a new conversation without calling the server, and stays put", async () => {
      await expect(useCortexStore.getState().chooseProject("acme", 5)).resolves.toBe(true);
      expect(setConversationProject).not.toHaveBeenCalled();

      useCortexStore.getState().followPane(12);

      expect(useCortexStore.getState().project).toBe(5);
    });

    it("keeps the choice of an existing conversation on the server, and in the list", async () => {
      vi.mocked(setConversationProject).mockResolvedValue({ ...summary(7, "t"), projectId: null });
      useCortexStore.setState({ conversationId: 7, project: 5, projectPinned: true, conversations: [{ ...summary(7, "t"), projectId: 5 }] });

      await expect(useCortexStore.getState().chooseProject("acme", null)).resolves.toBe(true);

      expect(setConversationProject).toHaveBeenCalledWith("acme", 7, null);
      expect(useCortexStore.getState().project).toBeNull();
      expect(useCortexStore.getState().conversations[0].projectId).toBeNull();
    });

    it("goes back to what it was when the server refuses", async () => {
      vi.mocked(setConversationProject).mockRejectedValue(new Error("no"));
      useCortexStore.setState({ conversationId: 7, project: 5, projectPinned: true });

      await expect(useCortexStore.getState().chooseProject("acme", 9)).resolves.toBe(false);

      expect(useCortexStore.getState().project).toBe(5);
    });

    it("takes the project of the conversation it reopens", async () => {
      vi.mocked(getConversation).mockResolvedValue({ id: 3, title: "t", totalTokens: 0, messages: [], projectId: 8 });

      await useCortexStore.getState().openConversation("acme", 3);

      expect(useCortexStore.getState().project).toBe(8);
      expect(useCortexStore.getState().projectPinned).toBe(true);
    });

    it("takes the project the person just answered on a card", async () => {
      const card: AssistantToolCall = {
        name: "create_issue", status: "question", input: "{}", output: "", record: "r", ref: "q",
        questions: [{ field: "project", header: "Project", text: "Which project?", multiple: false, choices: [] }],
      };
      vi.mocked(answerQuestion).mockResolvedValue({ ...card, status: "pending", questions: null });
      vi.mocked(listConversations).mockResolvedValue([{ ...summary(7, "t"), projectId: 12 }]);
      useCortexStore.setState({ conversationId: 7 });

      await useCortexStore.getState().answerQuestion("acme", card, [{ field: "project", values: ["SOLO"] }]);

      await vi.waitFor(() => expect(useCortexStore.getState().project).toBe(12));
    });
  });

  describe("files", () => {
    const file = (name: string) => ({ id: name, name, size: 4, text: "body" });

    it("add and remove, five at most", () => {
      const { addFiles, removeFile } = useCortexStore.getState();
      addFiles(["a", "b", "c", "d", "e", "f"].map((name) => file(`${name}.md`)));
      expect(useCortexStore.getState().files).toHaveLength(5);
      removeFile("a.md");
      expect(useCortexStore.getState().files.map((f) => f.name)).toEqual(["b.md", "c.md", "d.md", "e.md"]);
    });

    it("leave with the request, and show under it", async () => {
      vi.mocked(sendAgentMessage).mockResolvedValue(reply("ok"));
      useCortexStore.setState({ files: [file("notes.md")] });

      await sendText("Read this");

      expect(vi.mocked(sendAgentMessage).mock.calls[0][6]).toMatchObject({ files: [{ name: "notes.md", text: "body" }] });
      expect(useCortexStore.getState().files).toEqual([]);
      expect(useCortexStore.getState().turns[0].attached).toEqual([{ label: "notes.md" }]);
    });
  });

  describe("the history", () => {
    it("reads a stopped turn as its quiet line, and a stopped turn with work as an answer", () => {
      const turns = messagesToTurns([
        { id: 1, role: "user", content: "q", mode: null, totalTokens: 0, createdAt: null, files: [{ name: "notes.md" }] },
        { id: 2, role: "assistant", content: "Stopped by you.", mode: "stopped", totalTokens: 0, createdAt: null },
        { id: 3, role: "assistant", content: "Stopped by you. What Cortex had already done shows below.", mode: "stopped", totalTokens: 0, createdAt: null },
      ]);

      expect(turns[0].attached).toEqual([{ label: "notes.md" }]);
      expect(turns[1]).toEqual({ id: "m2", role: "assistant", kind: "stopped" });
      expect(turns[2].answer?.mode).toBe("stopped");
    });
  });

  it("keeps the notice until the person dismisses it", () => {
    useCortexStore.getState().setNotice("Too big.");
    expect(useCortexStore.getState().notice).toBe("Too big.");
    useCortexStore.getState().setNotice(null);
    expect(useCortexStore.getState().notice).toBeNull();
  });
});

describe("useCortexStore : les gestes faits sur leurs cartes, et leur « Undo » partagé (R122)", () => {
  const created: AssistantToolCall = {
    name: "create_issue", status: "success", input: '{"title":"Pricing page"}', output: "Created TF-14", record: "rec-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCortexStore.setState({ ...initial, turns: [], conversations: [], done: [], undos: {} });
  });

  it("keeps a gesture done on its card for Changes, until the conversation changes", () => {
    useCortexStore.getState().noteDone(created);
    expect(useCortexStore.getState().done).toEqual([created]);

    useCortexStore.getState().newConversation();
    expect(useCortexStore.getState().done).toEqual([]);
  });

  it("undoes a gesture once, and both places read the same state", async () => {
    vi.mocked(undoAction).mockResolvedValue({ tool: "create_issue", status: "success", output: "TF-14 is gone." });

    const undone = useCortexStore.getState().undo("acme", created);
    expect(useCortexStore.getState().undos[undoKey(created)]).toEqual({ status: "running" });
    await expect(undone).resolves.toBe(true);

    expect(undoAction).toHaveBeenCalledWith("acme", created);
    expect(useCortexStore.getState().undos[undoKey(created)]).toEqual({ status: "done", output: "TF-14 is gone." });
    // Déjà défait : un second clic, d'ailleurs, ne repart pas.
    await expect(useCortexStore.getState().undo("acme", created)).resolves.toBe(false);
    expect(undoAction).toHaveBeenCalledTimes(1);
  });

  it("says why the server refuses to undo, and lets the person try again", async () => {
    vi.mocked(undoAction).mockRejectedValueOnce(httpError(409, { message: "TF-14 has comments now." }));

    await expect(useCortexStore.getState().undo("acme", created)).resolves.toBe(false);
    expect(useCortexStore.getState().undos[undoKey(created)]).toEqual({ status: "error", output: "TF-14 has comments now." });

    vi.mocked(undoAction).mockResolvedValueOnce({ tool: "create_issue", status: "success", output: "Undone." });
    await expect(useCortexStore.getState().undo("acme", created)).resolves.toBe(true);
    await expect(useCortexStore.getState().undo("", { ...created, record: "other" })).resolves.toBe(false);
  });

  it.each([
    [{ record: "r", ref: "x", name: "update_issue" }, "r:x"],
    [{ record: "r", ref: null, name: "create_issue" }, "r:create_issue"],
    [{ record: null, name: "add_comment" }, ":add_comment"],
  ])("names a gesture by its record and its print: %o", (call, key) => {
    expect(undoKey(call)).toBe(key);
  });
});

describe("useCortexStore : la carte de suppression, son archivage et sa suppression dans « Changes » (R122)", () => {
  const target = { issueId: 55, projectId: 3, key: "TESTTA-2", title: "Fix the footer" };
  const card: AssistantToolCall = {
    name: "delete_issue", status: "pending", input: "{\"issue\":\"TESTTA-2\"}", output: null, record: "rec-9", target,
  };
  const archiveIssue = vi.fn();
  const key = deletionKey(card);

  beforeEach(() => {
    vi.clearAllMocks();
    useCortexStore.setState({ ...initial, turns: [], done: [], deletions: {} });
    useIssueStore.setState({ archiveIssue });
  });

  it("names a card by the record of its answer and the issue it touches", () => {
    expect(key).toBe("rec-9:55");
    expect(deletionKey({ record: null, name: "delete_issue" })).toBe(":delete_issue");
  });

  it("archives the issue, shows it in Changes, and puts it back", async () => {
    archiveIssue.mockResolvedValue({ id: 55 });

    const archiving = useCortexStore.getState().archiveFromCard("acme", card, true);
    expect(useCortexStore.getState().deletions[key]).toEqual({ status: "archiving" });
    await expect(useCortexStore.getState().archiveFromCard("acme", card, true)).resolves.toBe(false);
    await expect(archiving).resolves.toBe(true);
    expect(archiveIssue).toHaveBeenCalledWith("acme", 3, 55, true);
    expect(useCortexStore.getState().deletions[key]).toEqual({ status: "archived" });
    expect(useCortexStore.getState().done).toEqual([expect.objectContaining({ name: "archive_issue", status: "success", target, record: "rec-9" })]);

    await expect(useCortexStore.getState().archiveFromCard("acme", card, false)).resolves.toBe(true);
    expect(archiveIssue).toHaveBeenLastCalledWith("acme", 3, 55, false);
    expect(useCortexStore.getState().deletions[key]).toEqual({ status: "idle" });
    expect(useCortexStore.getState().done).toEqual([]);
  });

  it("says a failed archive, and a failed putting back, keeping where the card was", async () => {
    archiveIssue.mockResolvedValueOnce(null);
    await expect(useCortexStore.getState().archiveFromCard("acme", card, true)).resolves.toBe(false);
    expect(useCortexStore.getState().deletions[key]).toEqual({ status: "idle", failed: { gesture: "archive" } });
    expect(useCortexStore.getState().done).toEqual([]);

    archiveIssue.mockResolvedValueOnce({ id: 55 }).mockResolvedValueOnce(null);
    await useCortexStore.getState().archiveFromCard("acme", card, true);
    await expect(useCortexStore.getState().archiveFromCard("acme", card, false)).resolves.toBe(false);
    expect(useCortexStore.getState().deletions[key]).toEqual({ status: "archived", failed: { gesture: "archive" } });
    expect(useCortexStore.getState().done).toHaveLength(1);
  });

  it("archives nothing without a workspace or an issue", async () => {
    await expect(useCortexStore.getState().archiveFromCard("", card, true)).resolves.toBe(false);
    await expect(useCortexStore.getState().archiveFromCard("acme", { ...card, target: null }, true)).resolves.toBe(false);
    expect(archiveIssue).not.toHaveBeenCalled();
  });

  it("deletes with the person's approval, the deletion taking the archive's place in Changes", async () => {
    archiveIssue.mockResolvedValue({ id: 55 });
    vi.mocked(approveAction).mockResolvedValue({ tool: "delete_issue", status: "success", output: "Deleted TESTTA-2.", ref: "print" });
    await useCortexStore.getState().archiveFromCard("acme", card, true);

    await expect(useCortexStore.getState().deleteFromCard("acme", card)).resolves.toBe(true);
    expect(approveAction).toHaveBeenCalledWith("acme", card);
    expect(useCortexStore.getState().deletions[key]).toEqual({ status: "deleted", output: "Deleted TESTTA-2." });
    expect(useCortexStore.getState().done).toEqual([
      expect.objectContaining({ name: "delete_issue", status: "success", output: "Deleted TESTTA-2.", ref: "print", target }),
    ]);
    // Supprimée : plus aucun geste de cette carte ne part.
    await expect(useCortexStore.getState().deleteFromCard("acme", card)).resolves.toBe(false);
    await expect(useCortexStore.getState().archiveFromCard("acme", card, false)).resolves.toBe(false);
    expect(approveAction).toHaveBeenCalledTimes(1);
  });

  it("keeps the issue when the rules or the server refuse, and says why", async () => {
    vi.mocked(approveAction).mockResolvedValueOnce({ tool: "delete_issue", status: "refused", output: "Not run: the rules refuse it." });
    await expect(useCortexStore.getState().deleteFromCard("acme", card)).resolves.toBe(false);
    expect(useCortexStore.getState().deletions[key]).toEqual({ status: "idle", failed: { gesture: "delete", why: "Not run: the rules refuse it." } });

    vi.mocked(approveAction).mockRejectedValueOnce(httpError(409, { message: "TESTTA-2 has a mission at work" }));
    await expect(useCortexStore.getState().deleteFromCard("acme", card)).resolves.toBe(false);
    expect(useCortexStore.getState().deletions[key]).toEqual({ status: "idle", failed: { gesture: "delete", why: "TESTTA-2 has a mission at work" } });
    expect(useCortexStore.getState().done).toEqual([]);
    await expect(useCortexStore.getState().deleteFromCard("", card)).resolves.toBe(false);
  });
});
