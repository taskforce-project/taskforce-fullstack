import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, back: nav.back }),
  useParams: () => ({ workspace: "acme" }),
}))

import { usePaneNavigation } from "./use-pane-navigation"

const scope = globalThis as { navigation?: unknown }

/** Les gestes qui changent le volet (R120) : chacun pousse une adresse, la conversation suit, rien ne remonte en haut. */
describe("usePaneNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.history.replaceState(null, "", "/acme/projects/3?c=9")
  })
  afterEach(() => { delete scope.navigation })

  it("opens an issue over the board that lists it, the conversation kept", () => {
    const { result } = renderHook(() => usePaneNavigation())

    result.current.openIssue({ projectId: 3, issueId: 34 })
    expect(nav.push).toHaveBeenCalledWith("/acme/projects/3?c=9&issue=34", { scroll: false })
  })

  it("opens a mission's work view, a board and the home, with the conversation only", () => {
    globalThis.history.replaceState(null, "", "/acme/projects/3?c=9&issue=34")
    const { result } = renderHook(() => usePaneNavigation())

    result.current.openMission(100)
    result.current.openBoard(5)
    result.current.closePane()
    expect(nav.push.mock.calls).toEqual([
      ["/acme/missions/100?c=9", { scroll: false }],
      ["/acme/projects/5?c=9", { scroll: false }],
      ["/acme?c=9", { scroll: false }],
    ])
  })

  it("closes the issue back through the history when the entry before is the screen under it", () => {
    globalThis.history.replaceState(null, "", "/acme/projects/3?c=9&issue=34")
    const origin = globalThis.location.origin
    scope.navigation = {
      currentEntry: { index: 1 },
      entries: () => [{ url: `${origin}/acme/projects/3?c=9` }, { url: `${origin}/acme/projects/3?c=9&issue=34` }],
    }
    const { result } = renderHook(() => usePaneNavigation())

    result.current.closeIssue()
    expect(nav.back).toHaveBeenCalled()
    expect(nav.push).not.toHaveBeenCalled()
  })

  it("closes the issue to its board when it came from elsewhere, or when the browser doesn't say", () => {
    globalThis.history.replaceState(null, "", "/acme/projects/3?c=9&issue=34")
    const origin = globalThis.location.origin
    scope.navigation = {
      currentEntry: { index: 1 },
      entries: () => [{ url: `${origin}/acme/dashboard?c=9` }, { url: `${origin}/acme/projects/3?c=9&issue=34` }],
    }
    const { result } = renderHook(() => usePaneNavigation())

    result.current.closeIssue()
    delete scope.navigation
    result.current.closeIssue()
    expect(nav.back).not.toHaveBeenCalled()
    expect(nav.push.mock.calls).toEqual([
      ["/acme/projects/3?c=9", { scroll: false }],
      ["/acme/projects/3?c=9", { scroll: false }],
    ])
  })
})
