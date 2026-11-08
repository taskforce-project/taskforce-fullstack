import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiClient } from "./client"
import { getCortexSources } from "./cortex-sources-service"

vi.mock("./client", () => ({ apiClient: { get: vi.fn() } }))

const envelope = <T>(payload: T) => ({ data: { success: true, message: "ok", data: payload } })

describe("cortex-sources-service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads what Cortex can read in the workspace, without a toast (background call)", async () => {
    const sources = { sources: [{ key: "projects", count: 4, changedAt: "2026-11-07T18:02:00" }] }
    vi.mocked(apiClient.get).mockResolvedValue(envelope(sources))

    expect(await getCortexSources("acme")).toEqual(sources)
    expect(apiClient.get).toHaveBeenCalledWith("/api/workspaces/acme/assistant/sources", { silentError: true })
  })
})
