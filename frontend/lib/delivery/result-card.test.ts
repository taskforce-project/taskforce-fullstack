import { describe, expect, it } from "vitest";

import type { DeliveryRun, DeliveryRunActivity, DeliveryRunApproval } from "@/lib/api/delivery-service";
import { CONSTANTS_EN } from "@/lib/constants_en";
import { pullRequestOf, resultCard, resultLine, workMinutes } from "./result-card";

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
    expect(card.how).toBe("Rules v12 · 38 steps · 2 requests, 2 answered");
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

  it("counts an unanswered request as not answered", () => {
    expect(resultCard(run(), activity([approval("ALLOWED"), approval("EXPIRED")]), "TF-28", t).checks[1])
      .toEqual({ label: "Requests answered", value: "1 of 2", ok: false });
  });

  it("changes nothing without a pull request", () => {
    const card = resultCard(run({ resultUrl: null, rulesVersion: null }), undefined, null, t);

    expect(card.changes).toEqual([]);
    expect(card.how).toBe("Rules v? · 0 steps · 0 requests, 0 answered");
  });
});

describe("resultLine", () => {
  it.each([
    ["the pull request", run(), "Pull request #212 on acme/website."],
    ["the branch, without a pull request", run({ resultUrl: null }), "2 commits on the branch tf/tf-28, without a pull request."],
    ["no change", run({ resultUrl: null, commits: 0 }), "No code change was needed."],
  ])("says %s", (_label, r, line) => {
    expect(resultLine(r, t)).toBe(line);
  });
});
