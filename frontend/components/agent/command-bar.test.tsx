import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";

import { CommandBar, CORTEX_PANEL_ID } from "./command-bar";
import { sendAgentMessage } from "@/lib/api/assistant-service";
import { listConversations } from "@/lib/api/ai-conversation-service";
import { CORTEX_HEIGHT, useCortexStore } from "@/lib/store/cortex-store";
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

describe("CommandBar : la conversation se déplie depuis la barre", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCortexStore.setState({ ...initial, draft: "", workspace: null, turns: [], conversations: [], open: false, place: "bar", unread: false, sentAt: null });
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

  it("unfolds the answer right above the bar, which becomes the reply box", async () => {
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
    // Dépliée, la conversation est le contexte : plus de suggestions sous la barre.
    expect(screen.queryByRole("button", { name: "Create an issue" })).toBeNull();
  });

  it("folds with Escape and unfolds the same conversation again", async () => {
    useCortexStore.setState({ workspace: "acme", open: true, turns: [{ id: "u1", role: "user", text: "What changed this week?" }] });
    render(<CommandBar />);
    expect(screen.getByRole("region", { name: "Conversation with Cortex" })).toBeTruthy();

    fireEvent.keyDown(screen.getByLabelText("What do you want done?"), { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("region", { name: "Conversation with Cortex" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Show the conversation with Cortex" }));
    expect(await screen.findByRole("region", { name: "Conversation with Cortex" })).toHaveTextContent("What changed this week?");
  });

  it("tells when an answer waits while the conversation is folded", () => {
    useCortexStore.setState({ workspace: "acme", unread: true, turns: [{ id: "u1", role: "user", text: "x" }] });
    render(<CommandBar />);

    fireEvent.click(screen.getByRole("button", { name: "A new answer from Cortex is waiting" }));

    expect(useCortexStore.getState()).toMatchObject({ open: true, unread: false });
  });

  it("pins the conversation to the side, and brings it back to the bar", async () => {
    useCortexStore.setState({ workspace: "acme", open: true });
    render(<CommandBar />);

    fireEvent.click(screen.getByRole("button", { name: "Pin to the side" }));

    expect(useCortexStore.getState().place).toBe("side");
    expect(usePanelStore.getState().panels.map((p) => p.id)).toEqual([CORTEX_PANEL_ID]);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Conversation with Cortex" })).toBeNull());

    // Le panneau fermé par sa croix : la conversation est repliée, la barre peut la rouvrir à droite.
    usePanelStore.getState().closePanel(CORTEX_PANEL_ID);
    await waitFor(() => expect(useCortexStore.getState().open).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Show the conversation with Cortex" }));
    expect(usePanelStore.getState().panels.map((p) => p.id)).toEqual([CORTEX_PANEL_ID]);
  });

  it("sends from the bar into the side panel when it is pinned there", async () => {
    vi.mocked(sendAgentMessage).mockResolvedValue(answerWith("Done."));
    useCortexStore.setState({ place: "side" });
    render(<CommandBar />);
    const input = screen.getByLabelText("What do you want done?");

    fireEvent.change(input, { target: { value: "Summarize the decisions" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(usePanelStore.getState().panels.map((p) => p.id)).toEqual([CORTEX_PANEL_ID]);
    await waitFor(() => expect(sendAgentMessage).toHaveBeenCalledWith("acme", "Summarize the decisions", null));
    expect(screen.queryByRole("region", { name: "Conversation with Cortex" })).toBeNull();
  });

  it("resizes the conversation from its top edge with the keyboard", () => {
    useCortexStore.setState({ workspace: "acme", open: true, height: CORTEX_HEIGHT.initial });
    render(<CommandBar />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Resize the conversation" }), { key: "ArrowUp" });

    expect(useCortexStore.getState().height).toBe(CORTEX_HEIGHT.initial + 40);
  });
});
