import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { toast } from "sonner"

import type { StorageOverview } from "@/lib/api/storage-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { useStorageStore } from "@/lib/store/storage-store"
import { StoragePanel, placeLine } from "./storage-panel"

const chooseFolder = vi.hoisted(() => vi.fn())
vi.mock("@/lib/desktop", () => ({ IS_DESKTOP: false, desktopBridge: () => ({ storage: { chooseFolder } }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const t = CONSTANTS_EN.storage

function overview(overrides: Partial<StorageOverview> = {}): StorageOverview {
  return {
    scope: "workspace", canEdit: true, inherited: null,
    target: { storage: "server", folderName: null, folderUrl: null, path: null, from: "default", chosenBy: null },
    choices: [{ storage: "server", state: "ready" }, { storage: "machine", state: "ready" }],
    documents: [{
      id: 1, title: "Weekly report", fileName: "Weekly report.md", storage: "google-drive", folderName: "Reports",
      webUrl: "https://drive.example/f", version: "3", sizeBytes: 42, savedAt: "2026-11-12T10:00:00", projectId: null,
      savedFor: "Ada", approvedBy: "Ada",
    }],
    ...overrides,
  }
}

const fetchStorage = vi.fn()
const chooseStorage = vi.fn()
const resetStorage = vi.fn()
const documentLink = vi.fn()

function given(o: StorageOverview | null, loadFailed = false) {
  useStorageStore.setState({
    overview: o, key: "acme:", loading: false, loadFailed, saving: false, error: null,
    fetchStorage, chooseStorage, resetStorage, documentLink,
  })
}

describe("StoragePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchStorage.mockResolvedValue(null)
  })

  it("says where documents go, and where each saved one lives", () => {
    given(overview())
    render(<StoragePanel slug="acme" />)

    expect(screen.getByText(t.currentLine.replace("{where}", t.places.server))).toBeTruthy()
    expect(screen.getByText(t.defaultNote)).toBeTruthy()
    expect(screen.getByText("Weekly report")).toBeTruthy()
    expect(screen.getByText(/Google Drive, in Reports/)).toBeTruthy()
    expect(fetchStorage).toHaveBeenCalledWith("acme", null)
  })

  it("says a failed read, with a way to try again", () => {
    given(null, true)
    render(<StoragePanel slug="acme" />)
    fireEvent.click(screen.getByRole("button", { name: t.retry }))
    expect(fetchStorage).toHaveBeenCalledTimes(2)
  })

  it("chooses a folder on this computer and saves it", async () => {
    given(overview())
    chooseFolder.mockResolvedValue("C:\\Reports")
    chooseStorage.mockResolvedValue(overview())
    render(<StoragePanel slug="acme" />)

    fireEvent.click(screen.getByRole("button", { name: t.change }))
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(t.places.machine) }))
    fireEvent.click(screen.getByRole("button", { name: t.chooseFolder }))
    await screen.findByText("C:\\Reports")
    fireEvent.click(screen.getByRole("button", { name: t.save }))

    await waitFor(() => expect(chooseStorage).toHaveBeenCalledWith("acme", null, { storage: "machine", path: "C:\\Reports" }))
    expect(toast.success).toHaveBeenCalledWith(t.saved)
  })

  it("a project shows the workspace's choice, and a member only reads it", () => {
    given(overview({ scope: "project", canEdit: false, target: { storage: "onedrive", folderName: "Team", folderUrl: null,
      path: null, from: "workspace", chosenBy: null } }))
    useStorageStore.setState({ key: "acme:30" })
    render(<StoragePanel slug="acme" projectId={30} />)

    expect(screen.getByText(t.inheritedNote)).toBeTruthy()
    expect(screen.getByText(t.readOnlyProject)).toBeTruthy()
    expect(screen.queryByRole("button", { name: t.change })).toBeNull()
  })

  it("a document kept in TaskForce opens through a temporary link", async () => {
    documentLink.mockResolvedValue(null)
    given(overview({ documents: [{ ...overview().documents[0], storage: "server", webUrl: null, folderName: null }] }))
    render(<StoragePanel slug="acme" />)

    fireEvent.click(screen.getByRole("button", { name: t.open }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(t.linkFailed))
  })

  it("placeLine says the folder when there is one", () => {
    expect(placeLine({ storage: "machine", folderName: null, path: "D:\\x" }, t)).toBe("On this computer, in D:\\x")
    expect(placeLine({ storage: "server", folderName: null, path: null }, t)).toBe("In TaskForce")
  })
})
