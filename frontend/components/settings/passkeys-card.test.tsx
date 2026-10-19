import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { PasskeysCard } from "./passkeys-card"
import { usePasskeyStore } from "@/lib/store/passkey-store"

const { toast, mockSupported } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  mockSupported: vi.fn(() => true),
}))
vi.mock("sonner", () => ({ toast }))
vi.mock("@/lib/auth/passkeys", () => ({ passkeysSupported: mockSupported }))

const PASSKEY = { id: "pk-1", label: "Passkey on Windows", createdAt: "2026-10-19T20:00:00", lastUsedAt: "2026-10-20T08:00:00" }

const fetchPasskeys = vi.fn()
const addPasskey = vi.fn()
const removePasskey = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockSupported.mockReturnValue(true)
  fetchPasskeys.mockResolvedValue([PASSKEY])
  usePasskeyStore.setState({ passkeys: [PASSKEY], error: null, fetchPasskeys, addPasskey, removePasskey })
})

describe("PasskeysCard", () => {
  it("lists the passkeys with when they were added and last used", async () => {
    render(<PasskeysCard />)

    expect(screen.getByText("Passkey on Windows")).toBeInTheDocument()
    expect(screen.getByText(/Added Oct 19, 2026 · last used Oct 20, 2026/)).toBeInTheDocument()
    await waitFor(() => expect(fetchPasskeys).toHaveBeenCalled())
  })

  it("adds a passkey and says how to use it", async () => {
    addPasskey.mockResolvedValue(PASSKEY)
    render(<PasskeysCard />)

    await userEvent.click(screen.getByRole("button", { name: /add a passkey/i }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Passkey added. Use it the next time you sign in."))
  })

  it("says nothing when the person closes the browser window", async () => {
    addPasskey.mockResolvedValue(null)
    render(<PasskeysCard />)

    await userEvent.click(screen.getByRole("button", { name: /add a passkey/i }))

    await waitFor(() => expect(addPasskey).toHaveBeenCalled())
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("shows why a passkey couldn't be added", async () => {
    addPasskey.mockImplementation(async () => {
      usePasskeyStore.setState({ error: "This device already has a passkey for this account." })
      return null
    })
    render(<PasskeysCard />)

    await userEvent.click(screen.getByRole("button", { name: /add a passkey/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This device already has a passkey for this account."))
  })

  it("removes a passkey", async () => {
    removePasskey.mockResolvedValue(true)
    render(<PasskeysCard />)

    await userEvent.click(screen.getByRole("button", { name: /remove/i }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Passkey on Windows removed"))
    expect(removePasskey).toHaveBeenCalledWith("pk-1")
  })

  it("shows why a passkey couldn't be removed", async () => {
    removePasskey.mockResolvedValue(false)
    render(<PasskeysCard />)

    await userEvent.click(screen.getByRole("button", { name: /remove/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't remove this passkey. Please try again."))
  })

  it("explains why this browser can't add one", () => {
    mockSupported.mockReturnValue(false)
    usePasskeyStore.setState({ passkeys: [] })
    render(<PasskeysCard />)

    expect(screen.getByRole("button", { name: /add a passkey/i })).toBeDisabled()
    expect(screen.getByText(/can't create a passkey here/)).toBeInTheDocument()
  })
})
