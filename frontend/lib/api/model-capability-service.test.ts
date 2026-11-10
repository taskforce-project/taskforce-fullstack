import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiClient } from "./client"
import { BENCHMARK_CASE_TIMEOUT_MS } from "./model-benchmark-service"
import { chooseModel, getModelCapabilities, measureModelCase, startModelMeasure } from "./model-capability-service"

vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

const envelope = <T>(payload: T) => ({ data: { success: true, message: "ok", data: payload } })
const BASE = "/api/workspaces/acme/ai/models"

describe("model-capability-service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads the table without a toast (background call)", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope({ models: [] }))

    expect(await getModelCapabilities("acme")).toEqual({ models: [] })
    expect(apiClient.get).toHaveBeenCalledWith(BASE, { silentError: true })
  })

  it("opens a measure of a model, then replays a case with the AI's timeout", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope({ runId: 9 })).mockResolvedValueOnce(envelope({ passed: true }))

    expect(await startModelMeasure("acme", "qwen3:8b")).toEqual({ runId: 9 })
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/runs`, { model: "qwen3:8b" })
    expect(await measureModelCase("acme", 9, "tools-move")).toEqual({ passed: true })
    expect(apiClient.post).toHaveBeenLastCalledWith(`${BASE}/runs/9/cases/tools-move`, undefined, { timeout: BENCHMARK_CASE_TIMEOUT_MS, silentError: true })
  })

  it("chooses the model of Cortex, or goes back to the instance's", async () => {
    vi.mocked(apiClient.put).mockResolvedValue(envelope({ choice: null }))

    expect(await chooseModel("acme", null)).toEqual({ choice: null })
    expect(apiClient.put).toHaveBeenCalledWith(`${BASE}/choice`, { model: null })
  })
})
