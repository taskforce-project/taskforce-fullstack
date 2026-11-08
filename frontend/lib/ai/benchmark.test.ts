import { describe, expect, it } from "vitest"

import { cellTitle, estimateOf, judgeWord, roughDuration, timeText, verdictSign, verdictWord } from "./benchmark"
import type { BenchmarkCell, BenchmarkMatrix, BenchmarkVerdict } from "@/lib/api/model-benchmark-service"
import { CONSTANTS_EN } from "@/lib/constants_en"

const t = CONSTANTS_EN.benchmark

const cell = (verdict: BenchmarkVerdict | null, judge: BenchmarkCell["judge"] = null): BenchmarkCell => ({
  task: "summarize", verdict, passed: 2, measured: 3, total: 3, judge,
})

/** Le verdict du banc (R131), dans les mots de l'interface : le signe, le mot, le survol, un temps, une durée approchée. */
describe("benchmark", () => {
  it.each([
    ["give_it", "full", "Give it"],
    ["with_review", "half", "With review"],
    ["not_yet", "empty", "Not yet"],
    [null, "none", "Not run"],
  ] as const)("reads the verdict %s as the sign %s and the word %s", (verdict, sign, word) => {
    expect(verdictSign(verdict)).toBe(sign)
    expect(verdictWord(verdict, t)).toBe(word)
  })

  it.each([
    ["you", "Your verdict"],
    ["member", "A teammate's verdict"],
    [null, null],
  ] as const)("says whose verdict it is: %s", (judge, word) => {
    expect(judgeWord(judge, t)).toBe(word)
  })

  it("says on hover what a cell is based on, and whose it is", () => {
    expect(cellTitle("Summarize", cell("with_review"), t)).toBe("Summarize: With review, 2 of 3 cases")
    expect(cellTitle("Summarize", cell("give_it", "you"), t)).toBe("Summarize: Give it, 2 of 3 cases · Your verdict")
    expect(cellTitle("Summarize", cell(null), t)).toBe("Summarize: Not run")
  })

  it.each([
    [null, "-"],
    [400, "1 s"],
    [12_000, "12 s"],
    [64_000, "1 min 4 s"],
  ])("writes a time of %s ms as %s", (ms, text) => {
    expect(timeText(ms, t)).toBe(text)
  })

  it("rounds a duration to the minute, never to zero", () => {
    expect(roughDuration(20, t)).toBe("About 1 min")
    expect(roughDuration(660, t)).toBe("About 11 min")
  })

  it("adds the estimates of the chosen models", () => {
    const matrix = {
      models: [
        { model: "a", estimateSeconds: 60 },
        { model: "b", estimateSeconds: 120 },
        { model: "c", estimateSeconds: 400 },
      ],
    } as unknown as BenchmarkMatrix
    expect(estimateOf(matrix, ["a", "b"])).toBe(180)
    expect(estimateOf(matrix, [])).toBe(0)
  })
})
