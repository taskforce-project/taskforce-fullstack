import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { IssueDraftCard } from "./issue-draft-card";
import { approveAction, undoAction, type AssistantToolCall } from "@/lib/api/assistant-service";
import { listCycles, type Cycle } from "@/lib/api/cycle-service";
import { listStatuses, type IssueStatus } from "@/lib/api/issue-service";
import { listLabels, type ProjectLabel } from "@/lib/api/label-service";
import { listProjectMembers, type Project, type ProjectMember } from "@/lib/api/project-service";
import { useProjectStore } from "@/lib/store/project-store";

// Aucun réseau : l'accord, l'annulation, les colonnes, les membres, les labels et les cycles sont simulés ; les projets
// viennent du vrai store.
vi.mock("@/lib/api/assistant-service", () => ({ approveAction: vi.fn(), undoAction: vi.fn() }));
vi.mock("@/lib/api/issue-service", () => ({ listStatuses: vi.fn() }));
vi.mock("@/lib/api/label-service", () => ({ listLabels: vi.fn() }));
vi.mock("@/lib/api/cycle-service", () => ({ listCycles: vi.fn() }));
vi.mock("@/lib/api/project-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/project-service")>()),
  listProjectMembers: vi.fn(),
}));

const RECORD = "00000000-0000-0000-0000-0000000000aa";

const call = (input: Record<string, unknown>): AssistantToolCall => ({
  name: "create_issue", status: "pending", input: JSON.stringify(input), output: "prepared", record: RECORD,
});

const project = (over: Partial<Project>): Project => ({ id: 3, name: "Website", identifier: "WEB", isPublic: true, ...over } as Project);

const COLUMNS = [
  { id: 1, name: "Backlog", category: "BACKLOG", isDefault: false, color: "", position: 0 },
  { id: 2, name: "In progress", category: "STARTED", isDefault: false, color: "", position: 1 },
] as IssueStatus[];

const MEMBERS = [
  { id: 1, userId: 7, email: "pierre@acme.dev", displayName: "Pierre Michel" },
  { id: 2, userId: 8, email: "marie@acme.dev", displayName: "Marie Curie" },
  { id: 3, userId: 9, email: "mdupont@acme.dev", displayName: "Marie Dupont" },
] as ProjectMember[];

const LABELS = [{ id: 41, name: "Bug" }, { id: 42, name: "Frontend" }] as ProjectLabel[];

const CYCLES = [
  { id: 20, name: "Cycle 11", status: "COMPLETED" },
  { id: 21, name: "Cycle 12", status: "ACTIVE" },
] as Cycle[];

