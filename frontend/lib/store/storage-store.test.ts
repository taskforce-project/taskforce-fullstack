import { beforeEach, describe, expect, it, vi } from "vitest"

import * as service from "../api/storage-service"
import * as picker from "../storage/google-picker"
import type { StorageOverview } from "../api/storage-service"
import { useStorageStore } from "./storage-store"

vi.mock("../api/storage-service", () => ({
  getStorage: vi.fn(),
  chooseStorage: vi.fn(),
  resetStorage: vi.fn(),
  getDocumentLink: vi.fn(),
  getGooglePicker: vi.fn(),
  getMicrosoftFolders: vi.fn(),
}))
vi.mock("../storage/google-picker", () => ({ pickFromGoogleDrive: vi.fn() }))
vi.mock("../api/client", () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : "error"),
}))

const overview = (storage: StorageOverview["target"]["storage"]): StorageOverview => ({
  scope: "workspace", canEdit: true, inherited: null, documents: [],
  target: { storage, folderId: null, driveId: null, folderName: null, folderUrl: null, path: null, from: "workspace", chosenBy: null },
  choices: [{ storage: "server", state: "ready" }],
})

describe("storage-store", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStorageStore.setState({ overview: null, key: null, loading: false, loadFailed: false, saving: false, error: null })
  })

  it("reads a place, and forgets the one of another workspace or project", async () => {
    vi.mocked(service.getStorage).mockResolvedValue(overview("server"))

    expect(await useStorageStore.getState().fetchStorage("acme", null)).toEqual(overview("server"))
    expect(useStorageStore.getState()).toMatchObject({ key: "acme:", loading: false })

    vi.mocked(service.getStorage).mockReturnValue(new Promise(() => undefined))
    void useStorageStore.getState().fetchStorage("acme", 30)
    expect(useStorageStore.getState()).toMatchObject({ key: "acme:30", overview: null, loading: true })
  })

  it("says a failed read instead of waiting", async () => {
    vi.mocked(service.getStorage).mockRejectedValue(new Error("down"))

    expect(await useStorageStore.getState().fetchStorage("acme", null)).toBeNull()
    expect(useStorageStore.getState()).toMatchObject({ loadFailed: true, error: "down", loading: false })
  })

  it("chooses a place and keeps what the server says, or null with the reason", async () => {
    vi.mocked(service.chooseStorage).mockResolvedValueOnce(overview("machine"))
    expect(await useStorageStore.getState().chooseStorage("acme", 30, { storage: "machine", path: "C:/Reports" }))
      .toEqual(overview("machine"))
    expect(useStorageStore.getState()).toMatchObject({ key: "acme:30", saving: false })

    vi.mocked(service.chooseStorage).mockRejectedValueOnce(new Error("This folder doesn't exist"))
    expect(await useStorageStore.getState().chooseStorage("acme", 30, { storage: "machine", path: "X" })).toBeNull()
    expect(useStorageStore.getState().error).toBe("This folder doesn't exist")
  })

  it("goes back to the choice above, or null with the reason", async () => {
    vi.mocked(service.resetStorage).mockResolvedValueOnce(overview("server"))
    expect(await useStorageStore.getState().resetStorage("acme", null)).toEqual(overview("server"))

    vi.mocked(service.resetStorage).mockRejectedValueOnce(new Error("Only owners"))
    expect(await useStorageStore.getState().resetStorage("acme", null)).toBeNull()
    expect(useStorageStore.getState()).toMatchObject({ saving: false, error: "Only owners" })
  })

  it("opens Google's picker with the person's own config, or null with the reason", async () => {
    const config = { developerKey: "k", appId: "1", accessToken: "t" }
    vi.mocked(service.getGooglePicker).mockResolvedValueOnce(config)
    vi.mocked(picker.pickFromGoogleDrive).mockResolvedValueOnce([{ id: "f", name: "Reports", url: null, mimeType: null }])
    expect(await useStorageStore.getState().pickGoogle("acme", "folder", "Choose a folder"))
      .toEqual([{ id: "f", name: "Reports", url: null, mimeType: null }])
    expect(picker.pickFromGoogleDrive).toHaveBeenCalledWith(config, "folder", "Choose a folder")

    vi.mocked(service.getGooglePicker).mockRejectedValueOnce(new Error("Connect Google Drive first"))
    expect(await useStorageStore.getState().pickGoogle("acme", "files", "x")).toBeNull()
    expect(useStorageStore.getState().error).toBe("Connect Google Drive first")
  })

  it("lists the folders of a Microsoft 365 place, or null with the reason", async () => {
    const folders = [{ driveId: "d", itemId: "root", name: "OneDrive", kind: "drive" as const }]
    vi.mocked(service.getMicrosoftFolders).mockResolvedValueOnce(folders)
    expect(await useStorageStore.getState().microsoftFolders("acme")).toEqual(folders)

    vi.mocked(service.getMicrosoftFolders).mockRejectedValueOnce(new Error("Connect Microsoft 365 first"))
    expect(await useStorageStore.getState().microsoftFolders("acme", "d", "i")).toBeNull()
    expect(useStorageStore.getState().error).toBe("Connect Microsoft 365 first")
  })

  it("gives a document's link, or null", async () => {
    vi.mocked(service.getDocumentLink).mockResolvedValueOnce("https://x")
    expect(await useStorageStore.getState().documentLink("acme", 1)).toBe("https://x")

    vi.mocked(service.getDocumentLink).mockRejectedValueOnce(new Error("gone"))
    expect(await useStorageStore.getState().documentLink("acme", 1)).toBeNull()
    expect(useStorageStore.getState().error).toBe("gone")
  })
})
