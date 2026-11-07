import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

import { useElementWidth } from "./use-element-width"

/** La largeur d'un élément, suivie par un `ResizeObserver` : la place du volet à côté de la conversation (R120). */
describe("useElementWidth", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("is 0 until measured, then follows each measure, rounded", () => {
    let report: ResizeObserverCallback = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { report = callback }
      observe() {}
      disconnect() { disconnect() }
      unobserve() {}
    })
    const ref = { current: document.createElement("div") }
    const { result, unmount } = renderHook(() => useElementWidth(ref))
    expect(result.current).toBe(0)

    const measure = (width: number) => act(() => {
      report([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver)
    })
    measure(1343.6)
    expect(result.current).toBe(1344)
    measure(900)
    expect(result.current).toBe(900)
    act(() => { report([], {} as ResizeObserver) })
    expect(result.current).toBe(900)

    unmount()
    expect(disconnect).toHaveBeenCalled()
  })

  it("stays at 0 without an element, or without ResizeObserver", () => {
    expect(renderHook(() => useElementWidth({ current: null })).result.current).toBe(0)
    vi.stubGlobal("ResizeObserver", undefined)
    expect(renderHook(() => useElementWidth({ current: document.createElement("div") })).result.current).toBe(0)
  })
})
