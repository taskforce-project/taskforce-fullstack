import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiClient } from "./client"
import { chooseStorage, getDocumentLink, getStorage, resetStorage } from "./storage-service"

vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

const envelope = <T>(payload: T) => ({ data: { success: true, message: "ok", data: payload } })
const OVERVIEW = {
  scope: "workspace", canEdit: true, inherited: null, documents: [],
  target: { storage: "server", folderName: null, folderUrl: null, path: null, from: "default", chosenBy: null },
  choices: [{ storage: "server", state: "ready" }],
}

describe("storage-service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads the workspace's place quietly, and a project's at its own route", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope(OVERVIEW))

    expect(await getStorage("acme", null)).toEqual(OVERVIEW)
    expect(apiClient.get).toHaveBeenCalledWith("/api/workspaces/acme/storage", { silentError: true })
    await getStorage("acme", 30)
    expect(apiClient.get).toHaveBeenLastCalledWith("/api/workspaces/acme/projects/30/storage", { silentError: true })
  })

  it("chooses a place with its folder, and goes back to the one above", async () => {
    vi.mocked(apiClient.put).mockResolvedValue(envelope(OVERVIEW))
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(OVERVIEW))

    await chooseStorage("acme", 30, { storage: "onedrive", driveId: "d", folderId: "f" })
    expect(apiClient.put).toHaveBeenCalledWith("/api/workspaces/acme/projects/30/storage",
      { storage: "onedrive", driveId: "d", folderId: "f" })
    expect(await resetStorage("acme", null)).toEqual(OVERVIEW)
    expect(apiClient.delete).toHaveBeenCalledWith("/api/workspaces/acme/storage")
  })

  it("asks for the link that opens a saved document", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope({ url: "https://files.example/x" }))

    expect(await getDocumentLink("acme", 12)).toBe("https://files.example/x")
    expect(apiClient.get).toHaveBeenCalledWith("/api/workspaces/acme/storage/documents/12/link")
  })
})
