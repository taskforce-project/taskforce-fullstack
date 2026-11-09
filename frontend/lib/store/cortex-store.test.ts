import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

import { deletionKey, messagesToTurns, undoKey, useCortexStore } from "./cortex-store";
import { CONSTANTS_EN } from "@/lib/constants_en";
import { useIssueStore } from "./issue-store";
import { useScreenStore } from "./screen-store";
import {
  answerQuestion, approveAction, sendAgentMessage, undoAction, type AssistantAnswer, type AssistantToolCall,
} from "@/lib/api/assistant-service";
import {
  compactConversation, deleteConversation, getConversation, listConversations, type ConversationSummary,
} from "@/lib/api/ai-conversation-service";

// Aucun réseau : la réponse de Cortex et les conversations sont simulées ; les erreurs passent par le vrai client.
vi.mock("@/lib/api/assistant-service", () => ({
  sendAgentMessage: vi.fn(), answerQuestion: vi.fn(), undoAction: vi.fn(), approveAction: vi.fn(),
}));
vi.mock("@/lib/api/ai-conversation-service", () => ({
  listConversations: vi.fn(), getConversation: vi.fn(), deleteConversation: vi.fn(), compactConversation: vi.fn(),
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

  it("a refused summary says what the server says, on the line: nothing changed", async () => {
    vi.mocked(compactConversation).mockRejectedValue(httpError(400, { message: "The model returned no summary, so nothing changed in this conversation. Try again." }));

    await expect(useCortexStore.getState().compact("acme")).resolves.toBe(false);

    expect(useCortexStore.getState().turns.at(-1)).toMatchObject({ kind: "compact", compacting: false });
    expect(useCortexStore.getState().turns.at(-1)?.problem).toContain("nothing changed");
    expect(useCortexStore.getState().sentAt).toBeNull();
  });

  it("the monthly limit gets its card, as for an answer", async () => {
    vi.mocked(compactConversation).mockRejectedValue(httpError(409));

    await expect(useCortexStore.getState().compact("acme")).resolves.toBe(false);

    expect(useCortexStore.getState().turns.at(-1)?.kind).toBe("quota");
    expect(useCortexStore.getState().turns.at(-1)?.compacting).toBeUndefined();
  });

  it("a pending line waits where the result will come, and the thread stays whole", async () => {
    const before = [{ id: "u1", role: "user" as const, text: "Hello" }, { id: "a1", role: "assistant" as const, answer: answer("Hi.") }];
    useCortexStore.setState({ turns: before, conversationId: 7 });
    let finish: (done: { summarized: number }) => void = () => {};
    vi.mocked(compactConversation).mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    const compacting = useCortexStore.getState().compact("acme");

    const waiting = useCortexStore.getState().turns;
    expect(waiting.slice(0, 2)).toEqual(before);
    expect(waiting[2]).toMatchObject({ kind: "compact", compacting: true });

    finish({ summarized: 4 });
    await compacting;

    const after = useCortexStore.getState().turns;
    expect(after).toHaveLength(3);
    expect(after[2].id).toBe(waiting[2].id);
    expect(after[2]).toMatchObject({ kind: "compact", compacted: 4, compacting: false });
  });

  it("the line opens the summary, and the gauge takes its new value at once", async () => {
    useCortexStore.setState({ conversationId: 7, context: { tokens: 6000, window: 8192 } });
    vi.mocked(compactConversation).mockResolvedValue({ summarized: 8, summary: "What was said.", contextTokens: 2400, contextWindow: 8192, contextEstimated: true });

    await useCortexStore.getState().compact("acme");

    expect(useCortexStore.getState().turns.at(-1)?.summary).toBe("What was said.");
    expect(useCortexStore.getState().context).toEqual({ tokens: 2400, window: 8192, estimated: true });
  });

  it("nothing compacted keeps the gauge", async () => {
    useCortexStore.setState({ conversationId: 7, context: { tokens: 6000, window: 8192 } });
    vi.mocked(compactConversation).mockResolvedValue({ summarized: 0 });

    await useCortexStore.getState().compact("acme");

    expect(useCortexStore.getState().context).toEqual({ tokens: 6000, window: 8192 });
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

  it("a reopened conversation still opens the summary of its compact line, and keeps its record", () => {
    const [line, said] = messagesToTurns([
      { id: 2, role: "assistant", content: "What was said.", mode: "compact", totalTokens: 0, createdAt: null },
      { id: 3, role: "assistant", content: "Zephyr-7.", mode: "fast", totalTokens: 40, createdAt: null, model: "qwen3:8b",
        read: { issues: [], boards: [], tools: [], notes: 0, record: "r-1" } },
    ]);

    expect(line.summary).toBe("What was said.");
    expect(said.answer?.record).toBe("r-1");
  });

  it("the quiet line of a compacted turn is kept with the answer on reopening", () => {
    const read = { issues: [], boards: [], tools: [], notes: 0, context: { summarized: 8, leftOut: 1, toolResults: 0 } };
    const [turn] = messagesToTurns([{ id: 2, role: "assistant", content: "Zephyr-7.", mode: "fast", totalTokens: 40, createdAt: null, model: "qwen3:8b", read }]);

    expect(turn.answer?.read?.context).toEqual({ summarized: 8, leftOut: 1, toolResults: 0 });
  });
});

describe("useCortexStore : la ligne de travail (R137)", () => {
  beforeEach(() => {
    useCortexStore.setState({ ...initial, turns: [], workStep: null, sentAt: null, conversationId: null });
  });

  const step = (conversationId: number | null, name = "notes") => ({ conversationId, step: name, tool: null });

  it.each([
    ["an answer awaited, a new conversation", 1, null, step(9), true],
    ["an answer awaited, this conversation", 1, 9, step(9), true],
    ["another conversation of the same person", 1, 9, step(10), false],
    ["no answer awaited", null, 9, step(9), false],
  ])("%s", (_, sentAt, conversationId, event, taken) => {
    useCortexStore.setState({ sentAt, conversationId });

    useCortexStore.getState().noteWorkStep(event);

    expect(useCortexStore.getState().workStep).toEqual(taken ? event : null);
  });

  it("the line starts empty for each answer, and ends with it", async () => {
    let finish: (value: never) => void = () => {};
    vi.mocked(sendAgentMessage).mockReturnValue(new Promise((resolve) => { finish = resolve as never; }));
    useCortexStore.setState({ workStep: step(1), draft: "Hello there" });

    const sending = useCortexStore.getState().send("acme");
    expect(useCortexStore.getState().workStep).toBeNull();

    useCortexStore.getState().noteWorkStep(step(null, "thinking"));
    expect(useCortexStore.getState().workStep?.step).toBe("thinking");

    finish({ conversationId: 3, title: "t", answer: answer("Done.") } as never);
    await sending;
    expect(useCortexStore.getState().workStep).toBeNull();
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
    expect(sendAgentMessage).toHaveBeenCalledWith("acme", "Which issues are blocked?", null);
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

    expect(vi.mocked(sendAgentMessage).mock.calls[1]).toEqual(["acme", "second", 7]);
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
    [500, {}, { answer: { answer: CONSTANTS_EN.thread.failServer } }],
    [400, { message: "Invalid input data", validationErrors: { message: ["This message is too long."] } }, { answer: { answer: "This message is too long." } }],
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
      [{ projectId: 3, issueId: 35 }, { projectId: 4 }]);
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

    expect(sendAgentMessage).toHaveBeenCalledWith("acme", "supprime ça", null, { projectId: 12, issueId: 34 });
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

    expect(sendAgentMessage).toHaveBeenLastCalledWith("acme", "Move ATLAS-3 to Done", 7, null, "qwen3:8b");
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
