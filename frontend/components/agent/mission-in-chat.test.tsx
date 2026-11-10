import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MissionInChat } from "./mission-in-chat";
import type { AssistantTarget } from "@/lib/api/assistant-service";
import type { DeliveryRun, DeliveryRunActivity } from "@/lib/api/delivery-service";
import { useDeliveryStore } from "@/lib/store/delivery-store";
import { useUserStore } from "@/lib/store/user-store";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, back: vi.fn() }), useParams: () => ({ workspace: "acme" }) }));

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
 * La mission d'une issue dans la conversation (TF-J1-5, R138) : la même chose que la vue du travail en plus petit, et la
 * décision par ses boutons, qui passe par le vrai store (R1 : jamais par un texte).
 */
describe("MissionInChat : la mission d'une issue, dans la conversation", () => {
  const fetchRun = vi.fn();
  const fetchActivity = vi.fn();
  const decideApproval = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ user: { id: "7", email: "pierre@acme.dev", firstName: "Pierre", lastName: "M", displayName: "Pierre" } });
    useDeliveryStore.setState({ runs: { 28: RUN }, activity: { 100: ASKING }, resultErrors: {}, fetchRun, fetchActivity, decideApproval });
  });

  it("says where it is, its current step, and answers a request with its buttons", async () => {
    decideApproval.mockResolvedValue(true);
    render(<MissionInChat slug="acme" target={TARGET} />);

    expect(screen.getByText("Mission of TF-28: Fix the footer links")).toBeInTheDocument();
    expect(fetchRun).toHaveBeenCalledWith("acme", 28);
    expect(screen.getByText("Waiting for you: 1 request")).toBeInTheDocument();
    expect(screen.getByText("Understand: Wants to open nodejs.org")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refuse" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Allow for this mission" }));

    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith("acme", 100, 9, true, true));
  });

  it("stays small: the five steps in five points, no list of commands", () => {
    useDeliveryStore.setState({ activity: { 100: { events: [
      { seq: 1, kind: "tool", tool: "Read", text: "a.ts", at: null },
      { seq: 2, kind: "tool", tool: "Bash", text: "git commit -m x", at: null },
    ], approvals: [] } } });
    render(<MissionInChat slug="acme" target={TARGET} />);

    expect(screen.getByRole("img", { name: "Understand: Done" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Plan: Did not happen" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Do: In progress" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Check: Not started" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Hand over: Not started" })).toBeInTheDocument();
    expect(screen.getByText("Do: Saved the changes")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/git commit|Show activity|Download the record/);
  });

  it("a finished mission sends the person to its view: the conversation doesn't replace it (s10)", () => {
    useDeliveryStore.setState({ runs: { 28: { ...RUN, status: "DONE", summary: "Fixed 3 links.",
      resultUrl: "https://github.com/acme/website/pull/212", endedAt: "2026-11-02T10:04:00", branch: "tf/tf-28", commits: 2 } },
      activity: { 100: { events: [], approvals: [] } } });
    render(<MissionInChat slug="acme" target={TARGET} />);

    expect(screen.getByText("Ready for your review")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Work view" })).toHaveAttribute("href", "/acme/missions/100");
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(screen.queryByText("Fixed 3 links.")).toBeNull();
  });

  it("before it starts, it says what it waits for and no step is at work", () => {
    useDeliveryStore.setState({ runs: { 28: { ...RUN, status: "QUEUED" } }, activity: {} });
    render(<MissionInChat slug="acme" target={TARGET} />);

    expect(screen.getByText("Waiting for your runner to pick it up")).toBeInTheDocument();
    expect(screen.queryByText(/^Understand:/)).toBeNull();
  });

  // Son nom, et le pouls de la mission, ouvrent sa vue du travail dans le volet (R95, point 3).
  it("opens the work view of the mission from its name and from its pulse", () => {
    render(<MissionInChat slug="acme" target={TARGET} />);

    fireEvent.click(screen.getByRole("link", { name: "Mission of TF-28: Fix the footer links" }));
    expect(nav.push).toHaveBeenCalledWith("/acme/missions/100", { scroll: false });
    expect(screen.getByRole("link", { name: "Work view" })).toHaveAttribute("href", "/acme/missions/100");
  });

  it("an issue without a mission shows no card to decide on", () => {
    useDeliveryStore.setState({ runs: { 28: null } });
    render(<MissionInChat slug="acme" target={{ ...TARGET, runId: null }} />);

    expect(screen.getByRole("group", { name: "Mission of TF-28: Fix the footer links" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
