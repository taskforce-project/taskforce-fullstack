import { beforeEach, describe, expect, it, vi } from "vitest"

import { AI_TIMEOUT_MS, apiClient } from "./client"
import {
  chooseBlindTrial,
  getBenchmarkDetail,
  getBenchmarkMatrix,
  playBenchmarkCase,
  playBlindTrialLetter,
  setBenchmarkVerdict,
  startBenchmarkRun,
  startBlindTrial,
} from "./model-benchmark-service"

vi.mock("./client", () => ({
  AI_TIMEOUT_MS: 200_000,
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

const envelope = <T>(payload: T) => ({ data: { success: true, message: "ok", data: payload } })
const BASE = "/api/workspaces/acme/ai/benchmark"

/** Le banc des modèles (R131) : chaque route, l'enveloppe lue dans `response.data.data`, le délai de l'IA sur ce qui la fait répondre. */
describe("model-benchmark-service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads the matrix and a model's detail without a toast (background calls)", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({ models: [] })).mockResolvedValueOnce(envelope({ model: "qwen3:8b" }))

    expect(await getBenchmarkMatrix("acme")).toEqual({ models: [] })
    expect(apiClient.get).toHaveBeenCalledWith(BASE, { silentError: true })
    expect(await getBenchmarkDetail("acme", "org/qwen3:8b")).toEqual({ model: "qwen3:8b" })
    expect(apiClient.get).toHaveBeenLastCalledWith(`${BASE}/detail`, { params: { model: "org/qwen3:8b" }, silentError: true })
  })

  it("opens a run of a model, then plays a case with the AI's timeout", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope({ runId: 9 })).mockResolvedValueOnce(envelope({ passed: true }))

    expect(await startBenchmarkRun("acme", "qwen3:8b")).toEqual({ runId: 9 })
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/runs`, { model: "qwen3:8b" })
    expect(await playBenchmarkCase("acme", 9, "act-three-steps")).toEqual({ passed: true })
    expect(apiClient.post).toHaveBeenLastCalledWith(`${BASE}/runs/9/cases/act-three-steps`, undefined, { timeout: AI_TIMEOUT_MS })
  })

  it.each([[true], [false], [null]])("overturns a case: %s", async (passed) => {
    vi.mocked(apiClient.put).mockResolvedValue(envelope({ model: "qwen3:8b" }))

    expect(await setBenchmarkVerdict("acme", 55, passed)).toEqual({ model: "qwen3:8b" })
    expect(apiClient.put).toHaveBeenCalledWith(`${BASE}/results/55/verdict`, { passed })
  })

  it("runs a blind trial: the letters, an answer with the AI's timeout, then the choice", async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce(envelope({ trialId: 4, letters: ["A", "B"] }))
      .mockResolvedValueOnce(envelope({ letter: "A", answer: "An answer" }))
      .mockResolvedValueOnce(envelope({ chosenLetter: "B" }))
    const request = { projectId: 3, issueId: 40, task: "summarize", models: ["qwen3:8b", "qwen3:14b"] }

    expect(await startBlindTrial("acme", request)).toEqual({ trialId: 4, letters: ["A", "B"] })
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/trials`, request)
    expect(await playBlindTrialLetter("acme", 4, "A")).toEqual({ letter: "A", answer: "An answer" })
    expect(apiClient.post).toHaveBeenLastCalledWith(`${BASE}/trials/4/letters/A`, undefined, { timeout: AI_TIMEOUT_MS })
    expect(await chooseBlindTrial("acme", 4, null)).toEqual({ chosenLetter: "B" })
    expect(apiClient.post).toHaveBeenLastCalledWith(`${BASE}/trials/4/choice`, { letter: null })
  })
})
