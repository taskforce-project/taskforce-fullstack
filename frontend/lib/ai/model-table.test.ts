import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"
import type { ModelCapabilityRow, ModelCapabilityScore, ModelCapabilityTable } from "@/lib/api/model-capability-service"
import { failedCaseTitles, fillModelText, proposalLines, proposedFor, scoreSign, scoreText } from "./model-table"

const t = CONSTANTS_EN.models

const score = (over: Partial<ModelCapabilityScore> = {}): ModelCapabilityScore => ({
  capability: "tools", passed: 2, measured: 2, total: 2, capable: true, heldWords: null, measuredAt: "2026-11-04T10:00:00", tooSlow: 0,
  ...over,
})

describe("scoreText and scoreSign : une capacité d'un modèle (R113, R130)", () => {
  it.each([
    ["passed", score(), "2/2", "passed"],
    ["failed once", score({ passed: 1, capable: false }), "1/2", "partly"],
    ["failed all", score({ passed: 0, capable: false }), "0/2", "failed"],
    ["not measured", score({ passed: 0, measured: 0, capable: false, measuredAt: null }), "Not measured", "none"],
    ["measured in part", score({ passed: 1, measured: 1, capable: false }), "1 of 1 measured", "partly"],
    ["a long context held", score({ capability: "context", heldWords: 3000 }), "2/2 · holds 3,000 words", "passed"],
    ["only the short document", score({ capability: "context", passed: 1, capable: false, heldWords: 500 }),
      "1/2 · holds 500 words", "partly"],
    ["no document", score({ capability: "context", passed: 0, capable: false, heldWords: 0 }),
      "0/2 · lost the shortest document", "failed"],
    ["too slow on every case", score({ passed: 0, measured: 0, capable: false, tooSlow: 2 }), "2 too slow here", "slow"],
    ["too slow on one case", score({ passed: 1, measured: 1, capable: false, tooSlow: 1 }), "1 of 1 measured · 1 too slow here", "slow"],
  ])("%s", (_label, s, text, sign) => {
    expect(scoreText(s, t)).toBe(text)
    expect(scoreSign(s)).toBe(sign)
  })
})

describe("proposalLines : ce que TaskForce propose", () => {
  const table: ModelCapabilityTable = {
    provider: "OLLAMA", instanceModel: "qwen3:8b", choice: null, current: "qwen3:8b", suiteVersion: 1,
    capabilities: [
      { key: "tools", label: "Tools", description: "", cases: 2 },
      { key: "context", label: "Long context", description: "", cases: 2 },
    ],
    cases: [], models: [], proposals: [{ capability: "tools", model: "qwen3:8b" }], proposed: null,
  }

  it("names the first capable model of each capability, and says when none passed everything", () => {
    expect(proposalLines(table, t)).toEqual({
      overall: "No model passed every case yet: measure the models to see which one fits.",
      each: ["Tools: qwen3:8b", "Long context: no model yet"],
    })
    expect(proposalLines({ ...table, proposed: "qwen3:14b" }, t).overall).toBe("For everything measured: qwen3:14b.")
  })

  it("says what TaskForce proposes a model for, in its detail", () => {
    expect(proposedFor(table, "qwen3:8b", t)).toBe("TaskForce proposes it for Tools.")
    expect(proposedFor(table, "qwen3:14b", t)).toBeNull()
    expect(proposedFor({ ...table, proposed: "qwen3:14b" }, "qwen3:14b", t)).toBe("TaskForce proposes it for everything measured.")
    expect(proposedFor({ ...table, proposals: [{ capability: "new", model: "qwen3:8b" }] }, "qwen3:8b", t)).toBe("TaskForce proposes it for new.")
  })

  const row: ModelCapabilityRow = {
    model: "qwen3:8b", current: true, measuredAt: "2026-11-04T10:00:00",
    scores: [score(), score({ capability: "context", passed: 1, capable: false }), score({ capability: "new" })],
    failedCases: ["tools-move", "gone"],
  }

  it("names the failed cases of a model; a case it does not know keeps its key; none without the field", () => {
    const withCases = { ...table, cases: [{ key: "tools-move", capability: "tools", title: "Move an issue" }] }
    expect(failedCaseTitles(withCases, row)).toEqual(["Move an issue", "gone"])
    expect(failedCaseTitles(withCases, { ...row, failedCases: undefined })).toEqual([])
  })

  it("fills a text and leaves an unknown placeholder", () => {
    expect(fillModelText("{model} and {other}", { model: "qwen3:8b" })).toBe("qwen3:8b and {other}")
  })
})
