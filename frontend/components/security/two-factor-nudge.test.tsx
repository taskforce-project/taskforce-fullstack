import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"

import type { RichToastOptions } from "@/lib/notify"

const { notifyRich } = vi.hoisted(() => ({ notifyRich: vi.fn() }))

vi.mock("@/lib/contexts/auth-context", () => ({ useAuth: () => ({ isAuthenticated: true }) }))
vi.mock("@/lib/api/user-service", () => ({ getTwoFactorStatus: vi.fn(() => Promise.resolve(false)) }))
vi.mock("@/lib/notify", () => ({ notifyRich }))

import { TwoFactorNudge } from "./two-factor-nudge"
import { useSettingsStore } from "@/lib/store/settings-store"

describe("TwoFactorNudge", () => {
  it("« Enable 2FA » ouvre les réglages de sécurité en place, sans quitter la page", async () => {
    vi.useFakeTimers()
    render(<TwoFactorNudge />)
    await vi.advanceTimersByTimeAsync(3000)
    vi.useRealTimers()
    await vi.waitFor(() => expect(notifyRich).toHaveBeenCalled())

    const options = notifyRich.mock.calls[0][0] as RichToastOptions
    const enable = options.actions?.find((a) => a.label === "Enable 2FA")
    const dismiss = vi.fn()
    enable?.onClick(dismiss)

    expect(dismiss).toHaveBeenCalled()
    expect(useSettingsStore.getState()).toMatchObject({ open: true, section: "security" })
  })
})
