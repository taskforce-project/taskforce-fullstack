import { describe, it, expect, vi } from "vitest"

import { getAiStatus } from "./ai-status-service"
import { apiClient } from "./client"
import { AI_ROUTES } from "../config/api-routes"

vi.mock("./client", () => ({ apiClient: { get: vi.fn() } }))

describe("ai-status-service", () => {
  it("GET /api/ai/status, sans toast d'erreur, et renvoie data", async () => {
    const status = { configured: false, chatAvailable: false, chatModel: null, fastModel: null,
      embeddingsAvailable: false, embeddingModel: null }
    vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: status } })

    await expect(getAiStatus()).resolves.toEqual(status)
    expect(apiClient.get).toHaveBeenCalledWith(AI_ROUTES.STATUS, { silentError: true })
  })
})
