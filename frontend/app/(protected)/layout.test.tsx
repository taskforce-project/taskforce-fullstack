import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

const auth = vi.hoisted(() => ({ isAuthenticated: false, isLoading: false }))
const route = vi.hoisted(() => ({ pathname: "/verify/0123456789abcdef0123456789abcdef" }))
// Le routeur de Next.js est le même d'un rendu à l'autre : le double aussi.
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => nav }))
vi.mock("@/lib/contexts/auth-context", () => ({ useAuth: () => auth }))
vi.mock("@/lib/api/session-token", () => ({ getSessionToken: () => null }))
vi.mock("@/components/layout/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/components/layout/login-intro", () => ({ LoginIntro: () => null }))
vi.mock("@/components/security/two-factor-nudge", () => ({ TwoFactorNudge: () => null }))

import ProtectedLayout from "./layout"
import { afterSignInPath } from "@/lib/auth/desktop-handoff"
import { returnPath } from "@/lib/auth/return-path"

/**
 * La connexion garde la page demandée (R161 M4 de #552) : sans session, la page de vérification d'un dossier, ou le lien
 * du témoin qui l'ouvre, mène à la connexion, qui y ramène ; l'arrivée l'efface. Une autre page mène à la connexion seule.
 */
const LINK = "/verify/0123456789abcdef0123456789abcdef"

describe("ProtectedLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    auth.isAuthenticated = false
  })
  afterEach(() => window.history.replaceState({}, "", "/"))

  it("sans session, le lien d'un témoin mène à la connexion, qui y ramènera", async () => {
    window.history.replaceState({}, "", LINK)
    route.pathname = LINK
    render(<ProtectedLayout><p>page</p></ProtectedLayout>)

    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/auth/login"))
    expect(returnPath()).toBe(LINK)
    expect(afterSignInPath("/")).toBe(LINK)
  })

  it("une fois connectée, la personne arrive sur la page, qui ne détourne plus les connexions suivantes", async () => {
    window.history.replaceState({}, "", LINK)
    route.pathname = LINK
    render(<ProtectedLayout><p>page</p></ProtectedLayout>)
    await vi.waitFor(() => expect(returnPath()).toBe(LINK))

    auth.isAuthenticated = true
    render(<ProtectedLayout><p>page</p></ProtectedLayout>)
    await vi.waitFor(() => expect(returnPath()).toBeNull())
    expect(afterSignInPath("/")).toBe("/")
  })

  it("une autre page mène à la connexion sans rien retenir", async () => {
    window.history.replaceState({}, "", "/acme/settings")
    route.pathname = "/acme/settings"
    render(<ProtectedLayout><p>page</p></ProtectedLayout>)

    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/auth/login"))
    expect(returnPath()).toBeNull()
  })
})
