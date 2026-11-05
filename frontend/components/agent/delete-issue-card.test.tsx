import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DeleteIssueCard } from "./delete-issue-card";
import { approveAction, type AssistantTarget, type AssistantToolCall } from "@/lib/api/assistant-service";
import type { Issue } from "@/lib/api/issue-service";
import { useIssueStore } from "@/lib/store/issue-store";

// Aucun réseau : l'accord est simulé ; l'archivage passe par le vrai store, son action simulée.
vi.mock("@/lib/api/assistant-service", () => ({ approveAction: vi.fn() }));

const RECORD = "00000000-0000-0000-0000-0000000000aa";
const TARGET: AssistantTarget = {
  issueId: 55, projectId: 3, key: "TESTTA-2", title: "Fix the footer", comments: 3, checklist: 1, mission: "DONE", archived: false,
};
const CALL: AssistantToolCall = {
  name: "delete_issue", status: "pending", input: "{\"issue\":\"TESTTA-2\"}", output: "Deleting TESTTA-2...", record: RECORD,
  target: TARGET,
};

function show(target: AssistantTarget = TARGET) {
  render(<DeleteIssueCard slug="acme" call={{ ...CALL, target }} target={target} />);
}

/** « Supprime testta 2 » (TF-J1-5) : la carte dit ce qui partirait, archiver d'abord, supprimer d'un clic (R1). */
describe("DeleteIssueCard : supprimer une issue depuis la conversation", () => {
  const archiveIssue = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useIssueStore.setState({ archiveIssue });
  });

  it("says the issue and what goes with it, and deletes nothing before a click", () => {
    show();

    expect(screen.getByRole("group", { name: "Delete TESTTA-2: Fix the footer?" })).toBeInTheDocument();
    expect(screen.getByText("Goes with it: 3 comments, a checklist of 1 item, its mission and the mission's record."))
      .toBeInTheDocument();
    expect(approveAction).not.toHaveBeenCalled();
    expect(archiveIssue).not.toHaveBeenCalled();
  });

  it("Archive hides the issue, and Undo puts it back", async () => {
    archiveIssue.mockResolvedValue({ id: 55 } as Issue);
    show();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(screen.getByText("Archived: TESTTA-2 no longer shows on the board.")).toBeInTheDocument());
    expect(archiveIssue).toHaveBeenCalledWith("acme", 3, 55, true);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(archiveIssue).toHaveBeenCalledWith("acme", 3, 55, false));
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("a failed archive says so and keeps the choice", async () => {
    archiveIssue.mockResolvedValue(null);
    show();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(screen.getByText("Couldn't archive the issue. Try again in a moment.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("Delete sends the approval with the record of the answer, and says what went", async () => {
    vi.mocked(approveAction).mockResolvedValue({ tool: "delete_issue", status: "success",
      output: "Deleted TESTTA-2 \"Fix the footer\", with its 3 comments." });
    show();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByText("Deleted TESTTA-2 \"Fix the footer\", with its 3 comments.")).toBeInTheDocument());
    expect(approveAction).toHaveBeenCalledWith("acme", expect.objectContaining({ name: "delete_issue", record: RECORD }));
  });

  it.each([
    ["the rules refuse it now", () => vi.mocked(approveAction).mockResolvedValue({ tool: "delete_issue", status: "refused",
      output: "Not run: the rules of this workspace refuse it." }), "Nothing was deleted: Not run: the rules of this workspace refuse it."],
    ["the server refuses it", () => vi.mocked(approveAction).mockRejectedValue(new Error("TESTTA-2 has a mission at work")),
      "Nothing was deleted: TESTTA-2 has a mission at work"],
  ])("when %s, nothing is deleted and the card says why", async (_label, arrange, said) => {
    arrange();
    show();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByText(said)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("an issue already archived only offers Delete, and nothing else goes with a bare issue", () => {
    show({ ...TARGET, archived: true, comments: 0, checklist: 0, mission: null });

    expect(screen.getByText("TESTTA-2 is already archived.")).toBeInTheDocument();
    expect(screen.getByText("Nothing else goes with it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });
});
