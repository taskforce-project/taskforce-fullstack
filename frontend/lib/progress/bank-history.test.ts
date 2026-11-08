import { describe, expect, it } from "vitest"

import type { EvalHistoryCase, EvalHistoryRun } from "@/lib/api/eval-service"
import { CONSTANTS_EN } from "@/lib/constants_en"

import { bankCurve, caseLines, caseOrigin, isFinished, lastMark, passRate, runModel } from "./bank-history"

const T = CONSTANTS_EN.progress

const run = (patch: Partial<EvalHistoryRun>): EvalHistoryRun => ({
  id: 1, model: "qwen3:8b", answeredBy: "qwen3:8b", startedAt: "2026-11-02T15:08:00", finishedAt: "2026-11-02T15:12:00",
  total: 11, graded: 11, passed: 5, ...patch,
})

const CASE: EvalHistoryCase = {
  id: 40, title: "R118 4/6: delete TESTTA-2", question: "suprime testta 2", askedOn: "2026-11-02",
  addedAt: "2026-11-03T09:00:00", mine: true, origin: { kind: "unknown", said: [], shown: null }, grades: [],
}

/** L'histoire de la banque (R61, R118, R125) : la courbe par modèle, les notes d'un cas, son origine. */
describe("the model of a run", () => {
  it.each([
    [{ model: "qwen3:8b", answeredBy: "qwen3:8b" }, "qwen3:8b"],
    [{ model: "default", answeredBy: "qwen3:8b" }, "qwen3:8b"],
    [{ model: "qwen3:14b", answeredBy: null }, "qwen3:14b"],
    [{ model: "default", answeredBy: null }, null],
  ])("is the one that answered, else the one asked: %o", (patch, model) => {
    expect(runModel(patch)).toBe(model)
  })

  it("counts a run in the curve once every case is graded", () => {
    expect(isFinished(run({}))).toBe(true)
    expect(isFinished(run({ finishedAt: null }))).toBe(false)
    expect(isFinished(run({ total: 0 }))).toBe(false)
  })

  it.each([[5, 11, 45], [11, 11, 100], [0, 0, 0]])("passes %i of %i: %i%%", (passed, total, rate) => {
    expect(passRate({ passed, total })).toBe(rate)
  })
})

describe("lastMark", () => {
  it("is the latest replay of a case, whatever the model; null without a replay", () => {
    expect(lastMark([])).toBeNull()
    expect(lastMark([
      { model: "qwen3:8b", marks: [{ runId: 1, passed: true, day: "2 Nov" }, { runId: 3, passed: false, day: "5 Nov" }] },
      { model: "qwen3:14b", marks: [{ runId: 2, passed: true, day: "3 Nov" }] },
    ])).toEqual({ runId: 3, passed: false, day: "5 Nov", model: "qwen3:8b" })
  })
})

describe("bankCurve", () => {
  it("waits for two finished runs", () => {
    expect(bankCurve([], "Default model")).toBeNull()
    expect(bankCurve([run({}), run({ id: 2, finishedAt: null })], "Default model")).toBeNull()
  })

  it("draws a point per finished run, a line per model, keys without dots", () => {
    const curve = bankCurve([
      run({ id: 1, passed: 5 }),
      run({ id: 2, model: "qwen2.5:7b", answeredBy: null, startedAt: "2026-11-05T10:00:00", passed: 8 }),
      run({ id: 3, startedAt: "2026-11-07T10:00:00", passed: 9, finishedAt: null }),
      run({ id: 4, model: "default", answeredBy: null, startedAt: "2026-11-07T11:00:00", passed: 11 }),
      run({ id: 5, startedAt: "2026-11-08T10:00:00", passed: 10 }),
    ], "Default model")

    expect(curve?.series).toEqual([
      { key: "m0", model: "qwen3:8b" }, { key: "m1", model: "qwen2.5:7b" }, { key: "m2", model: "Default model" },
    ])
    expect(curve?.points.map((point) => [point.runId, point.rates])).toEqual([
      [1, { m0: 45 }], [2, { m1: 73 }], [4, { m2: 100 }], [5, { m0: 91 }],
    ])
    expect(curve?.points[0]).toMatchObject({ at: Date.UTC(2026, 10, 2, 15, 8), model: "qwen3:8b", passed: 5, total: 11 })
  })
})

describe("caseLines", () => {
  it("gives a case's result at each replay since it entered, by model, in the order of the replays", () => {
    const runs = [
      run({ id: 1 }),
      run({ id: 2, model: "qwen3:14b", answeredBy: null, startedAt: "2026-11-05T10:00:00" }),
      run({ id: 3, startedAt: "2026-11-07T10:00:00" }),
    ]
    const lines = caseLines({ grades: [
      { runId: 1, passed: false }, { runId: 2, passed: true }, { runId: 3, passed: true }, { runId: 99, passed: true },
    ] }, runs, "Default model")

    expect(lines).toEqual([
      { model: "qwen3:8b", marks: [{ runId: 1, passed: false, day: "2 Nov" }, { runId: 3, passed: true, day: "7 Nov" }] },
      { model: "qwen3:14b", marks: [{ runId: 2, passed: true, day: "5 Nov" }] },
    ])
  })

  it("has nothing for a case not replayed since it was added", () => {
    expect(caseLines({ grades: [] }, [run({})], "Default model")).toEqual([])
  })
})

describe("caseOrigin", () => {
  it("tells a trust incident, what Cortex said and what TaskForce showed (E17)", () => {
    expect(caseOrigin({ ...CASE, origin: { kind: "incident", said: ["I deleted", " TESTTA-2."], shown: "Nothing was deleted." } }, T))
      .toEqual({
        origin: "From a trust incident on 2 Nov: TaskForce corrected the answer.",
        said: "Cortex said: I deleted TESTTA-2.",
        shown: "TaskForce showed: Nothing was deleted.",
      })
  })

  it("clips a long sentence, and leaves out what the incident doesn't keep", () => {
    const origin = caseOrigin({ ...CASE, origin: { kind: "incident", said: ["x".repeat(400)], shown: null } }, T)

    expect(origin.said).toHaveLength("Cortex said: ".length + 241)
    expect(origin.said?.endsWith("…")).toBe(true)
    expect(origin.shown).toBeNull()
    expect(caseOrigin({ ...CASE, origin: { kind: "incident", said: [" "], shown: null } }, T).said).toBeNull()
  })

  it.each([
    ["answer", "From an answer of Cortex on 2 Nov."],
    ["unknown", "Asked on 2 Nov."],
  ] as const)("tells an origin of kind %s by its day", (kind, line) => {
    expect(caseOrigin({ ...CASE, origin: { kind, said: [], shown: null } }, T)).toEqual({ origin: line, said: null, shown: null })
  })
})
