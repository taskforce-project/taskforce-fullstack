import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"

import { compactedLine, contextFitLine } from "./context-line"

const t = CONSTANTS_EN.contextFit

// TF-J1-13 : quand TaskForce a dû condenser ou couper pour tenir la fenêtre du modèle, une ligne calme le dit, comme la
// ligne grise (R123, R129), et se relit dans une conversation rouverte.
describe("the quiet line of a turn that had to fit its context", () => {
  it.each([
    ["nothing touched", null, "qwen3:8b"],
    ["no read", undefined, "qwen3:8b"],
    ["all at zero", { summarized: 0, leftOut: 0, toolResults: 0 }, "qwen3:8b"],
    ["no model, a fallback", { summarized: 5, leftOut: 0, toolResults: 0 }, null],
    ["a blank model", { summarized: 5, leftOut: 0, toolResults: 0 }, "  "],
  ])("says nothing: %s", (_case, context, model) => {
    expect(contextFitLine(context, model, t)).toBeNull()
  })

  it.each([
    ["summarized", { summarized: 12, leftOut: 0, toolResults: 0 }, "Earlier messages summarized to fit qwen3:8b's context", "12 messages summarized"],
    ["one summarized", { summarized: 1, leftOut: 0, toolResults: 0 }, "Earlier messages summarized to fit qwen3:8b's context", "1 message summarized"],
    ["left out, the most serious first", { summarized: 3, leftOut: 2, toolResults: 0 }, "Earlier messages left out to fit qwen3:8b's context", "3 messages summarized · 2 messages left out"],
    ["one left out", { summarized: 0, leftOut: 1, toolResults: 0 }, "Earlier messages left out to fit qwen3:8b's context", "1 message left out"],
    ["tool results only", { summarized: 0, leftOut: 0, toolResults: 2 }, "Older tool results shortened to fit qwen3:8b's context", "2 tool results shortened"],
    ["one tool result", { summarized: 0, leftOut: 0, toolResults: 1 }, "Older tool results shortened to fit qwen3:8b's context", "1 tool result shortened"],
    ["everything", { summarized: 4, leftOut: 1, toolResults: 1 }, "Earlier messages left out to fit qwen3:8b's context", "4 messages summarized · 1 message left out · 1 tool result shortened"],
  ])("%s: one line, the detail on hover", (_case, context, line, detail) => {
    expect(contextFitLine(context, " qwen3:8b ", t)).toEqual({ line, detail })
  })
})

describe("what /compact says", () => {
  it("the conversation compacted, the count on hover", () => {
    expect(compactedLine(12, t)).toEqual({ line: "Conversation compacted", detail: "12 messages summarized" })
    expect(compactedLine(1, t).detail).toBe("1 message summarized")
  })

  it("nothing to compact", () => {
    expect(compactedLine(0, t)).toEqual({ line: t.nothingToCompact, detail: t.nothingToCompactDetail })
  })
})
