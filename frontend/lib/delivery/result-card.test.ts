import { describe, expect, it } from "vitest";

import type { DeliveryRun, DeliveryRunActivity, DeliveryRunApproval } from "@/lib/api/delivery-service";
import { CONSTANTS_EN } from "@/lib/constants_en";
import { agentWords, changedNothing, deliveredLine, missionAgentName, pullRequestOf, resultCard, resultLine, workMinutes } from "./result-card";

const t = CONSTANTS_EN.missions.result;

const run = (over: Partial<DeliveryRun> = {}): DeliveryRun => ({
  id: 100, issueId: 28, issueKey: "TF-28", issueTitle: "Fix the footer links", projectId: 3, projectName: "TaskForce",
  providerKey: "claude-code", model: null, status: "DONE", summary: "Fixed 3 links.",
  resultUrl: "https://github.com/acme/website/pull/212", error: null, startedById: 7,
  createdAt: "2026-10-30T10:00:00", updatedAt: "2026-10-30T10:05:00",
  claimedAt: "2026-10-30T10:01:00", endedAt: "2026-10-30T10:04:30", rulesVersion: 12,
  branch: "tf/tf-28", commits: 2,
  tests: { command: "npm test", ran: true, passed: true, passedCount: 12, total: 12 },
  ...over,
});

const approval = (status: DeliveryRunApproval["status"]): DeliveryRunApproval => ({
  id: 1, tool: "WebSearch", summary: "x", status, createdAt: null, expiresAt: null, decidedAt: null, decidedBy: null,
  canDecide: false,
});

const activity = (approvals: DeliveryRunApproval[], steps = 38): DeliveryRunActivity => ({
  events: Array.from({ length: steps }, (_, i) => ({ seq: i + 1, kind: "tool" as const, tool: "Bash", text: "x", at: null })),
  approvals,
});

describe("pullRequestOf", () => {
  it.each([
    ["a GitHub pull request", "https://github.com/acme/website/pull/212", { number: 212, repo: "acme/website" }],
    ["a pull request link with a tab", "https://github.com/acme/website/pull/9/files", { number: 9, repo: "acme/website" }],
    ["a branch", "https://github.com/acme/website/tree/tf/web-1", null],
    ["no result", null, null],
  ])("reads %s", (_label, url, expected) => {
    const pr = pullRequestOf(url);
    expect(pr ? { number: pr.number, repo: pr.repo } : null).toEqual(expected);
  });
});

describe("workMinutes", () => {
  it("counts from the moment the runner took the mission, rounded up", () => {
    expect(workMinutes(run())).toBe(4);
  });

  it("counts from the delegation when no runner took it", () => {
    expect(workMinutes(run({ claimedAt: null }))).toBe(5);
  });

  it("has no duration before the end", () => {
    expect(workMinutes(run({ endedAt: null }))).toBeNull();
  });
});

describe("resultCard", () => {
  it("takes its checks from the record: the runner's tests and the answered requests", () => {
    const card = resultCard(run(), activity([approval("ALLOWED"), approval("DENIED")]), "TF-28", t);

    expect(card.pr?.number).toBe(212);
    expect(card.minutes).toBe(4);
    expect(card.checks).toEqual([
      { label: "Tests ran", value: "12 of 12 passed", ok: true },
      { label: "Requests answered", value: "2 of 2", ok: true },
    ]);
    expect(card.changes).toEqual([
      { text: "Merge pull request #212 on GitHub", final: true },
      { text: "Move TF-28 to Done", final: false },
    ]);
    expect(card.how).toBe("Rules v12 · 38 actions · 2 requests, 2 answered");
  });

  it.each([
    ["failed tests, counted", { command: "npm test", ran: true, passed: false, passedCount: 9, total: 12 },
      { label: "Tests failed", value: "9 of 12 passed", ok: false }],
    ["passed tests, not counted", { command: "make check", ran: true, passed: true, passedCount: null, total: null },
      { label: "Tests ran", value: "passed", ok: true }],
    ["failed tests, not counted", { command: "make check", ran: true, passed: false, passedCount: null, total: null },
      { label: "Tests failed", value: "failed", ok: false }],
    ["tests refused on this computer", { command: "npm test", ran: false, passed: false, passedCount: null, total: null },
      { label: "Tests not run", value: "not allowed on this computer", ok: false }],
    ["no test command", null, { label: "No test command for this project", value: "", ok: null }],
  ])("says the tests as the runner ran them: %s", (_label, tests, check) => {
    expect(resultCard(run({ tests }), undefined, "TF-28", t).checks[0]).toEqual(check);
  });

  it("says the tests are about an earlier version once a file was put back (R139), without a verdict", () => {
    const stale = run({ tests: { command: "npm test", ran: true, passed: true, passedCount: 12, total: 12, stale: true } });
    expect(resultCard(stale, activity([]), "TF-28", t).checks[0]).toEqual({ label: t.testsStale, value: "", ok: null });
  });

  it("counts an unanswered request as not answered", () => {
    expect(resultCard(run(), activity([approval("ALLOWED"), approval("EXPIRED")]), "TF-28", t).checks[1])
      .toEqual({ label: "Requests answered", value: "1 of 2", ok: false });
  });

  it("changes nothing without a pull request", () => {
    const card = resultCard(run({ resultUrl: null, rulesVersion: null }), undefined, null, t);

    expect(card.changes).toEqual([]);
    expect(card.noChange).toBe(false); // des commits sur la branche : ce n'est pas « rien »
    expect(card.how).toBe("Rules v? · 0 actions · 0 requests, 0 answered");
  });

  it("a mission that changed nothing: marking it done moves the issue to Done (replay of 1.8.0)", () => {
    const card = resultCard(run({ resultUrl: null, commits: 0 }), undefined, "TF-28", t);

    expect(card.noChange).toBe(true);
    expect(card.pr).toBeNull();
    expect(card.changes).toEqual([{ text: "Move TF-28 to Done", final: false }]);
  });
});