describe("IssueDraftCard : l'issue que Cortex prépare (R78)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ projects: [project({}), project({ id: 5, name: "API Platform", identifier: "API", isPublic: false })] });
    vi.mocked(listStatuses).mockResolvedValue(COLUMNS);
    vi.mocked(listProjectMembers).mockResolvedValue(MEMBERS);
    vi.mocked(listLabels).mockResolvedValue(LABELS);
    vi.mocked(listCycles).mockResolvedValue(CYCLES);
  });

  it("fills the priority, the assignee, the labels, the points and the cycle from what exists", async () => {
    render(<IssueDraftCard slug="acme" call={call({
      project: "WEB", title: "Pricing page", priority: "high", assignee: "Curie", labels: ["bug", "urgent"],
      points: 3, cycle: "Cycle 12",
    })} />);

    await waitFor(() => expect(screen.getByText("Marie Curie")).toBeTruthy());
    expect(screen.getByText("High")).toBeTruthy();
    // « urgent » n'existe pas dans le projet : il tombe, il n'est jamais créé.
    expect(screen.getByText("Bug")).toBeTruthy();
    expect(screen.queryByText(/urgent/)).toBeNull();
    expect(screen.getByText("3 points")).toBeTruthy();
    expect(screen.getByText("Cycle 12")).toBeTruthy();
    expect(screen.getByText("(active)")).toBeTruthy();
    expect(listProjectMembers).toHaveBeenCalledWith("acme", 3);
  });

  it("shows the person asking when the server resolved \"me\" to their e-mail (replay of 1.8.0)", async () => {
    render(<IssueDraftCard slug="acme" call={call({ project: "WEB", title: "T", assignee: "pierre@acme.dev" })} />);

    await waitFor(() => expect(screen.getByText("Pierre Michel")).toBeTruthy());
  });

  it("leaves empty, and editable, what the request does not say", async () => {
    render(<IssueDraftCard slug="acme" call={call({ project: "WEB", title: "Pricing page", assignee: "Marie" })} />);

    await waitFor(() => expect(listCycles).toHaveBeenCalled());
    // « Marie » désigne deux membres : la carte ne choisit pas.
    await waitFor(() => expect(screen.getByText("Unassigned")).toBeTruthy());
    expect(screen.getByText("No priority")).toBeTruthy();
    expect(screen.getByText("No labels")).toBeTruthy();
    expect(screen.getByText("No estimate")).toBeTruthy();
    expect(screen.getByText("No cycle")).toBeTruthy();
  });

  it("sends what the person chose on the card", async () => {
    vi.mocked(approveAction).mockResolvedValue({ tool: "create_issue", status: "success", output: "Created WEB-14 \"Pricing page\" in the project Website." });
    render(<IssueDraftCard slug="acme" call={call({ project: "WEB", title: "Pricing page", assignee: "Marie", labels: ["Bug"] })} />);
    await waitFor(() => expect(screen.getByText("Bug")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "URGENT" } });
    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "mdupont@acme.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "Bug", pressed: true }));
    fireEvent.click(screen.getByRole("button", { name: "Frontend", pressed: false }));
    fireEvent.change(screen.getByLabelText("Points"), { target: { value: "5" } });
    // Un cycle terminé n'est pas proposé : seul le cycle ouvert l'est.
    expect(screen.queryByRole("option", { name: "Cycle 11" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Cycle"), { target: { value: "Cycle 12" } });
    fireEvent.click(screen.getByRole("button", { name: "Create issue" }));

    await waitFor(() => expect(approveAction).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(approveAction).mock.calls[0][1].input ?? "{}")).toEqual({
      project: "WEB", title: "Pricing page", priority: "URGENT", assignee: "mdupont@acme.dev", labels: ["Frontend"],
      points: 5, cycle: "Cycle 12",
    });
  });

  it("without the project's members, sends what Cortex wrote: the server judges it", async () => {
    vi.mocked(listProjectMembers).mockRejectedValue(new Error("offline"));
    vi.mocked(approveAction).mockResolvedValue({ tool: "create_issue", status: "success", output: "Created WEB-15 \"T\" in the project Website." });
    render(<IssueDraftCard slug="acme" call={call({ project: "WEB", title: "T", assignee: "Curie" })} />);
    await waitFor(() => expect(listCycles).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Create issue" }));

    await waitFor(() => expect(approveAction).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(approveAction).mock.calls[0][1].input ?? "{}")).toMatchObject({ assignee: "Curie" });
  });

  it("says when the project has no labels to choose", async () => {
    vi.mocked(listLabels).mockResolvedValue([]);
    render(<IssueDraftCard slug="acme" call={call({ project: "WEB", title: "T", points: 20 })} />);
    await waitFor(() => expect(listLabels).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => expect(screen.getByText("This project has no labels yet")).toBeTruthy());
    // Une estimation hors des presets reste proposée.
    expect(screen.getByRole("option", { name: "20" })).toBeTruthy();
  });

  it("shows what Cortex prepared, without creating anything", async () => {
    render(<IssueDraftCard slug="acme" call={call({
      project: "WEB", title: "Pricing page", description: "Show the plans.",
      checklist: ["Plan table", "Link from the menu"], dueDate: "2099-11-06",
    })} />);

    expect(screen.getByText("New issue, prepared by Cortex")).toBeTruthy();
    expect(screen.getByText("Website (WEB)")).toBeTruthy();
    expect(screen.getByText("Pricing page")).toBeTruthy();
    // Une checklist, dite ainsi : la carte ne parle plus de sous-tâches qu'elle ne crée pas.
    expect(screen.getByText("Checklist")).toBeTruthy();
    expect(screen.queryByText(/subtask/i)).toBeNull();
    expect(screen.getByText("Plan table")).toBeTruthy();
    expect(screen.getByText("Link from the menu")).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText("Checklist"), { target: { value: "Plan table\n\nFAQ" } });
    fireEvent.click(screen.getByRole("button", { name: "Create issue" }));

    await waitFor(() => expect(screen.getByText(/Created WEB-14/)).toBeTruthy());
    const sent = vi.mocked(approveAction).mock.calls[0][1];
    expect(sent.record).toBe(RECORD);
    expect(JSON.parse(sent.input ?? "{}")).toEqual({ project: "WEB", title: "Pricing plans", checklist: ["Plan table", "FAQ"] });

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

  it("names a column the project doesn't have, when it has no default column either", async () => {
    render(<IssueDraftCard slug="acme" call={call({ project: "WEB", title: "T", status: "Done" })} />);

    await waitFor(() => expect(screen.getByText("This column isn't in the project anymore: choose another one.")).toBeTruthy());
  });

  describe("a column Cortex named loosely (replay of 1.8.0)", () => {
    const WITH_DEFAULT = [
      ...COLUMNS,
      { id: 3, name: "Todo", category: "UNSTARTED", isDefault: true, color: "", position: 2 },
    ] as IssueStatus[];

    it("reads \"To Do\" as the column Todo, and creates the issue there", async () => {
      vi.mocked(listStatuses).mockResolvedValue(WITH_DEFAULT);
      vi.mocked(approveAction).mockResolvedValue({ tool: "create_issue", status: "success", output: "Created WEB-16 \"T\" in the project Website." });
      render(<IssueDraftCard slug="acme" call={call({ project: "WEB", title: "T", status: "To Do" })} />);

      await waitFor(() => expect(screen.getByText("Todo")).toBeTruthy());
      expect(screen.queryByText(/isn't a column|isn't in the project/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Create issue" }));

      await waitFor(() => expect(approveAction).toHaveBeenCalled());
      expect(JSON.parse(vi.mocked(approveAction).mock.calls[0][1].input ?? "{}")).toMatchObject({ status: "Todo" });
    });

    it("puts the issue in the default column when the project doesn't have the one named, and says so", async () => {
      vi.mocked(listStatuses).mockResolvedValue(WITH_DEFAULT);
      vi.mocked(approveAction).mockResolvedValue({ tool: "create_issue", status: "success", output: "Created WEB-17 \"T\" in the project Website." });
      render(<IssueDraftCard slug="acme" call={call({ project: "WEB", title: "T", status: "Doing" })} />);

      await waitFor(() => expect(
        screen.getByText("\"Doing\" isn't a column of this project: the issue goes to Todo, its default column."),
      ).toBeTruthy());
      // Une note, pas une erreur : la création reste possible.
      const create = screen.getByRole("button", { name: "Create issue" }) as HTMLButtonElement;
      expect(create.disabled).toBe(false);
      fireEvent.click(create);

      await waitFor(() => expect(approveAction).toHaveBeenCalled());
      expect(JSON.parse(vi.mocked(approveAction).mock.calls[0][1].input ?? "{}")).toMatchObject({ status: "Todo" });
    });
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
