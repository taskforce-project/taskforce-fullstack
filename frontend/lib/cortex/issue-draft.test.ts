import { describe, expect, it } from "vitest";

import {
  draftColumn,
  draftCycle,
  draftLabels,
  draftProblem,
  findDraftMember,
  findDraftProject,
  formatDraftDay,
  issueDraftInput,
  localDay,
  memberName,
  nameKey,
  namedColumn,
  openCycles,
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
  checklist: [],
  dueDate: "",
  status: "",
  priority: "",
  assignee: "",
  labels: [],
  points: "",
  cycle: "",
  ...over,
});

describe("readIssueDraft", () => {
  it("reads what Cortex prepared", () => {
    const input = JSON.stringify({
      project: "WEB",
      title: " Pricing page ",
      description: "Show the plans.",
      checklist: ["Plan table", " ", 42, "Link from the menu"],
      dueDate: "2026-11-06",
      status: "Backlog",
      priority: "high",
      assignee: " Marie ",
      labels: ["Bug", "", 7],
      points: 3,
      cycle: "Cycle 12",
    });

    expect(readIssueDraft(input)).toEqual({
      project: "WEB",
      title: "Pricing page",
      description: "Show the plans.",
      checklist: ["Plan table", "Link from the menu"],
      dueDate: "2026-11-06",
      status: "Backlog",
      priority: "HIGH",
      assignee: "Marie",
      labels: ["Bug"],
      points: "3",
      cycle: "Cycle 12",
    });
  });

  it.each([
    ["an unknown priority", { priority: "soon" }, "priority", ""],
    ["points written as text", { points: " 5 " }, "points", "5"],
    ["points that are not whole", { points: 2.5 }, "points", ""],
    ["points out of range", { points: 101 }, "points", ""],
    ["no points", { points: 0 }, "points", ""],
  ])("reads %s", (_label, args, field, expected) => {
    expect(readIssueDraft(JSON.stringify(args))[field as keyof IssueDraft]).toEqual(expected);
  });

  it("still reads the checklist of a card prepared under its former name", () => {
    expect(readIssueDraft(JSON.stringify({ subtasks: ["Plan table"] })).checklist).toEqual(["Plan table"]);
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
    expect(JSON.parse(issueDraftInput(draft({ description: "  ", checklist: [" ", ""] })))).toEqual({
      project: "WEB",
      title: "Pricing page",
    });
  });

  it("sends the edited fields as the tool's arguments", () => {
    const sent = JSON.parse(issueDraftInput(draft({
      description: " Show the plans. ",
      checklist: [" Plan table", "Link from the menu "],
      dueDate: "2026-11-06",
      status: " In progress ",
    })));

    expect(sent).toEqual({
      project: "WEB",
      title: "Pricing page",
      description: "Show the plans.",
      checklist: ["Plan table", "Link from the menu"],
      dueDate: "2026-11-06",
      status: "In progress",
    });
  });

  it("sends the priority, the assignee, the labels, the points and the cycle when they are filled", () => {
    const sent = JSON.parse(issueDraftInput(draft({
      priority: "URGENT", assignee: " marie@acme.dev ", labels: [" Bug", ""], points: "8", cycle: " Cycle 12 ",
    })));

    expect(sent).toEqual({
      project: "WEB",
      title: "Pricing page",
      priority: "URGENT",
      assignee: "marie@acme.dev",
      labels: ["Bug"],
      points: 8,
      cycle: "Cycle 12",
    });
  });

  it("leaves out no priority and unreadable points", () => {
    expect(JSON.parse(issueDraftInput(draft({ priority: "NONE", points: "lots" })))).toEqual({
      project: "WEB",
      title: "Pricing page",
    });
  });
});

const MEMBERS = [
  { userId: 7, email: "pierre@acme.dev", displayName: "Pierre Michel" },
  { userId: 8, email: "marie@acme.dev", displayName: "Marie Curie" },
  { userId: 9, email: "mdupont@acme.dev", displayName: "Marie Dupont" },
  { userId: 10, email: "linus@acme.dev", displayName: null },
];

describe("findDraftMember", () => {
  it.each([
    ["the exact email", "MARIE@acme.dev", 8],
    ["the exact name", "pierre michel", 7],
    ["a part of the name that names one person", "curie", 8],
    ["the start of the email", "linus", 10],
    ["nothing", "", null],
    ["a name that matches several members: the person chooses", "Marie", null],
    ["someone who is not a member: never invented", "Bob", null],
  ])("finds a member by %s", (_label, asked, userId) => {
    expect(findDraftMember(MEMBERS, asked)?.userId ?? null).toBe(userId);
  });

  it("does not pick between two members of the same name", () => {
    const twins = [...MEMBERS, { userId: 11, email: "marie2@acme.dev", displayName: "Marie Curie" }];
    expect(findDraftMember(twins, "Marie Curie")).toBeNull();
  });

  it("names a member by their name, or their email without one", () => {
    expect(memberName(MEMBERS[1])).toBe("Marie Curie");
    expect(memberName(MEMBERS[3])).toBe("linus@acme.dev");
  });
});

describe("draftLabels", () => {
  const LABELS = [{ id: 1, name: "Bug" }, { id: 2, name: "Frontend" }];

  it("keeps the project's labels Cortex named, once each, and drops the others", () => {
    expect(draftLabels(LABELS, ["frontend", "urgent", "Bug", "BUG"]).map((l) => l.id)).toEqual([2, 1]);
  });
});

describe("cycles", () => {
  const CYCLES = [
    { id: 20, name: "Cycle 11", status: "COMPLETED" },
    { id: 21, name: "Cycle 12", status: "ACTIVE" },
    { id: 22, name: "Cycle 13", status: "DRAFT" },
  ];

  it("offers only the cycles an issue can still enter", () => {
    expect(openCycles(CYCLES).map((c) => c.id)).toEqual([21, 22]);
  });

  it.each([
    ["an open cycle, whatever the case", "cycle 12", 21],
    ["nothing for a completed cycle", "Cycle 11", null],
    ["nothing for an unknown cycle", "Sprint 9", null],
    ["nothing when none is named", "", null],
  ])("finds %s", (_label, asked, id) => {
    expect(draftCycle(CYCLES, asked)?.id ?? null).toBe(id);
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
    ["the named column, whatever the spaces (Cortex wrote \"To Do\")", "To Do", 1],
    ["the named column, whatever the punctuation", "in-progress!", 3],
    ["the Backlog when none is named", "", 2],
    ["the default column for a column the project doesn't have", "Done", 1],
  ])("gives %s", (_label, status, id) => {
    expect(draftColumn(COLUMNS, status)?.id ?? null).toBe(id);
  });

  it("falls back to the default column without a Backlog", () => {
    expect(draftColumn(COLUMNS.filter((c) => c.category !== "BACKLOG"), "")?.id).toBe(1);
  });

  it("gives nothing for an unknown column when the project has no default", () => {
    expect(draftColumn(COLUMNS.filter((c) => !c.isDefault), "Done")).toBeNull();
  });
});

describe("namedColumn", () => {
  it.each([
    ["To Do", 1],
    ["TODO", 1],
    ["In progress", 3],
    ["Done", null],
    ["  ", null],
  ])("reads %s as column %s, never another one", (status, id) => {
    expect(namedColumn(COLUMNS, status)?.id ?? null).toBe(id);
  });

  it.each([
    ["To Do", "todo"],
    ["Moi-Même", "moimeme"],
    ["  In-Progress! ", "inprogress"],
    ["Élodie", "elodie"],
  ])("keys %s as %s", (name, key) => {
    expect(nameKey(name)).toBe(key);
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
