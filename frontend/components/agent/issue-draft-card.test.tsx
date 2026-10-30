import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { IssueDraftCard } from "./issue-draft-card";
import { approveAction, undoAction, type AssistantToolCall } from "@/lib/api/assistant-service";
import { listStatuses, type IssueStatus } from "@/lib/api/issue-service";
import type { Project } from "@/lib/api/project-service";
import { useProjectStore } from "@/lib/store/project-store";

// Aucun réseau : l'accord, l'annulation et les colonnes sont simulés ; les projets viennent du vrai store.
vi.mock("@/lib/api/assistant-service", () => ({ approveAction: vi.fn(), undoAction: vi.fn() }));
vi.mock("@/lib/api/issue-service", () => ({ listStatuses: vi.fn() }));

const RECORD = "00000000-0000-0000-0000-0000000000aa";

const call = (input: Record<string, unknown>): AssistantToolCall => ({
  name: "create_issue", status: "pending", input: JSON.stringify(input), output: "prepared", record: RECORD,
});

const project = (over: Partial<Project>): Project => ({ id: 3, name: "Website", identifier: "WEB", isPublic: true, ...over } as Project);

const COLUMNS = [
  { id: 1, name: "Backlog", category: "BACKLOG", isDefault: false, color: "", position: 0 },
  { id: 2, name: "In progress", category: "STARTED", isDefault: false, color: "", position: 1 },
] as IssueStatus[];

describe("IssueDraftCard : l'issue que Cortex prépare (R78)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ projects: [project({}), project({ id: 5, name: "API Platform", identifier: "API", isPublic: false })] });
    vi.mocked(listStatuses).mockResolvedValue(COLUMNS);
  });

  it("shows what Cortex prepared, without creating anything", async () => {
    render(<IssueDraftCard slug="acme" call={call({
      project: "WEB", title: "Pricing page", description: "Show the plans.",
      subtasks: ["Plan table", "Link from the menu"], dueDate: "2099-11-06",
    })} />);

    expect(screen.getByText("New issue, prepared by Cortex")).toBeTruthy();
    expect(screen.getByText("Website (WEB)")).toBeTruthy();
    expect(screen.getByText("Pricing page")).toBeTruthy();
    expect(screen.getByText("Plan table · Link from the menu")).toBeTruthy();
    expect(screen.getByText("Workspace")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Backlog")).toBeTruthy());
    expect(listStatuses).toHaveBeenCalledWith("acme", 3);
    expect(approveAction).not.toHaveBeenCalled();
  });

  it("creates the issue with what the person changed, then offers Undo", async () => {
    vi.mocked(approveAction).mockResolvedValue({
      tool: "create_issue", status: "success", output: "Created WEB-14 \"Pricing plans\" in the project Website, in the column Backlog.",
    });
    vi.mocked(undoAction).mockResolvedValue({ tool: "create_issue", status: "success", output: "Removed WEB-14 \"Pricing plans\"." });
    render(<IssueDraftCard slug="acme" call={call({ project: "web", title: "Pricing page" })} />);
    await waitFor(() => expect(listStatuses).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Pricing plans" } });
    fireEvent.change(screen.getByLabelText("Subtasks"), { target: { value: "Plan table\n\nFAQ" } });
    fireEvent.click(screen.getByRole("button", { name: "Create issue" }));

    await waitFor(() => expect(screen.getByText(/Created WEB-14/)).toBeTruthy());
    const sent = vi.mocked(approveAction).mock.calls[0][1];
    expect(sent.record).toBe(RECORD);
    expect(JSON.parse(sent.input ?? "{}")).toEqual({ project: "WEB", title: "Pricing plans", subtasks: ["Plan table", "FAQ"] });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.getByText(/Undone\. Removed WEB-14/)).toBeTruthy());
  });

  it("asks for a project Cortex couldn't find, and creates nothing before", async () => {
    render(<IssueDraftCard slug="acme" call={call({ project: "Mobile", title: "Pricing page" })} />);

    expect(screen.getByText("Choose the project first.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create issue" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "API" } });

    await waitFor(() => expect(listStatuses).toHaveBeenCalledWith("acme", 5));
    expect(screen.getByText("Collaborators only")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create issue" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([
    ["a title left empty", { title: "" }, "An issue needs a title."],
    ["a due date in the past", { title: "T", dueDate: "2020-01-01" }, "The due date is in the past."],
  ])("blocks %s", async (_label, fields, text) => {
    render(<IssueDraftCard slug="acme" call={call({ project: "WEB", ...fields })} />);

    expect(screen.getByText(text)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create issue" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("names a column the project doesn't have", async () => {
    render(<IssueDraftCard slug="acme" call={call({ project: "WEB", title: "T", status: "Done" })} />);

    await waitFor(() => expect(screen.getByText("This column isn't in the project anymore: choose another one.")).toBeTruthy());
  });

  it.each([
    ["the tool's own problem", { tool: "create_issue", status: "success" as const, output: "There is no column \"Done\"." }],
    ["a refusal by the rules", { tool: "create_issue", status: "refused" as const, output: "Refused by a rule." }],
  ])("shows %s instead of a creation", async (_label, result) => {
    vi.mocked(approveAction).mockResolvedValue(result);
    render(<IssueDraftCard slug="acme" call={call({ project: "WEB", title: "Pricing page" })} />);

    fireEvent.click(screen.getByRole("button", { name: "Create issue" }));

    await waitFor(() => expect(screen.getByText(result.output)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("shows why the server refused the approval", async () => {
    vi.mocked(approveAction).mockRejectedValue(new Error("This proposal is no longer waiting for an approval."));
    render(<IssueDraftCard slug="acme" call={call({ project: "WEB", title: "Pricing page" })} />);

    fireEvent.click(screen.getByRole("button", { name: "Create issue" }));

    await waitFor(() => expect(screen.getByText(/no longer waiting/)).toBeTruthy());
  });

  it("loads the projects when the store has none", () => {
    const fetchProjects = vi.fn().mockResolvedValue([]);
    useProjectStore.setState({ projects: [], fetchProjects });

    render(<IssueDraftCard slug="acme" call={call({ project: "WEB", title: "T" })} />);

    expect(fetchProjects).toHaveBeenCalledWith("acme");
  });
});
