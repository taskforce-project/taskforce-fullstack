import { describe, expect, it } from "vitest";

import type { IssueActivity } from "@/lib/api/issue-service";
import { CONSTANTS_EN } from "@/lib/constants_en";
import { agentName, describeActivity } from "./issue-activity";

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

  it.each([
    ["Claude Code", "Claude Code commented for Pierre"], // le commentaire de l'agent d'une mission (rejeu de la 1.8.0)
    [null, "Pierre commented"],                          // la personne seule
  ])("a comment, through %s", (via, said) => {
    const line = describeActivity(activity({ action: "COMMENT_ADDED", via }), t);

    expect([line.who, line.what, line.forWhom].filter(Boolean).join(" ")).toBe(said);
    expect(line.change).toBeNull();
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
    ["MISSION_CHANGES_ASKED", "asked the agent for changes"],
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

    expect(line).toMatchObject({ who: "Claude Code", what: "commented", forWhom: null });
  });

  // R123 : ce que Cortex écrit porte le modèle qui le faisait parler.
  it("Cortex's comment says the model that made it speak, for the person", () => {
    const line = describeActivity(activity({ action: "COMMENT_ADDED", via: "Cortex", model: "qwen3:8b" }), t);

    expect(line).toMatchObject({ who: "Cortex · qwen3:8b", what: "commented", forWhom: "for Pierre" });
    expect(describeActivity(activity({ via: "Cortex", model: "qwen3:8b" }), t).what).toBe("created, prepared by Cortex · qwen3:8b");
  });

  // R166 : un lien entre deux issues entre à l'activité de chacune, dit de son côté.
  it.each([
    ["BLOCKS WEB-12", "added a link: this issue blocks WEB-12"],
    ["BLOCKED_BY WEB-11", "added a link: this issue is blocked by WEB-11"],
    ["DUPLICATE_OF WEB-12", "added a link: this issue is a duplicate of WEB-12"],
    ["DUPLICATED_BY WEB-11", "added a link: this issue is duplicated by WEB-11"],
    ["RELATES_TO WEB-12", "added a link: this issue relates to WEB-12"],
  ])("a link added, read from this issue: %s", (newValue, what) => {
    const line = describeActivity(activity({ action: "RELATION_ADDED", newValue }), t);

    expect(line).toEqual({ who: "Pierre", what, change: null, link: null, forWhom: null });
  });

  it.each([
    ["BLOCKS WEB-12", "removed a link: this issue no longer blocks WEB-12"],
    ["BLOCKED_BY WEB-11", "removed a link: this issue is no longer blocked by WEB-11"],
    ["DUPLICATE_OF WEB-12", "removed a link: this issue is no longer a duplicate of WEB-12"],
  ])("a link removed, read from this issue: %s", (oldValue, what) => {
    expect(describeActivity(activity({ action: "RELATION_REMOVED", oldValue }), t).what).toBe(what);
  });

  it("a link that reads in no known words says only that a link changed, never the raw value", () => {
    expect(describeActivity(activity({ action: "RELATION_ADDED", newValue: "SPAWNS WEB-12" }), t).what)
      .toBe("added a link to another issue");
    expect(describeActivity(activity({ action: "RELATION_REMOVED", oldValue: null }), t).what)
      .toBe("removed a link to another issue");
  });

  it("an agent that links issues for a person says it, for that person", () => {
    const line = describeActivity(activity({ action: "RELATION_ADDED", newValue: "BLOCKS WEB-12", via: "Claude Code" }), t);

    expect(line).toMatchObject({ who: "Claude Code", what: "added a link: this issue blocks WEB-12", forWhom: "for Pierre" });
  });
});

describe("agentName", () => {
  it("names the agent, with its model when it says one that differs from its name", () => {
    expect(agentName("Cortex", "qwen3:8b")).toBe("Cortex · qwen3:8b");
    expect(agentName(" Cortex ", null)).toBe("Cortex");
    // L'agent à l'essai de R51 porte déjà le nom de son modèle.
    expect(agentName("qwen3:8b", "qwen3:8b")).toBe("qwen3:8b");
    expect(agentName(null, "qwen3:8b")).toBeNull();
    expect(agentName("  ", "qwen3:8b")).toBeNull();
  });
});
