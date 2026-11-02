import { describe, expect, it } from "vitest";

import type { IssueActivity } from "@/lib/api/issue-service";
import { CONSTANTS_EN } from "@/lib/constants_en";
import { describeActivity } from "./issue-activity";

const t = CONSTANTS_EN.issueActivity;

const pierre = { id: 7, email: "pierre@acme.dev", displayName: "Pierre", avatarUrl: null };

const activity = (over: Partial<IssueActivity>): IssueActivity => ({
  id: 1, actor: pierre, action: "CREATED", oldValue: null, newValue: null, via: null, createdAt: "2026-11-01T10:00:00",
  ...over,
});

describe("describeActivity : qui a fait quoi sur une issue", () => {
  it("a person who created the issue alone", () => {
    expect(describeActivity(activity({}), t)).toEqual({ who: "Pierre", what: "created", change: null, link: null, forWhom: null });
  });

  it("an issue created from Cortex's card: the person created it, Cortex prepared it", () => {
    const line = describeActivity(activity({ via: "Cortex" }), t);

    expect(`${line.who} ${line.what}`).toBe("Pierre created, prepared by Cortex");
    expect(line.forWhom).toBeNull();
  });

  it.each([
    ["CHECKLIST_CHECKED", "checked \"Update the README\""],
    ["CHECKLIST_UNCHECKED", "unchecked \"Update the README\""],
  ] as const)("the agent of a mission, in the delegator's name: %s", (action, what) => {
    const line = describeActivity(activity({ action, newValue: "Update the README", via: "Claude Code" }), t);

    expect(line).toMatchObject({ who: "Claude Code", what, forWhom: "for Pierre" });
  });

  it("the pull request the agent opened, with its link", () => {
    const url = "https://github.com/acme/website/pull/1";
    const line = describeActivity(activity({ action: "PULL_REQUEST_OPENED", newValue: url, via: "Claude Code" }), t);

    expect(`${line.who} ${line.what} ${line.link?.label}`).toBe("Claude Code opened pull request #1");
    expect(line.link?.href).toBe(url);
    expect(line.forWhom).toBe("for Pierre");
  });

  it("a pull request whose address is not GitHub's: no link", () => {
    const line = describeActivity(activity({ action: "PULL_REQUEST_OPENED", newValue: "https://example.com/pr/1", via: "Claude Code" }), t);

    expect(line.what).toBe("opened a pull request");
    expect(line.link).toBeNull();
  });

  it.each([
    ["MISSION_APPLIED", "applied the result"],
    ["MISSION_DISCARDED", "discarded the result"],
    ["MISSION_RETRIED", "tried again"],
    ["MISSION_MARKED_DONE", "marked the issue done: no change was needed"],
  ] as const)("the person's decision on the result: %s", (action, what) => {
    expect(describeActivity(activity({ action }), t)).toMatchObject({ who: "Pierre", what, forWhom: null });
  });

  it("any other change keeps its old and new values", () => {
    const line = describeActivity(activity({ action: "STATUS_CHANGED", oldValue: "Todo", newValue: "In review by AI" }), t);

    expect(line).toMatchObject({ what: "status changed", change: { from: "Todo", to: "In review by AI" } });
  });

  it("a change without both values shows none", () => {
    expect(describeActivity(activity({ action: "DESCRIPTION_CHANGED" }), t).change).toBeNull();
  });

  it("an actor that was deleted is the system, and a person without a name shows their email", () => {
    expect(describeActivity(activity({ actor: null }), t).who).toBe("System");
    expect(describeActivity(activity({ actor: { ...pierre, displayName: null } }), t).who).toBe("pierre@acme.dev");
  });

  it("an agent that acted for a person deleted since says what it did, for nobody", () => {
    const line = describeActivity(activity({ action: "COMMENT_ADDED", actor: null, via: "Claude Code" }), t);

    expect(line).toMatchObject({ who: "Claude Code", what: "comment added", forWhom: null });
  });
});
