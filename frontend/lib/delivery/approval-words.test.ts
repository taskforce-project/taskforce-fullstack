import { describe, expect, it } from "vitest";

import { CONSTANTS_EN } from "@/lib/constants_en";
import { approvalOutcome, approvalWords, deadlineText } from "./approval-words";

const t = CONSTANTS_EN.missions;

describe("approvalWords", () => {
  it("says what the agent wants, from the action the rules judged, with the rule's reason", () => {
    const words = approvalWords({
      tool: "WebSearch", askedBy: "agent", action: "web.search",
      reason: "A web search sends its query out of the machine, where it cannot be taken back.",
    }, t);

    expect(words).toEqual({
      title: "Claude Code wants to search the web",
      will: t.actions["web.search"].will,
      why: "A web search sends its query out of the machine, where it cannot be taken back.",
      ifRefused: "It continues without this search.",
    });
  });

  it("says that TaskForce itself asks, before an exit", () => {
    expect(approvalWords({ tool: "git push", askedBy: "runner", action: "git.push", reason: null }, t).title)
      .toBe("TaskForce wants to push the branch");
  });

  it.each([
    ["an older runner, with no action", null],
    ["an action it has no words for", "payment"],
    ["the fallback's own key", "other"],
  ])("keeps the tool for %s", (_label, action) => {
    const words = approvalWords({ tool: "WebFetch", askedBy: "agent", action, reason: undefined }, t);

    expect(words.title).toBe("Claude Code wants to use WebFetch");
    expect(words.ifRefused).toBe(t.actions.other.ifRefused);
  });

  it("says that no rule covers an action without one", () => {
    expect(approvalWords({ tool: "Bash", askedBy: "agent", action: "shell", reason: "  " }, t).why).toBe(t.noRule);
  });
});

describe("deadlineText", () => {
  it.each([
    [9, "No answer in 9 min means no. You will see that it was refused."],
    [1, t.noAnswerSoon],
    [0, t.noAnswerSoon],
  ])("%s minutes left", (minutes, text) => {
    expect(deadlineText(minutes, t)).toBe(text);
  });
});

describe("approvalOutcome", () => {
  it.each([
    [{ status: "ALLOWED" as const, scope: "MISSION" as const, decidedBy: "Ada" }, "Allowed for this mission by Ada"],
    [{ status: "ALLOWED" as const, scope: "ONCE" as const, decidedBy: "Ada" }, "Allowed by Ada"],
    [{ status: "DENIED" as const, scope: "ONCE" as const, decidedBy: null }, "Refused by the person who delegated"],
    [{ status: "EXPIRED" as const, scope: null, decidedBy: null }, "No answer in time: refused"],
    [{ status: "PENDING" as const, scope: null, decidedBy: null }, null],
  ])("tells what became of the request: %o", (approval, line) => {
    expect(approvalOutcome(approval, t)).toBe(line);
  });
});
