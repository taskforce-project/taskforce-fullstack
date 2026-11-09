import { describe, expect, it } from "vitest"

import type { IssueCommentHit, IssueHit } from "@/lib/api/issue-service"
import { commentsApart, matches, pick } from "./palette"

/** Ce que Ctrl+K trouve de lui-même (R141). */
describe("palette", () => {
  it.each([
    ["Operations", "oper", true],
    ["Opérations", "operations", true],
    ["Operations", "OPÉRA", true],
    ["Fix the login page", "login fix", true],
    ["Fix the login page", "login signup", false],
    ["Anything", "", true],
    ["Anything", "   ", true],
  ])("%s answers « %s »: %s", (text, query, expected) => {
    expect(matches(text, query)).toBe(expected)
  })

  it("keeps the first ones that answer, and everything without a query", () => {
    const names = ["Alpha", "Alps", "Beta", "Alto"]
    expect(pick(names, "al", (n) => n, 2)).toEqual(["Alpha", "Alps"])
    expect(pick(names, "", (n) => n, 3)).toEqual(["Alpha", "Alps", "Beta"])
  })

  it("an issue found by its title is not repeated by its comment", () => {
    const comment = (issueId: number): IssueCommentHit => ({ issueId, projectId: 3, key: `OPS-${issueId}`, title: "T", excerpt: "e" })
    const issues = [{ id: 1 } as IssueHit]
    expect(commentsApart([comment(1), comment(2)], issues).map((c) => c.issueId)).toEqual([2])
  })
})
