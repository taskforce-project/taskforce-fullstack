import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

const nav = vi.hoisted(() => ({ pathname: "/acme", search: "", replace: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
}))

import { useLastPlace } from "./use-last-place"
import { useUserStore } from "@/lib/store/user-store"
import { placeKey, useWindowStore } from "@/lib/store/window-store"
import type { AuthUser } from "@/lib/auth"

const me = { id: 7, email: "pierre@acme.dev" } as unknown as AuthUser

/** La fenêtre s'ouvre là où la personne l'a laissée (R123), par personne et par espace. */
describe("useLastPlace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    nav.pathname = "/acme"
    nav.search = ""
    useWindowStore.setState({ places: {}, lastSpaces: {} })
    useUserStore.setState({ user: me })
  })

  it("reopens the last conversation and its pane on the bare home of the space", () => {
    useWindowStore.setState({ places: { [placeKey("7", "acme")]: "/acme/projects/3?c=4" } })

    const { rerender } = renderHook(() => useLastPlace("acme"))

    expect(nav.replace).toHaveBeenCalledWith("/acme/projects/3?c=4", { scroll: false })
    // Le temps que l'endroit s'ouvre, l'accueil nu ne le remplace pas.
    expect(useWindowStore.getState().places[placeKey("7", "acme")]).toBe("/acme/projects/3?c=4")

    nav.pathname = "/acme/projects/3"
    nav.search = "c=4"
    rerender()
    expect(useWindowStore.getState().places[placeKey("7", "acme")]).toBe("/acme/projects/3?c=4")
    expect(nav.replace).toHaveBeenCalledTimes(1)
  })

  it("then remembers each address of the window, for this person and this space", () => {
    const { rerender } = renderHook(() => useLastPlace("acme"))
    expect(nav.replace).not.toHaveBeenCalled()
    expect(useWindowStore.getState().places[placeKey("7", "acme")]).toBe("/acme")

    nav.pathname = "/acme/roadmap"
    nav.search = "c=9"
    rerender()
    expect(useWindowStore.getState().places[placeKey("7", "acme")]).toBe("/acme/roadmap?c=9")
    expect(useWindowStore.getState().lastSpaces["7"]).toBe("acme")

    // Les réglages ne se retiennent pas : ils s'ouvrent à part.
    nav.pathname = "/acme/settings"
    nav.search = ""
    rerender()
    expect(useWindowStore.getState().places[placeKey("7", "acme")]).toBe("/acme/roadmap?c=9")
  })

  it("a link that opens the window elsewhere wins over the remembered place", () => {
    useWindowStore.setState({ places: { [placeKey("7", "acme")]: "/acme/projects/3?c=4" } })
    nav.pathname = "/acme/projects/5"
    nav.search = "issue=12"

    renderHook(() => useLastPlace("acme"))

    expect(nav.replace).not.toHaveBeenCalled()
    expect(useWindowStore.getState().places[placeKey("7", "acme")]).toBe("/acme/projects/5?issue=12")
  })

  it("waits for the person: without them, nothing opens nor is remembered", () => {
    useUserStore.setState({ user: null })
    useWindowStore.setState({ places: { [placeKey("7", "acme")]: "/acme/projects/3?c=4" } })

    renderHook(() => useLastPlace("acme"))

    expect(nav.replace).not.toHaveBeenCalled()
    expect(useWindowStore.getState().lastSpaces).toEqual({})
  })
})
