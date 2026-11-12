import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { toast } from "sonner"

import { CONSTANTS_EN } from "@/lib/constants_en"
import { useStorageStore } from "@/lib/store/storage-store"
import { GoogleDriveFiles } from "./google-drive-files"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const t = CONSTANTS_EN.storage
const pickGoogle = vi.fn()

describe("GoogleDriveFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStorageStore.setState({ error: null, pickGoogle })
  })

  it("lets the person choose the files Cortex may read, and says how many", async () => {
    pickGoogle.mockResolvedValue([{ id: "a", name: "A", url: null, mimeType: null }, { id: "b", name: "B", url: null, mimeType: null }])
    render(<GoogleDriveFiles slug="acme" />)

    expect(screen.getByText(t.driveFiles.text)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: t.driveFiles.choose }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Cortex can now read these 2 files."))
    expect(pickGoogle).toHaveBeenCalledWith("acme", "files", t.driveFiles.title)
  })

  it("one file, a closed picker, and a picker that didn't open", async () => {
    pickGoogle.mockResolvedValueOnce([{ id: "a", name: "A", url: null, mimeType: null }])
    render(<GoogleDriveFiles slug="acme" />)
    fireEvent.click(screen.getByRole("button", { name: t.driveFiles.choose }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(t.driveFiles.chosenOne))

    pickGoogle.mockResolvedValueOnce(null)
    fireEvent.click(screen.getByRole("button", { name: t.driveFiles.choose }))
    await waitFor(() => expect(pickGoogle).toHaveBeenCalledTimes(2))
    expect(toast.error).not.toHaveBeenCalled()

    pickGoogle.mockImplementationOnce(async () => {
      useStorageStore.setState({ error: "picker" })
      return null
    })
    fireEvent.click(screen.getByRole("button", { name: t.driveFiles.choose }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(t.pickerFailed))
  })
})
