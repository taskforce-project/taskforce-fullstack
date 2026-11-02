import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

import { messagesToTurns, useCortexStore } from "./cortex-store";
import { sendAgentMessage, type AssistantAnswer } from "@/lib/api/assistant-service";
import {
  deleteConversation, getConversation, listConversations, type ConversationSummary,
} from "@/lib/api/ai-conversation-service";

// Aucun réseau : la réponse de Cortex et les conversations sont simulées ; les erreurs passent par le vrai client.
vi.mock("@/lib/api/assistant-service", () => ({ sendAgentMessage: vi.fn() }));
vi.mock("@/lib/api/ai-conversation-service", () => ({
  listConversations: vi.fn(), getConversation: vi.fn(), deleteConversation: vi.fn(),
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
});
