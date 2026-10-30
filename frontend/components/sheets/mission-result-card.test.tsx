import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MissionResultCard } from "./mission-result-card";
import type { DeliveryRun } from "@/lib/api/delivery-service";
import { useDeliveryStore } from "@/lib/store/delivery-store";
import { useUserStore } from "@/lib/store/user-store";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const RUN: DeliveryRun = {
  id: 100, issueId: 28, issueKey: "TF-28", issueTitle: "Fix the footer links", projectId: 3, projectName: "TaskForce",
  providerKey: "claude-code", model: null, status: "DONE", summary: "Fixed 3 links in the footer.",
  resultUrl: "https://github.com/acme/website/pull/212", error: null, startedById: 7,
  createdAt: "2026-10-30T10:00:00", updatedAt: "2026-10-30T10:05:00", claimedAt: "2026-10-30T10:01:00",
  endedAt: "2026-10-30T10:04:30", rulesVersion: 12, branch: "tf/tf-28", commits: 2,
  tests: { command: "npm test", ran: true, passed: true, passedCount: 12, total: 12 }, outcome: null,
};

/** La personne qui regarde la carte. */
function viewer(id: number) {
  useUserStore.setState({ user: { id: String(id), email: "ada@acme.dev", firstName: "Ada", lastName: "L", displayName: "Ada" } });
}

function show(run: DeliveryRun | null = RUN) {
  render(<MissionResultCard slug="acme" issueId={28} issueKey="TF-28" issueTitle="Fix the footer links" responsible="Pierre" />);
  return run;
}

describe("MissionResultCard : la carte de résultat d'une mission (R78, Relire)", () => {
  const applyRun = vi.fn();
  const discardRun = vi.fn();
  const retryRun = vi.fn();
  const downloadEvidence = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    viewer(7);
    useDeliveryStore.setState({
      runs: { 28: RUN }, activity: {}, resultErrors: {}, applyRun, discardRun, retryRun, downloadEvidence,
    });
  });

  it("shows the result, the checks from the record and what will change", () => {
    show();

    expect(screen.getByText("Pierre is responsible · delegated to Claude Code · 4 min")).toBeInTheDocument();
    expect(screen.getByText("Pull request #212 on acme/website.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the pull request/ })).toHaveAttribute("href", RUN.resultUrl);
    expect(screen.getByText("12 of 12 passed")).toBeInTheDocument();
    expect(screen.getByText("Merge pull request #212 on GitHub")).toBeInTheDocument();
    expect(screen.getByText("final")).toBeInTheDocument();
    expect(screen.getByText("Move TF-28 to Done")).toBeInTheDocument();
    expect(screen.getByText("Fixed 3 links in the footer.")).toBeInTheDocument();
  });

  it("Apply goes through the store", async () => {
    applyRun.mockResolvedValue(true);
    show();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(applyRun).toHaveBeenCalledWith("acme", 28, 100));
  });

  it("Discard goes through the store", async () => {
    discardRun.mockResolvedValue(true);
    show();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(discardRun).toHaveBeenCalledWith("acme", 28, 100));
  });

  it("Try again asks for a note, then sends it", async () => {
    retryRun.mockResolvedValue({ ...RUN, id: 101, status: "QUEUED" });
    show();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Try again" }), { target: { value: "Keep the Privacy link" } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(retryRun).toHaveBeenCalledWith("acme", 28, 100, "Keep the Privacy link"));
  });

  it("Cancel closes the note without retrying", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(retryRun).not.toHaveBeenCalled();
  });

  it("a teammate sees the result, not the gestures", () => {
    viewer(8);
    show();

    expect(screen.getByText("12 of 12 passed")).toBeInTheDocument();
    expect(screen.getByText("Only the person who delegated this task can apply, discard or try again.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
  });

  it("shows why the server refused", () => {
    useDeliveryStore.setState({ resultErrors: { 100: "GitHub can't merge pull request #212 on acme/website right now." } });
    show();

    expect(screen.getByText(/GitHub can't merge pull request #212/)).toBeInTheDocument();
  });

  it("can't apply a result without a pull request", () => {
    useDeliveryStore.setState({ runs: { 28: { ...RUN, resultUrl: null } } });
    show();

    expect(screen.getByText("2 commits on the branch tf/tf-28, without a pull request.")).toBeInTheDocument();
    expect((screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("downloads the record from How it was done", async () => {
    show();

    fireEvent.click(screen.getByText("How it was done"));
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));

    await waitFor(() => expect(downloadEvidence).toHaveBeenCalledWith("acme", 100, "md"));
    expect(screen.getByText("Rules v12 · 0 steps · 0 requests, 0 answered")).toBeInTheDocument();
  });

  it.each([
    ["a mission still running", { ...RUN, status: "RUNNING" as const }],
    ["a result already applied", { ...RUN, outcome: "APPLIED" as const }],
  ])("shows nothing for %s", (_label, run) => {
    useDeliveryStore.setState({ runs: { 28: run } });
    const { container } = render(<MissionResultCard slug="acme" issueId={28} issueKey="TF-28" issueTitle="x" responsible={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
