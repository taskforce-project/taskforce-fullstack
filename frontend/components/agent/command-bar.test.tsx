import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";

import { CommandBar } from "./command-bar";
import { sendAgentMessage, type AssistantAnswer } from "@/lib/api/assistant-service";
import { listConversations } from "@/lib/api/ai-conversation-service";
import { useCortexStore, type CortexTurn } from "@/lib/store/cortex-store";
import { usePanelStore } from "@/lib/store/panel-store";

// Aucun réseau : la réponse de Cortex, les conversations, l'état de l'IA et les outils connectés sont simulés.
vi.mock("next/navigation", () => ({
  usePathname: () => "/acme/projects/3",
  useParams: () => ({ workspace: "acme" }),
}));
vi.mock("@/lib/api/assistant-service", () => ({
  sendAgentMessage: vi.fn(),
  approveAction: vi.fn(),
  isApprovable: () => false,
  isPreparedIssue: () => false,
  isUndoable: () => false,
}));
vi.mock("@/lib/api/ai-conversation-service", () => ({
  listConversations: vi.fn(), getConversation: vi.fn(), deleteConversation: vi.fn(),
}));
vi.mock("@/lib/api/ai-status-service", () => ({ getAiStatus: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/api/integration-service", () => ({ getMcpServers: vi.fn().mockResolvedValue([]) }));

// Le dépli et le repli sont instantanés en test : happy-dom annule les animations du navigateur, ce qui laisserait des
// rejets non gérés après le repli.
MotionGlobalConfig.skipAnimations = true;

const initial = useCortexStore.getState();

function answerWith(text: string) {
  return {
    conversationId: 12, title: "Blocked issues",
    answer: {
      answer: text, reasoning: null, mode: "fast" as const, sources: [{ title: "Runbook", domain: "RUNBOOKS", score: null }],
      steps: [], toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    },
  };
}

const said = (id: string, text: string): CortexTurn => ({ id, role: "user", text });
const answered = (id: string, text: string): CortexTurn => ({
  id, role: "assistant",
  answer: { ...answerWith(text).answer, sources: [] } satisfies AssistantAnswer,
});

/** Le tour qui porte ce texte, tel que la conversation l'enveloppe (sa taille et son ton se lisent sur ses classes). */
function turnWith(text: string): HTMLElement | null {
  return screen.getByText(text).closest<HTMLElement>("[data-role]")?.parentElement?.parentElement ?? null;
}

describe("CommandBar : la barre flotte, la conversation s'ouvre au-dessus, sans carte, toujours en bas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCortexStore.setState({ ...initial, draft: "", workspace: null, turns: [], conversations: [], open: false, unread: false, sentAt: null });
    usePanelStore.setState({ panels: [] });
    vi.mocked(listConversations).mockResolvedValue([]);
  });

  it("says what can be asked here, and a suggestion only fills the bar", () => {
    render(<CommandBar />);

    fireEvent.click(screen.getByRole("button", { name: "Create an issue" }));

    expect(screen.getByLabelText("What do you want done?")).toHaveValue("Create an issue ");
    expect(sendAgentMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Conversation with Cortex" })).toBeNull();
  });

  it("keeps the suggestions out of the way while the person writes", () => {
    render(<CommandBar />);
    const input = screen.getByLabelText("What do you want done?");

    fireEvent.change(input, { target: { value: "Move the login issue to Done" } });
    expect(screen.queryByRole("group", { name: "Suggestions for this screen" })).toBeNull();

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByRole("group", { name: "Suggestions for this screen" })).toBeTruthy();
  });

  it("opens the answer right above the bar, which becomes the reply box", async () => {
    vi.mocked(sendAgentMessage).mockResolvedValue(answerWith("Two issues are blocked."));
    render(<CommandBar />);
    const input = screen.getByLabelText("What do you want done?");

    fireEvent.change(input, { target: { value: "Which issues are blocked?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const conversation = await screen.findByRole("region", { name: "Conversation with Cortex" });
    expect(conversation).toHaveTextContent("Which issues are blocked?");
    await waitFor(() => expect(conversation).toHaveTextContent("Two issues are blocked."));
    expect(sendAgentMessage).toHaveBeenCalledWith("acme", "Which issues are blocked?", null);
    expect(input).toHaveAttribute("placeholder", "Reply to Cortex…");
    // Dépliée, la conversation est le contexte : plus de suggestions sous la barre, et les sources restent repliées.
    expect(screen.queryByRole("button", { name: "Create an issue" })).toBeNull();
    expect(screen.queryByText("Runbook")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Sources \(1\)/ }));
    expect(screen.getByText("Runbook")).toBeTruthy();
  });

  it("minimizes with Escape and opens the same conversation again", async () => {
    useCortexStore.setState({ workspace: "acme", open: true, turns: [{ id: "u1", role: "user", text: "What changed this week?" }] });
    render(<CommandBar />);
    expect(screen.getByRole("region", { name: "Conversation with Cortex" })).toBeTruthy();

    fireEvent.keyDown(screen.getByLabelText("What do you want done?"), { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("region", { name: "Conversation with Cortex" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Show the conversation with Cortex" }));
    expect(await screen.findByRole("region", { name: "Conversation with Cortex" })).toHaveTextContent("What changed this week?");
  });

  it("minimizes from the conversation's own chevron, back into the bar", async () => {
    useCortexStore.setState({ workspace: "acme", open: true, turns: [{ id: "u1", role: "user", text: "What changed this week?" }] });
    render(<CommandBar />);

    fireEvent.click(screen.getByRole("button", { name: "Minimize (Esc)" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Conversation with Cortex" })).toBeNull());
    expect(useCortexStore.getState().open).toBe(false);
    expect(screen.getByRole("button", { name: "Show the conversation with Cortex" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("What do you want done?")).toHaveFocus();
  });

  it("stays at the bottom: nothing pins it to the side, sending opens no panel", async () => {
    vi.mocked(sendAgentMessage).mockResolvedValue(answerWith("Done."));
    useCortexStore.setState({ workspace: "acme", open: true });
    render(<CommandBar />);
    const input = screen.getByLabelText("What do you want done?");

    expect(screen.queryByRole("button", { name: /side/i })).toBeNull();
    fireEvent.change(input, { target: { value: "Summarize the decisions" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "Conversation with Cortex" })).toHaveTextContent("Done."));
    expect(usePanelStore.getState().panels).toEqual([]);
  });

  it("is not modal: only its text catches the pointer, the screen above stays clickable", () => {
    useCortexStore.setState({ workspace: "acme", open: true });
    render(<CommandBar />);

    const conversation = screen.getByRole("region", { name: "Conversation with Cortex" });
    // Ni carte ni voile : la conversation passe au-dessus de l'écran dans une couche qui laisse passer les clics, et son
    // dégradé n'en capte aucun (`.cortex-wash`, pointer-events: none dans globals.css).
    expect(conversation).toHaveClass("pointer-events-auto");
    expect(conversation.parentElement?.parentElement).toHaveClass("pointer-events-none");
    expect(conversation.parentElement?.parentElement?.querySelector(".cortex-wash")).toHaveAttribute("aria-hidden", "true");
  });

  it("reads the latest answer large, and the turns before its request smaller", () => {
    useCortexStore.setState({
      workspace: "acme", open: true,
      turns: [said("u1", "Which issues are blocked?"), answered("a1", "Two issues are blocked."), said("u2", "Who owns them?"), answered("a2", "Ada owns both.")],
    });
    render(<CommandBar />);

    expect(turnWith("Ada owns both.")).toHaveClass("cortex-latest");
    expect(turnWith("Who owns them?")).not.toHaveClass("cortex-earlier");
    expect(turnWith("Two issues are blocked.")).toHaveClass("cortex-earlier");
    expect(turnWith("Which issues are blocked?")).toHaveClass("cortex-earlier");
  });

  it("keeps the large type for the answer, not for the request that waits for one", () => {
    useCortexStore.setState({
      workspace: "acme", open: true, sentAt: Date.now(),
      turns: [said("u1", "Which issues are blocked?"), answered("a1", "Two issues are blocked."), said("u2", "Who owns them?")],
    });
    render(<CommandBar />);

    expect(screen.getByRole("region", { name: "Conversation with Cortex" }).querySelector(".cortex-latest")).toBeNull();
    expect(turnWith("Two issues are blocked.")).toHaveClass("cortex-earlier");
    expect(turnWith("Who owns them?")).not.toHaveClass("cortex-earlier");
  });

  it("keeps the conversation and the bar clear of a panel open on the right", () => {
    usePanelStore.getState().openPanel({ id: "workflows", title: "AI Workflows", content: null });
    useCortexStore.setState({ workspace: "acme", open: true });
    render(<CommandBar />);

    const room = screen.getByRole("region", { name: "Conversation with Cortex" }).closest<HTMLElement>("[style*='--cortex-right']");
    expect(room?.style.getPropertyValue("--cortex-right")).toBe("420px");
    expect(room?.style.getPropertyValue("--cortex-left")).toBe("0px");
  });

  it("tells when an answer waits while the conversation is folded", () => {
    useCortexStore.setState({ workspace: "acme", unread: true, turns: [{ id: "u1", role: "user", text: "x" }] });
    render(<CommandBar />);

    fireEvent.click(screen.getByRole("button", { name: "A new answer from Cortex is waiting" }));

    expect(useCortexStore.getState()).toMatchObject({ open: true, unread: false });
  });

});
