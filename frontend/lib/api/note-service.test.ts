import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiClient } from "./client"
import { getNote } from "./note-service"
import { NOTE_ROUTES } from "../config/api-routes"

vi.mock("./client", () => ({ apiClient: { get: vi.fn() } }))

describe("getNote", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lit la note par son id, sans toast : son dialogue dit ce qui n'a pas marché", async () => {
    const note = { id: 12, title: "Release process", content: "Steps.", domain: "RUNBOOKS", updatedAt: null }
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: note } })

    await expect(getNote("acme", 12)).resolves.toEqual(note)

    expect(apiClient.get).toHaveBeenCalledWith("/api/workspaces/acme/brain/nodes/12", { silentError: true })
    expect(NOTE_ROUTES.NOTE("acme", 12)).toBe("/api/workspaces/acme/brain/nodes/12")
  })
})
