import { describe, it, expect, beforeEach, vi } from "vitest"

import { useAiStatusStore } from "./ai-status-store"
import { getAiStatus, type AiStatus } from "../api/ai-status-service"

vi.mock("../api/ai-status-service", () => ({ getAiStatus: vi.fn() }))

const ready: AiStatus = {
  configured: true, chatAvailable: true, chatModel: "qwen3:8b", fastModel: "qwen3:4b",
  embeddingsAvailable: true, embeddingModel: "bge-m3",
}

describe("ai-status-store", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAiStatusStore.setState({ status: null, fetchedAt: 0 })
  })

  it("lit l'état puis le garde une minute", async () => {
    vi.mocked(getAiStatus).mockResolvedValue(ready)

    await useAiStatusStore.getState().fetchStatus()
    const second = await useAiStatusStore.getState().fetchStatus()

    expect(second).toEqual(ready)
    expect(getAiStatus).toHaveBeenCalledTimes(1)
    expect(useAiStatusStore.getState().status).toEqual(ready)
  })

  it.each([
    ["force", true, 0, { refresh: true }],
    ["état périmé", false, Date.now() - 61_000, {}],
  ])("relit l'état (%s)", async (_label, force, fetchedAt, options) => {
    useAiStatusStore.setState({ status: ready, fetchedAt })
    vi.mocked(getAiStatus).mockResolvedValue({ ...ready, chatAvailable: false })

    const next = await useAiStatusStore.getState().fetchStatus(force)

    expect(next?.chatAvailable).toBe(false)
    expect(getAiStatus).toHaveBeenCalledTimes(1)
    expect(getAiStatus).toHaveBeenCalledWith(options)
  })

  it("échec de lecture → null, état conservé, pas d'exception", async () => {
    useAiStatusStore.setState({ status: ready, fetchedAt: 0 })
    vi.mocked(getAiStatus).mockRejectedValue(new Error("network"))

    await expect(useAiStatusStore.getState().fetchStatus()).resolves.toBeNull()
    expect(useAiStatusStore.getState().status).toEqual(ready)
  })
})
