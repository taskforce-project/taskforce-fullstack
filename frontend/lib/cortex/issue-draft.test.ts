import { describe, expect, it } from "vitest";

import {
  draftColumn,
  draftProblem,
  findDraftProject,
  formatDraftDay,
  issueDraftInput,
  localDay,
  readIssueDraft,
  type IssueDraft,
} from "./issue-draft";

const PROJECTS = [
  { id: 3, identifier: "WEB", name: "Website" },
  { id: 5, identifier: "API", name: "API Platform" },
];

const COLUMNS = [
  { id: 1, name: "Todo", category: "UNSTARTED", isDefault: true },
  { id: 2, name: "Backlog", category: "BACKLOG", isDefault: false },
  { id: 3, name: "In progress", category: "STARTED", isDefault: false },
];

const draft = (over: Partial<IssueDraft> = {}): IssueDraft => ({
  project: "WEB",
  title: "Pricing page",
  description: "",
  subtasks: [],
  dueDate: "",
  status: "",
  ...over,
});

describe("readIssueDraft", () => {
  it("reads what Cortex prepared", () => {
    const input = JSON.stringify({
      project: "WEB",
      title: " Pricing page ",
      description: "Show the plans.",
      subtasks: ["Plan table", " ", 42, "Link from the menu"],
      dueDate: "2026-11-06",
      status: "Backlog",
    });

    expect(readIssueDraft(input)).toEqual({
      project: "WEB",
      title: "Pricing page",
      description: "Show the plans.",
      subtasks: ["Plan table", "Link from the menu"],
      dueDate: "2026-11-06",
      status: "Backlog",
    });
  });

  it.each([
    ["no input", null],
    ["unreadable JSON", "{not json"],
    ["a list instead of an object", "[1, 2]"],
  ])("leaves every field empty for %s", (_label, input) => {
    expect(readIssueDraft(input)).toEqual(draft({ project: "", title: "" }));
  });

  it("drops a due date that is not a day", () => {
    expect(readIssueDraft(JSON.stringify({ dueDate: "Friday" })).dueDate).toBe("");
  });
});

describe("issueDraftInput", () => {
  it("sends only what is filled", () => {
    expect(JSON.parse(issueDraftInput(draft({ description: "  ", subtasks: [" ", ""] })))).toEqual({
      project: "WEB",
      title: "Pricing page",
    });
  });

  it("sends the edited fields as the tool's arguments", () => {
    const sent = JSON.parse(issueDraftInput(draft({
      description: " Show the plans. ",
      subtasks: [" Plan table", "Link from the menu "],
      dueDate: "2026-11-06",
      status: " In progress ",
    })));

    expect(sent).toEqual({
      project: "WEB",
      title: "Pricing page",
      description: "Show the plans.",
      subtasks: ["Plan table", "Link from the menu"],
      dueDate: "2026-11-06",
      status: "In progress",
    });
  });
});

describe("findDraftProject", () => {
  it.each([
    ["its key", "web", 3],
    ["its name", "api platform", 5],
    ["nothing", "", null],
    ["an unknown project", "Mobile", null],
  ])("finds a project by %s", (_label, asked, id) => {
    expect(findDraftProject(PROJECTS, asked)?.id ?? null).toBe(id);
  });
});

describe("draftColumn", () => {
  it.each([
    ["the named column, whatever the case", "in PROGRESS", 3],
    ["the Backlog when none is named", "", 2],
    ["nothing for an unknown column", "Done", null],
  ])("gives %s", (_label, status, id) => {
    expect(draftColumn(COLUMNS, status)?.id ?? null).toBe(id);
  });

  it("falls back to the default column without a Backlog", () => {
    expect(draftColumn(COLUMNS.filter((c) => c.category !== "BACKLOG"), "")?.id).toBe(1);
  });
});

describe("draftProblem", () => {
  const web = PROJECTS[0];

  it.each([
    ["no project", draft(), null, true, "project"],
    ["no title", draft({ title: "  " }), web, true, "title"],
    ["a due date before the earliest day", draft({ dueDate: "2026-10-28" }), web, true, "past"],
    ["a column the project doesn't have", draft({ status: "Done" }), web, false, "column"],
    ["a complete draft", draft({ dueDate: "2026-10-29", status: "Backlog" }), web, true, null],
  ])("says what blocks: %s", (_label, d, project, columnFound, problem) => {
    expect(draftProblem(d, project, columnFound, "2026-10-29")).toBe(problem);
  });
});

describe("days", () => {
  it("writes a local day, shifted", () => {
    expect(localDay(new Date(2026, 9, 31))).toBe("2026-10-31");
    expect(localDay(new Date(2026, 9, 31), 1)).toBe("2026-11-01");
    expect(localDay(new Date(2026, 0, 1), -1)).toBe("2025-12-31");
  });

  it("shows a day with its weekday", () => {
    expect(formatDraftDay("2026-11-06")).toBe("Friday, Nov 6");
  });
});
