import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { DesktopSignIn } from "./desktop-sign-in"
import * as service from "@/lib/api/desktop-session-service"
import { useDesktopSessionStore } from "@/lib/store/desktop-session-store"

const replace = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }))

const auth = vi.hoisted(() => ({
  value: { user: null as { email: string } | null, isAuthenticated: false, isLoading: false, logout: vi.fn() },
}))
vi.mock("@/lib/contexts/auth-context", () => ({ useAuth: () => auth.value }))

vi.mock("@/lib/store/preferences-store", async () => {
  const { CONSTANTS_EN } = await vi.importActual<typeof import("@/lib/constants_en")>("@/lib/constants_en")
  return { usePreferencesStore: () => ({ t: CONSTANTS_EN }) }
})

const toastError = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({ toast: { error: toastError } }))

vi.mock("@/lib/api/desktop-session-service", () => ({
  authorizeDesktopApp: vi.fn(),
  listDesktopSessions: vi.fn(),
  revokeDesktopSession: vi.fn(),
}))

const CHALLENGE = "c".repeat(43)
const FROM_APP = `?code_challenge=${CHALLENGE}&redirect_uri=${encodeURIComponent("http://127.0.0.1:47812/callback")}&state=state-1234`

function openedAt(search: string) {
  const assign = vi.fn()
  vi.stubGlobal("location", { search, pathname: "/auth/desktop", assign })
  return assign
}

describe("DesktopSignIn : the desktop app signs in through the web app", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    useDesktopSessionStore.setState({ sessions: null, error: null })
    auth.value = { user: null, isAuthenticated: false, isLoading: false, logout: vi.fn() }
  })

  afterEach(() => vi.unstubAllGlobals())

  it("sends a signed-out person to the usual sign-in page, keeping the app's request", () => {
    openedAt(FROM_APP)

    render(<DesktopSignIn />)

    expect(replace).toHaveBeenCalledWith("/auth/desktop")
    expect(replace).toHaveBeenCalledWith("/auth/login")
    expect(JSON.parse(sessionStorage.getItem("tf.desktopSignIn") ?? "{}").codeChallenge).toBe(CHALLENGE)
  })

  it("sends to the sign-up page when the app asked to create an account", () => {
    openedAt(`${FROM_APP}&signup=1`)

    render(<DesktopSignIn />)

    expect(replace).toHaveBeenCalledWith("/auth/register")
  })

  it("waits while the session is being read", () => {
    openedAt(FROM_APP)
    auth.value = { ...auth.value, isLoading: true }

    render(<DesktopSignIn />)

    expect(screen.getByRole("status")).toBeTruthy()
    expect(replace).not.toHaveBeenCalledWith("/auth/login")
  })

  it("asks a signed-in person to continue, then hands the browser back to the app", async () => {
    const assign = openedAt(FROM_APP)
    auth.value = { ...auth.value, user: { email: "ada@example.com" }, isAuthenticated: true }
    vi.mocked(service.authorizeDesktopApp).mockResolvedValue("http://127.0.0.1:47812/callback?code=x&state=state-1234")

    render(<DesktopSignIn />)
    expect(screen.getByText("Continue as ada@example.com in the TaskForce app on this computer.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Continue to the app" }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith("http://127.0.0.1:47812/callback?code=x&state=state-1234"))
    expect(screen.getByText("You're signed in")).toBeTruthy()
    expect(sessionStorage.getItem("tf.desktopSignIn")).toBeNull()
  })

  it("says why the app couldn't be signed in", async () => {
    const assign = openedAt(FROM_APP)
    auth.value = { ...auth.value, user: { email: "ada@example.com" }, isAuthenticated: true }
    vi.mocked(service.authorizeDesktopApp).mockRejectedValue(new Error("Invalid sign-in request: start again from the app"))

    render(<DesktopSignIn />)
    fireEvent.click(screen.getByRole("button", { name: "Continue to the app" }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Invalid sign-in request: start again from the app"))
    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Continue to the app" })).toBeTruthy()
  })

  it("lets the person switch accounts, the app's request waiting in the tab", () => {
    openedAt(FROM_APP)
    auth.value = { ...auth.value, user: { email: "ada@example.com" }, isAuthenticated: true }

    render(<DesktopSignIn />)
    fireEvent.click(screen.getByRole("button", { name: "Use another account" }))

    expect(auth.value.logout).toHaveBeenCalled()
    expect(sessionStorage.getItem("tf.desktopSignIn")).not.toBeNull()
  })

  it("resumes the request kept in the tab after signing in", () => {
    sessionStorage.setItem("tf.desktopSignIn", JSON.stringify({
      codeChallenge: CHALLENGE, redirectUri: "http://127.0.0.1:47812/callback", state: "state-1234", signUp: false, savedAt: Date.now(),
    }))
    openedAt("")
    auth.value = { ...auth.value, user: { email: "ada@example.com" }, isAuthenticated: true }

    render(<DesktopSignIn />)

    expect(screen.getByRole("button", { name: "Continue to the app" })).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it("explains the page when no app asked for it", () => {
    openedAt("")

    render(<DesktopSignIn />)

    expect(screen.getByText("Start from the app")).toBeTruthy()
  })
})
