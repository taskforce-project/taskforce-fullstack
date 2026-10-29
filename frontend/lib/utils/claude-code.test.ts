import { describe, expect, it } from "vitest"

import { claudeCodeUpToDate, MIN_CLAUDE_CODE } from "./claude-code"

describe("claudeCodeUpToDate : la version qui tient la porte du runner", () => {
  it.each([
    [MIN_CLAUDE_CODE, true],
    ["2.1.312 (Claude Code)", true],
    ["2.2.0", true],
    ["2.1.293 (Claude Code)", false],
    ["2.0.999", false],
    ["", false],
    [null, false],
  ])("%s -> %s", (version, expected) => {
    expect(claudeCodeUpToDate(version)).toBe(expected)
  })
})
