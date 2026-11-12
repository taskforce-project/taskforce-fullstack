import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { CONSTANTS_EN } from "@/lib/constants_en"
import { useStorageStore } from "@/lib/store/storage-store"
import { MicrosoftFolderDialog } from "./microsoft-folder-dialog"

const t = CONSTANTS_EN.storage.folders
const microsoftFolders = vi.fn()

describe("MicrosoftFolderDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStorageStore.setState({ microsoftFolders })
  })

  it("starts at OneDrive and the SharePoint libraries, opens a folder, and uses it", async () => {
    microsoftFolders.mockImplementation(async (_slug: string, driveId?: string) => driveId
      ? [{ driveId: "d1", itemId: "f1", name: "Reports", kind: "folder" }]
      : [{ driveId: "d1", itemId: "root", name: "OneDrive", kind: "drive" },
         { driveId: "d2", itemId: "root", name: "Finance · Documents", kind: "library" }])
    const onPick = vi.fn()
    render(<MicrosoftFolderDialog slug="acme" onPick={onPick} onClose={vi.fn()} />)

    expect((screen.getByRole("button", { name: t.useThis }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(await screen.findByText(t.myFiles))
    fireEvent.click(await screen.findByText("Reports"))
    await waitFor(() => expect(microsoftFolders).toHaveBeenLastCalledWith("acme", "d1", "f1"))
    fireEvent.click(screen.getByRole("button", { name: t.useThis }))

    expect(onPick).toHaveBeenCalledWith({ driveId: "d1", folderId: "f1", label: `${t.myFiles} / Reports` })
  })

  it("says when nothing is there, goes back, and says a failed list", async () => {
    microsoftFolders.mockResolvedValueOnce([{ driveId: "d2", itemId: "root", name: "Finance · Documents", kind: "library" }])
    microsoftFolders.mockResolvedValueOnce([])
    microsoftFolders.mockResolvedValueOnce(null)
    render(<MicrosoftFolderDialog slug="acme" onPick={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByText("Finance · Documents"))
    expect(await screen.findByText(t.empty)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: new RegExp(t.up) }))
    expect(await screen.findByText(t.failed)).toBeTruthy()
  })
})
