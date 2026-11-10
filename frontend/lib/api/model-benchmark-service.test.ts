import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiClient } from "./client"
import {
  BENCHMARK_CASE_TIMEOUT_MS,
  chooseBlindTrial,
  getBenchmarkDetail,
  getBenchmarkHistory,
  getBenchmarkMatrix,
  loadBenchmarkModel,
  playBenchmarkCase,
  playBlindTrialLetter,
  setBenchmarkVerdict,
  startBenchmarkRun,
  startBlindTrial,
  stopBenchmark,
} from "./model-benchmark-service"

vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

const envelope = <T>(payload: T) => ({ data: { success: true, message: "ok", data: payload } })
const BASE = "/api/workspaces/acme/ai/benchmark"

/** Le banc des modèles (R131, R142) : chaque route, l'enveloppe lue dans `response.data.data`, le budget d'un cas sur ce qui fait répondre l'IA. */
describe("model-benchmark-service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("waits longer than the five minutes a case gets on the server", () => {
    expect(BENCHMARK_CASE_TIMEOUT_MS).toBeGreaterThan(5 * 60_000)
  })

  it("reads the matrix, a model's detail and the runs without a toast (background calls)", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(envelope({ models: [] }))
      .mockResolvedValueOnce(envelope({ model: "qwen3:8b" }))
      .mockResolvedValueOnce(envelope([{ runId: 1 }]))

    expect(await getBenchmarkMatrix("acme")).toEqual({ models: [] })
    expect(apiClient.get).toHaveBeenCalledWith(BASE, { silentError: true })
    expect(await getBenchmarkDetail("acme", "org/qwen3:8b")).toEqual({ model: "qwen3:8b" })
    expect(apiClient.get).toHaveBeenLastCalledWith(`${BASE}/detail`, { params: { model: "org/qwen3:8b" }, silentError: true })
    expect(await getBenchmarkHistory("acme")).toEqual([{ runId: 1 }])
    expect(apiClient.get).toHaveBeenLastCalledWith(`${BASE}/history`, { silentError: true })
  })

  it("opens a run, loads its model, then plays a case, with the budget of a case and no toast", async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce(envelope({ runId: 9 }))
      .mockResolvedValueOnce(envelope({ status: "loaded" }))
      .mockResolvedValueOnce(envelope({ passed: true }))

    expect(await startBenchmarkRun("acme", "qwen3:8b")).toEqual({ runId: 9 })
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/runs`, { model: "qwen3:8b" })
    expect(await loadBenchmarkModel("acme", 9)).toEqual({ status: "loaded" })
    expect(apiClient.post).toHaveBeenLastCalledWith(`${BASE}/runs/9/load`, undefined, { timeout: BENCHMARK_CASE_TIMEOUT_MS, silentError: true })
    expect(await playBenchmarkCase("acme", 9, "act-three-steps")).toEqual({ passed: true })
    expect(apiClient.post).toHaveBeenLastCalledWith(`${BASE}/runs/9/cases/act-three-steps`, undefined, { timeout: BENCHMARK_CASE_TIMEOUT_MS, silentError: true })
  })

  it("stops the person's run", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope(null))

    await stopBenchmark("acme")

    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/stop`, undefined, { silentError: true })
  })

  it.each([[true], [false], [null]])("overturns a case: %s", async (passed) => {
    vi.mocked(apiClient.put).mockResolvedValue(envelope({ model: "qwen3:8b" }))

    expect(await setBenchmarkVerdict("acme", 55, passed)).toEqual({ model: "qwen3:8b" })
    expect(apiClient.put).toHaveBeenCalledWith(`${BASE}/results/55/verdict`, { passed })
  })

  it("runs a trial: the letters, an answer with the budget of a case, then the choice", async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce(envelope({ trialId: 4, letters: ["A", "B"] }))
      .mockResolvedValueOnce(envelope({ letter: "A", answer: "An answer" }))
      .mockResolvedValueOnce(envelope({ chosenLetter: "B" }))
    const request = { projectId: 3, issueId: 40, task: "summarize", models: ["qwen3:8b", "qwen3:14b"] }

    expect(await startBlindTrial("acme", request)).toEqual({ trialId: 4, letters: ["A", "B"] })
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/trials`, request)
    expect(await playBlindTrialLetter("acme", 4, "A")).toEqual({ letter: "A", answer: "An answer" })
    expect(apiClient.post).toHaveBeenLastCalledWith(`${BASE}/trials/4/letters/A`, undefined, { timeout: BENCHMARK_CASE_TIMEOUT_MS })
    expect(await chooseBlindTrial("acme", 4, null)).toEqual({ chosenLetter: "B" })
    expect(apiClient.post).toHaveBeenLastCalledWith(`${BASE}/trials/4/choice`, { letter: null })
  })
})
