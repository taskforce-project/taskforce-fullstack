import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MissionInChat } from "./mission-in-chat";
import type { AssistantTarget } from "@/lib/api/assistant-service";
import type { DeliveryRun, DeliveryRunActivity } from "@/lib/api/delivery-service";
import { useDeliveryStore } from "@/lib/store/delivery-store";
import { useUserStore } from "@/lib/store/user-store";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TARGET: AssistantTarget = { issueId: 28, projectId: 3, key: "TF-28", title: "Fix the footer links", runId: 100 };

const RUN: DeliveryRun = {
  id: 100, issueId: 28, issueKey: "TF-28", issueTitle: "Fix the footer links", projectId: 3, projectName: "TaskForce",
  providerKey: "claude-code", model: null, status: "RUNNING", summary: null, resultUrl: null, error: null, startedById: 7,
  createdAt: "2026-11-02T10:00:00", updatedAt: "2026-11-02T10:01:00", claimedAt: "2026-11-02T10:00:30", endedAt: null,
  rulesVersion: 12, branch: null, commits: null, tests: null, outcome: null,
};

const ASKING: DeliveryRunActivity = {
  events: [{ seq: 1, kind: "start", tool: null, text: "Claude Code started", at: null }],
  approvals: [{
    id: 9, tool: "WebFetch", summary: "https://nodejs.org", status: "PENDING", createdAt: null,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), decidedAt: null, decidedBy: null, canDecide: true,
    askedBy: "agent", action: "web.fetch", rule: "fetch-web", reason: "An address can carry data out of the machine.",
  }],
};

/**
 * La mission d'une issue dans la conversation (TF-J1-5) : les cartes de la fiche, et la décision par leurs boutons, qui
 * passent par le vrai store (R1 : jamais par un texte).
 */
describe("MissionInChat : la mission d'une issue, dans la conversation", () => {
  const fetchRun = vi.fn();
  const fetchActivity = vi.fn();
  const decideApproval = vi.fn();
  const applyRun = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ user: { id: "7", email: "pierre@acme.dev", firstName: "Pierre", lastName: "M", displayName: "Pierre" } });
    useDeliveryStore.setState({ runs: { 28: RUN }, activity: { 100: ASKING }, resultErrors: {}, fetchRun, fetchActivity,
      decideApproval, applyRun });
  });

  it("a request of the running mission is answered with the buttons of its card", async () => {
    decideApproval.mockResolvedValue(true);
    render(<MissionInChat slug="acme" target={TARGET} />);

    expect(screen.getByText("Mission of TF-28: Fix the footer links")).toBeInTheDocument();
    expect(fetchRun).toHaveBeenCalledWith("acme", 28);
    expect(screen.getByRole("button", { name: "Refuse" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Allow for this mission" }));

    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith("acme", 100, 9, true, true));
  });

  it("the result of a finished mission is decided on its result card", async () => {
    applyRun.mockResolvedValue(true);
    useDeliveryStore.setState({ runs: { 28: { ...RUN, status: "DONE", summary: "Fixed 3 links.",
      resultUrl: "https://github.com/acme/website/pull/212", endedAt: "2026-11-02T10:04:00", branch: "tf/tf-28", commits: 2 } },
      activity: { 100: { events: [], approvals: [] } } });
    render(<MissionInChat slug="acme" target={TARGET} />);

    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(applyRun).toHaveBeenCalledWith("acme", 28, 100, undefined));
  });

  it("an issue without a mission shows no card to decide on", () => {
    useDeliveryStore.setState({ runs: { 28: null } });
    render(<MissionInChat slug="acme" target={{ ...TARGET, runId: null }} />);

    expect(screen.getByRole("group", { name: "Mission of TF-28: Fix the footer links" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
