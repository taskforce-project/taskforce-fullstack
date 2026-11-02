import { describe, expect, it } from "vitest";

import type { DeliveryRun } from "@/lib/api/delivery-service";
import { agentAtWork } from "./agent-at-work";

const RUN = {
  id: 100, issueId: 28, providerKey: "claude-code", status: "RUNNING", startedById: 7, startedByName: "Pierre", outcome: null,
} as DeliveryRun;

const AGENTS = [{ key: "claude-code", displayName: "Claude Code" }, { key: "github-copilot", displayName: "GitHub Copilot" }];
const TEMPLATE = "{agent}, for {who}";
const fallback = (key: string) => (key === "claude-code" ? "Claude Code" : key);

describe("agentAtWork : l'agent qui travaille sur l'issue au nom de la personne", () => {
  it.each([
    ["waiting for the runner", { status: "QUEUED" }, "Claude Code, for Pierre"],
    ["running", {}, "Claude Code, for Pierre"],
    ["a result waiting for review", { status: "DONE" }, "Claude Code, for Pierre"],
    ["another agent", { providerKey: "github-copilot" }, "GitHub Copilot, for Pierre"],
    ["no delegator known", { startedByName: null }, "Claude Code"],
    ["a blank delegator name", { startedByName: "  " }, "Claude Code"],
  ] as const)("names the agent while %s", (_label, over, expected) => {
    expect(agentAtWork({ ...RUN, ...over } as DeliveryRun, AGENTS, TEMPLATE, fallback)).toBe(expected);
  });

  it.each([
    ["no mission", null],
    ["a failed mission", { ...RUN, status: "FAILED" }],
    ["an applied result", { ...RUN, status: "DONE", outcome: "APPLIED" }],
    ["a discarded result", { ...RUN, status: "DONE", outcome: "DISCARDED" }],
    ["a result tried again", { ...RUN, status: "DONE", outcome: "RETRIED" }],
  ] as const)("names nobody for %s", (_label, run) => {
    expect(agentAtWork(run as DeliveryRun | null, AGENTS, TEMPLATE, fallback)).toBeNull();
  });

  it("names the agent before the list of agents is there", () => {
    expect(agentAtWork(RUN, [], TEMPLATE, fallback)).toBe("Claude Code, for Pierre");
    expect(agentAtWork({ ...RUN, providerKey: "other-agent" }, [], TEMPLATE, fallback)).toBe("other-agent, for Pierre");
  });
});