describe("changedNothing", () => {
  it.each([
    ["a pull request", { resultUrl: "https://github.com/acme/website/pull/212", branch: null, commits: null }, false],
    ["commits on the agent's branch", { resultUrl: null, branch: "tf/tf-28", commits: 2 }, false],
    ["a branch without commits", { resultUrl: null, branch: "tf/tf-28", commits: 0 }, true],
    ["nothing said by an older runner", { resultUrl: null, branch: null, commits: null }, true],
    ["an address that is not a pull request", { resultUrl: "https://github.com/acme/website", branch: null, commits: null }, true],
  ])("%s: %s", (_label, facts, nothing) => {
    expect(changedNothing(facts)).toBe(nothing);
  });
});

describe("resultLine", () => {
  it.each([
    ["the pull request", run(), "Pull request #212 on acme/website."],
    ["the branch, without a pull request", run({ resultUrl: null }), "2 commits on the branch tf/tf-28, without a pull request."],
    ["no change", run({ resultUrl: null, commits: 0 }), "No code change was needed."],
    ["the trial agent's comment (R51)", run({ resultUrl: null, branch: null, commits: null, providerKey: "taskforce-agent" }),
      "Answered in a comment on this issue."],
  ])("says %s", (_label, r, line) => {
    expect(resultLine(r, t)).toBe(line);
  });
});

describe("deliveredLine : ce que la mission a rendu (recette 1.13, étape 8)", () => {
  const RUN = run({ resultUrl: "https://github.com/acme/website/pull/212" });
  const nothing = run({ resultUrl: null, branch: null, commits: null });
  const made = (...tools: string[]) => ({
    approvals: [],
    events: tools.map((name, i) => ({ seq: i + 1, kind: "tool" as const, tool: name, text: name === "Write" ? `c${i}.md` : "{}", at: null })),
  });
  const COMMENT = "taskforce: add_comment";

  it.each([
    ["four comments", made(COMMENT, COMMENT, COMMENT, COMMENT), "SOLO-151", "Delivered 4 comments on SOLO-151."],
    ["one comment", made(COMMENT), "SOLO-151", "Delivered a comment on SOLO-151."],
    ["without its key", made(COMMENT), null, "Delivered a comment."],
    ["a comment and two new issues", made(COMMENT, "taskforce: create_issue", "taskforce: create_issue"), "SOLO-151", "Delivered a comment and 2 new issues on SOLO-151."],
    ["one new issue", made("taskforce: create_issue"), "SOLO-151", "Delivered a new issue on SOLO-151."],
    ["updates", made("taskforce: update_issue", "taskforce: update_issue"), "SOLO-151", "Delivered 2 updates on SOLO-151."],
    ["one update and checked items", made("taskforce: update_issue", "taskforce: check_checklist_item", "taskforce: check_checklist_item"), "SOLO-151", "Delivered an update and 2 checked items on SOLO-151."],
    ["three kinds", made(COMMENT, "taskforce: create_issue", "taskforce: check_checklist_item"), "SOLO-151", "Delivered a comment, a new issue and a checked item on SOLO-151."],
    ["files only", made("Write", "Write"), "SOLO-151", "Delivered 2 files."],
    ["a file only", made("Write"), "SOLO-151", "Delivered a file."],
    ["nothing at all", made("Read"), "SOLO-151", "No code change was needed."],
    ["no timeline yet", undefined, "SOLO-151", "No code change was needed."],
  ])("%s", (_label, activity, key, line) => {
    expect(deliveredLine(nothing, activity, key, t)).toBe(line);
  });

  it("a pull request or a branch is what was delivered", () => {
    const comments = made(COMMENT);
    expect(deliveredLine(RUN, comments, "TF-28", t)).toBe("Pull request #212 on acme/website.");
    expect(deliveredLine({ ...nothing, branch: "tf/x", commits: 2 }, comments, "TF-28", t)).toBe("2 commits on the branch tf/x, without a pull request.");
  });

  it("the trial agent keeps its sentence", () => {
    expect(deliveredLine({ ...nothing, providerKey: "taskforce-agent" }, made("add_comment"), "TF-28", t)).toBe("Answered in a comment on this issue.");
  });

  it("is on the card", () => {
    expect(resultCard(nothing, made(COMMENT), "SOLO-151", t).delivered).toBe("Delivered a comment on SOLO-151.");
  });
});

describe("agentWords", () => {
  it("takes off the sentence the runner puts first on a mission without a commit", () => {
    expect(agentWords("No code change was needed.\n\nDeliverable posted.")).toBe("Deliverable posted.");
  });

  it("leaves everything else", () => {
    expect(agentWords("## What I did\nNo code change was needed.")).toBe("## What I did\nNo code change was needed.");
  });
});

describe("missionAgentName", () => {
  it("names the trial agent after the model that answers, and keeps the others' names", () => {
    expect(missionAgentName({ providerKey: "taskforce-agent", model: "qwen3:8b" }, "Claude Code")).toBe("Cortex · qwen3:8b");
    expect(missionAgentName({ providerKey: "taskforce-agent", model: null }, "Claude Code")).toBe("Cortex");
    expect(missionAgentName({ providerKey: "claude-code", model: "claude-opus-5" }, "Claude Code")).toBe("Claude Code");
  });
});
