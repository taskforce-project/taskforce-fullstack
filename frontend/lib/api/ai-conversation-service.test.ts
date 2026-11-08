import { beforeEach, describe, expect, it, vi } from "vitest"

import { compactConversation } from "./ai-conversation-service"
import { AI_TIMEOUT_MS, apiClient } from "./client"
import { AI_ROUTES } from "../config/api-routes"

vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  AI_TIMEOUT_MS: 180000,
}))

describe("compactConversation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("asks the server to condense the conversation, with the time of an answer", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { summarized: 12 } } })

    await expect(compactConversation("acme", 7)).resolves.toEqual({ summarized: 12 })

    expect(apiClient.post).toHaveBeenCalledWith(AI_ROUTES.CONVERSATION_COMPACT("acme", 7), undefined, { timeout: AI_TIMEOUT_MS })
    expect(AI_ROUTES.CONVERSATION_COMPACT("acme", 7)).toBe("/api/workspaces/acme/ai/conversations/7/compact")
  })
})
