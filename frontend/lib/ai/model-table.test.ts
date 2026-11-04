import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"
import type { ModelCapabilityScore, ModelCapabilityTable } from "@/lib/api/model-capability-service"
import { fillModelText, proposalLines, scoreText, scoreTone } from "./model-table"

const t = CONSTANTS_EN.models

const score = (over: Partial<ModelCapabilityScore> = {}): ModelCapabilityScore => ({
  capability: "tools", passed: 2, measured: 2, total: 2, capable: true, heldWords: null, measuredAt: "2026-11-04T10:00:00",
  ...over,
})

describe("scoreText and scoreTone : une cellule de la table (R113)", () => {
  it.each([
    ["passed", score(), "2/2", "good"],
    ["failed once", score({ passed: 1, capable: false }), "1/2", "bad"],
    ["not measured", score({ passed: 0, measured: 0, capable: false, measuredAt: null }), "Not measured", "none"],
    ["measured in part", score({ passed: 1, measured: 1, capable: false }), "1 of 1 measured", "none"],
    ["a long context held", score({ capability: "context", heldWords: 3000 }), "2/2 · holds 3,000 words", "good"],
    ["only the short document", score({ capability: "context", passed: 1, capable: false, heldWords: 500 }),
      "1/2 · holds 500 words", "bad"],
    ["no document", score({ capability: "context", passed: 0, capable: false, heldWords: 0 }),
      "0/2 · lost the shortest document", "bad"],
  ])("%s", (_label, s, text, tone) => {
    expect(scoreText(s, t)).toBe(text)
    expect(scoreTone(s)).toBe(tone)
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

  it("fills a text and leaves an unknown placeholder", () => {
    expect(fillModelText("{model} and {other}", { model: "qwen3:8b" })).toBe("qwen3:8b and {other}")
  })
})
