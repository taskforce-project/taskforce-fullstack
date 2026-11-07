import { afterEach, describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { act, renderHook } from "@testing-library/react"

import { useMinWidth } from "./use-min-width"

type Listener = () => void

/** Une fenêtre simulée : sa largeur, et les requêtes `min-width` qui l'écoutent. */
function windowOf(width: number) {
  const listeners = new Set<Listener>()
  let current = width
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const min = Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0)
    return {
      matches: current >= min,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList
  })
  return {
    listeners,
    resize(next: number) {
      current = next
      listeners.forEach((listener) => listener())
    },
  }
}

describe("useMinWidth", () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    [1440, 1024, true],
    [1024, 1024, true],
    [1023, 1024, false],
    [390, 1024, false],
    [1920, 1600, true],
    [1440, 1600, false],
  ])("une fenêtre de %s px a au moins %s px : %s", (width, min, wide) => {
    windowOf(width)
    expect(renderHook(() => useMinWidth(min)).result.current).toBe(wide)
  })

  it("assumes a computer's width when rendered on the server", () => {
    function Probe() {
      return createElement("span", null, String(useMinWidth(1024)))
    }
    expect(renderToString(createElement(Probe))).toContain("true")
  })

  it("follows the window when it is resized, and stops listening when it goes", () => {
    const screen = windowOf(1440)
    const { result, unmount } = renderHook(() => useMinWidth(1600))
    expect(result.current).toBe(false)

    act(() => screen.resize(1920))
    expect(result.current).toBe(true)

    unmount()
    expect(screen.listeners.size).toBe(0)
  })
})
