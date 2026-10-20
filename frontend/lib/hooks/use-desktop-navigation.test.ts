import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

/** `IS_DESKTOP` est figé au chargement (comme au build) : chaque cas recharge le hook avec son environnement. */
async function loadHook(flag = "true") {
  vi.stubEnv("NEXT_PUBLIC_DESKTOP", flag)
  vi.resetModules()
  return (await import("./use-desktop-navigation")).useDesktopNavigation
}

/** Pont de la coque : garde le rappel de navigation, comme `desktop/src/preload.ts`. */
function installBridge() {
  let callback: ((path: string) => void) | null = null
  const stop = vi.fn()
  const bridge = {
    onNavigate: vi.fn((cb: (path: string) => void) => {
      callback = cb
      return stop
    }),
  }
  ;(window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = bridge
  return { bridge, stop, navigate: (path: string) => callback?.(path) }
}

describe("useDesktopNavigation", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    push.mockClear()
    delete (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop
  })

  it("opens the page the shell asks for, and stops listening when unmounted", async () => {
    const { stop, navigate } = installBridge()
    const useDesktopNavigation = await loadHook()

    const { unmount } = renderHook(() => useDesktopNavigation())
    navigate("/acme/projects/5/issues/12")
    unmount()

    expect(push).toHaveBeenCalledWith("/acme/projects/5/issues/12")
    expect(stop).toHaveBeenCalled()
  })

  it("never leaves the app", async () => {
    const { navigate } = installBridge()
    const useDesktopNavigation = await loadHook()

    renderHook(() => useDesktopNavigation())
    navigate("//evil.example/acme")
    navigate("https://evil.example")

    expect(push).not.toHaveBeenCalled()
  })

  it("does nothing on the web app", async () => {
    const { bridge } = installBridge()
    const useDesktopNavigation = await loadHook("false")

    renderHook(() => useDesktopNavigation())

    expect(bridge.onNavigate).not.toHaveBeenCalled()
  })
})
