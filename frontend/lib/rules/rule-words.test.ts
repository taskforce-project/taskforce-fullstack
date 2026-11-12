import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"
import type { RuleDecision } from "@/lib/api/rules-service"
import {
  allOf, anyOf, approverName, dayOf, decisionWords, factsSentence, fill, fromWords, layerTitle, obligationWords,
  problemWords, ruleSentence, subjectOf, whereOf,
} from "./rule-words"

const t = CONSTANTS_EN.rules
const MARIE = { ref: "person:42", name: "Marie Martin", detail: "Finance lead" }
const decision = (patch: Partial<RuleDecision>): RuleDecision => ({
  effect: "allow", rule: null, ruleText: null, layer: null, layerName: null, approvers: [], signatures: 1, separate: false,
  ...patch,
})

describe("rule-words: a rule said back in words", () => {
  it("the CEO's rule: asks the finance lead first when anyone changes a file under any accounting folder", () => {
    const sentence = ruleSentence({ when: { action: "file.write", path: "**/accounting/**" }, effect: "ask" }, t,
      { approvers: [MARIE] })
    expect(sentence).toBe("Asks Marie Martin first when anyone changes a file under any accounting folder.")
  })

  it("two signatures, never the person who prepared it, above a threshold in a connected tool", () => {
    const sentence = ruleSentence({
      when: { action: "mcp.write", server: "stripe", over: { fact: "arg.amount", value: 5000 } }, effect: "ask",
    }, t, { signatures: 2, separate: true })
    expect(sentence).toBe("Asks a person first when anyone changes something in a connected tool in Stripe when the amount "
      + "is above 5,000. 2 different people approve. The person who asked or delegated can't approve it.")
  })

  it("a refusal, and TaskForce's own allowances with an agent as subject", () => {
    expect(ruleSentence({ when: { action: "issue.delete", actor: "agent" }, effect: "deny" }, t))
      .toBe("Never lets an agent delete an issue.")
    expect(ruleSentence({ when: { action: "file.read" }, effect: "allow" }, t, {}, "agent")).toBe("Lets an agent read a file.")
    expect(ruleSentence({ when: { action: "harness.change", actor: "person" }, effect: "allow" }, t))
      .toBe("Lets a person, in their own name change the rules.")
    expect(ruleSentence({ when: null, effect: "deny" }, t)).toBe("Never lets anyone do anything.")
  })

  it("says where a rule applies from its patterns, and quotes what doesn't say simply", () => {
    expect(whereOf({ path: "src/billing/**" }, t)).toBe(" under src/billing/")
    expect(whereOf({ path: "README.md" }, t)).toBe(" at README.md")
    expect(whereOf({ path: "src/*.ts" }, t)).toBe(" whose path matches “src/*.ts”")
    expect(whereOf({ command: "docker **" }, t)).toBe(" starting with “docker”")
    expect(whereOf({ command: "make release" }, t)).toBe(" “make release”")
    expect(whereOf({ command: "{npm,yarn} test" }, t)).toBe(" matching “{npm,yarn} test”")
    expect(whereOf({ branch: "tf/**", repoVisibility: "private" }, t)).toBe(" to the agent's own branch on a private repository")
    expect(whereOf({ branch: "main", repoVisibility: "public" }, t)).toBe(" to the branch “main” on a public repository")
    expect(whereOf({ tool: "create_refund" }, t)).toBe(" through create_refund")
    expect(whereOf(null, t)).toBe("")
  })

  it("an action by its facts", () => {
    expect(factsSentence({ action: "file.write", path: "src/accounting/ledger.ts", actor: "agent" }, t))
      .toBe("An agent changes a file at src/accounting/ledger.ts")
    expect(factsSentence({ action: "mcp.write", server: "stripe", "arg.amount": "1500", actor: "person" }, t))
      .toBe("A person, in their own name changes something in a connected tool in Stripe (amount: 1500)")
    expect(factsSentence({ action: "shell", command: "git status", branch: "main", repoVisibility: "private" }, t))
      .toBe("An agent runs a command “git status” to the branch “main” on a private repository")
    expect(factsSentence({ action: "git.push", repoVisibility: "public" }, t)).toBe("An agent pushes a branch on a public repository")
  })

  it("who approves: a person by name, a role in words", () => {
    expect(approverName(MARIE, t)).toBe("Marie Martin")
    expect(approverName("role:owner", t)).toBe("the workspace's owner")
    expect(approverName("role:admin", t)).toBe("an admin")
    expect(approverName("project-lead", t)).toBe("the project's lead")
    expect(approverName({ ref: "person:9", name: null, detail: null }, t)).toBe("a person who left the workspace")
    expect(approverName("Marie Martin", t)).toBe("Marie Martin")
    expect(anyOf([MARIE, "role:admin"], t)).toBe("Marie Martin or an admin")
    expect(allOf([[MARIE], ["role:admin"]], t)).toBe("Marie Martin, and an admin")
  })

  it("what the engine decided, and where the decision comes from", () => {
    expect(decisionWords(decision({ effect: "allow" }), t)).toBe("Allowed")
    expect(decisionWords(decision({ effect: "deny" }), t)).toBe("Refused")
    expect(decisionWords(decision({ effect: "ask" }), t)).toBe("Asks a person first")
    expect(decisionWords(decision({ effect: "ask", approvers: [[MARIE]] }), t)).toBe("Asks Marie Martin first")
    expect(fromWords(decision({ layer: "floor" }), t)).toBe("TaskForce, always")
    expect(fromWords(decision({ layer: "taskforce" }), t)).toBe("TaskForce's rules")
    expect(fromWords(decision({ layer: "workspace" }), t)).toBe("This workspace's rules")
    expect(fromWords(decision({ layer: "project", layerName: "Accounting" }), t)).toBe("The rules of project Accounting")
    expect(fromWords(decision({ layer: "process", layerName: "review" }), t)).toBe("The rules of process review")
    expect(fromWords(decision({ layer: "role", layerName: "MEMBER" }), t)).toBe("The rules for a member")
    expect(fromWords(decision({ layer: "person", layerName: "Marie Martin" }), t)).toBe("Marie Martin's rules")
    expect(fromWords(decision({ layer: null }), t)).toBe("No rule covers it, so it waits for a person.")
  })

  it("the title of a layer", () => {
    expect(layerTitle({ scope: "workspace", ref: null, name: null }, t)).toBe("This workspace")
    expect(layerTitle({ scope: "project", ref: "12", name: "Accounting" }, t)).toBe("Project Accounting")
    expect(layerTitle({ scope: "project", ref: "12", name: "Accounting" }, t, true)).toBe("This project")
    expect(layerTitle({ scope: "process", ref: "review", name: null }, t)).toBe("Process review")
    expect(layerTitle({ scope: "role", ref: "ADMIN", name: "ADMIN" }, t)).toBe("Everyone who is an admin")
    expect(layerTitle({ scope: "person", ref: "42", name: "Marie Martin" }, t)).toBe("Marie Martin")
  })

  it("why a rule can't enter, in words", () => {
    expect(problemWords({ code: "loosens", detail: null }, t)).toContain("can only make TaskForce stricter")
    expect(problemWords({ code: "neverApplies", detail: "branch" }, t))
      .toBe("TaskForce never knows the branch for this action, so this rule would never apply.")
    expect(problemWords({ code: "neverApplies", detail: "path,branch" }, t)).toContain("an amount")
    expect(problemWords({ code: "nothing", detail: "Emails aren't actions TaskForce sees." }, t))
      .toBe("TaskForce couldn't turn this into a rule. Emails aren't actions TaskForce sees.")
    expect(problemWords({ code: "nothing", detail: null }, t)).toBe("TaskForce couldn't turn this into a rule.")
    expect(problemWords({ code: "somethingNew", detail: null }, t)).toBe("TaskForce can't add this rule as it is written.")
  })

  it("what a mission's request waits for, when a company rule names who approves", () => {
    expect(obligationWords({}, t)).toEqual([])
    expect(obligationWords({ waitingFor: [["Marie Martin"]] }, t)).toEqual(["Waits for Marie Martin."])
    expect(obligationWords({ waitingFor: [["role:admin", "project-lead"]], signatures: 2, separate: true, signedBy: ["Ada"] }, t))
      .toEqual([
        "Waits for an admin or the project's lead.",
        "2 different people approve: 1 so far.",
        "The person who delegated this task can't approve it.",
        "Approved by Ada.",
      ])
  })

  it("small helpers: a template, a subject, a day", () => {
    expect(fill("{a} and {b} {c}", { a: 1, b: "two" })).toBe("1 and two {c}")
    expect(subjectOf(undefined, t)).toBe("anyone")
    expect(subjectOf(null, t, "agent")).toBe("an agent")
    expect(dayOf("2026-11-11T20:00:00")).toBe("11 Nov 2026")
    expect(dayOf(null)).toBe("")
  })
})
