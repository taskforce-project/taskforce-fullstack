import { describe, expect, it } from "vitest"

import type { AssistantToolCall } from "@/lib/api/assistant-service"
import type { CortexTurn } from "@/lib/store/cortex-store"
import { changeKind, changesOf } from "./changes"

const TARGET = { issueId: 12, projectId: 3, key: "TF-12", title: "Fix the login" }

function call(name: string, patch: Partial<AssistantToolCall> = {}): AssistantToolCall {
  return { name, status: "success", input: null, output: null, record: "rec", ...patch }
}

function turn(id: string, toolCalls: AssistantToolCall[]): CortexTurn {
  return {
    id, role: "assistant",
    answer: {
      answer: "Done.", reasoning: null, mode: "fast", sources: [], steps: [], toolCalls,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    },
  }
}

/** « Changes » (R122) : ce que la conversation a changé dans TaskForce, lu dans les résultats de ses gestes. */
describe("changeKind", () => {
  it.each([
    [call("create_issue"), "created"],
    [call("create_project"), "created"],
    [call("create_note"), "created"],
    [call("add_comment"), "commented"],
    [call("archive_issue"), "archived"],
    [call("delete_issue"), "deleted"],
    [call("delegate_issue"), "delegated"],
    [call("update_issue", { input: '{"issue":"TF-12","status":"Done"}' }), "moved"],
    [call("update_issue", { input: '{"issue":"TF-12","statusId":4}' }), "moved"],
    [call("update_issue", { input: '{"issue":"TF-12","assignee":"me"}' }), "assigned"],
    [call("update_issue", { input: '{"issue":"TF-12","priority":"HIGH"}' }), "changed"],
    [call("update_issue", { input: "not json" }), "changed"],
    [call("update_issue", { input: "[1]" }), "changed"],
    [call("list_issues"), null],
    [call("github__create_pr"), null],
  ])("%o se dit %s", (gesture, kind) => {
    expect(changeKind(gesture)).toBe(kind)
  })
})

describe("changesOf", () => {
  it("lit les gestes aboutis des tours puis des cartes, du plus récent au plus ancien", () => {
    const moved = call("update_issue", { input: '{"issue":"TF-12","status":"Done"}', target: TARGET })
    const proposed = call("create_issue", { status: "pending" })
    const refused = call("add_comment", { status: "refused" })
    const created = call("create_issue", { input: '{"title":"Pricing page"}', output: "Created TF-14" })
    const listed = call("list_issues")
    const turns: CortexTurn[] = [
      { id: "u1", role: "user", text: "Move TF-12 to Done" },
      turn("a1", [listed, moved, proposed, refused]),
    ]

    const changes = changesOf(turns, [created])

    expect(changes.map((change) => [change.id, change.kind, change.what])).toEqual([
      ["card:0", "created", "Pricing page"],
      ["a1:1", "moved", "TF-12 Fix the login"],
    ])
  })

  it.each([
    [call("create_project", { input: '{"name":"Atlas"}' }), "Atlas"],
    [call("add_comment", { input: '{"issue":"TF-12","content":"Looks good"}' }), "TF-12"],
    [call("delete_issue", { output: "Deleted TF-12 \"Fix login\".\nWith its comments." }), "Deleted TF-12 \"Fix login\"."],
    [call("create_note", { input: '{"title":"  Runbook  "}' }), "Runbook"],
    [call("delegate_issue", { target: { ...TARGET, key: null } }), "Fix the login"],
    [call("add_comment"), ""],
  ])("dit ce qui a changé : %o", (gesture, what) => {
    expect(changesOf([], [gesture])[0].what).toBe(what)
  })

  it("ne dit rien d'une conversation sans geste", () => {
    expect(changesOf([{ id: "u1", role: "user", text: "Hello" }])).toEqual([])
  })
})
