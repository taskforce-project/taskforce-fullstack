import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

import { useThreadEnd } from "./use-thread-end"

/** Quand la boîte grandit, la fin de la conversation reste en vue, si elle l'était (R134). */
describe("useThreadEnd", () => {
  let observed: (() => void) | null = null
  const disconnect = vi.fn()
  const original = globalThis.ResizeObserver

  /** Un fil dont on fixe les mesures : le navigateur de test n'en calcule pas. */
  function thread(sizes: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
    const element = document.createElement("div")
    element.className = "cortex-thread"
    Object.defineProperty(element, "scrollHeight", { configurable: true, value: sizes.scrollHeight })
    Object.defineProperty(element, "clientHeight", { configurable: true, value: sizes.clientHeight, writable: true })
    element.scrollTop = sizes.scrollTop
    document.body.append(element)
    return element
  }

  beforeEach(() => {
    disconnect.mockClear()
    observed = null
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { observed = () => callback([], this as unknown as ResizeObserver) }
      observe() {}
      unobserve() {}
      disconnect() { disconnect() }
    } as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    globalThis.ResizeObserver = original
    document.querySelectorAll(".cortex-thread").forEach((element) => element.remove())
  })

  it("does nothing without a conversation under the box", () => {
    const { unmount } = renderHook(() => useThreadEnd())
    expect(observed).toBeNull()
    unmount()
  })

  it("keeps the end in view when the box grows", () => {
    const element = thread({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })
    renderHook(() => useThreadEnd())

    Object.defineProperty(element, "clientHeight", { configurable: true, value: 340 })
    observed?.()

    expect(element.scrollTop).toBe(1000)
  })

  it("leaves a conversation the person has scrolled back in", () => {
    const element = thread({ scrollHeight: 1000, clientHeight: 400, scrollTop: 100 })
    renderHook(() => useThreadEnd())

    Object.defineProperty(element, "clientHeight", { configurable: true, value: 340 })
    observed?.()

    expect(element.scrollTop).toBe(100)
  })

  it("follows the person's scrolling, and ignores a conversation that gets more room", () => {
    const element = thread({ scrollHeight: 1000, clientHeight: 400, scrollTop: 100 })
    renderHook(() => useThreadEnd())
    element.scrollTop = 600
    element.dispatchEvent(new Event("scroll"))

    Object.defineProperty(element, "clientHeight", { configurable: true, value: 500 })
    observed?.()
    expect(element.scrollTop).toBe(600)

    Object.defineProperty(element, "clientHeight", { configurable: true, value: 340 })
    observed?.()
    expect(element.scrollTop).toBe(1000)
  })

  it("stops watching when the box goes", () => {
    thread({ scrollHeight: 100, clientHeight: 100, scrollTop: 0 })
    const { unmount } = renderHook(() => useThreadEnd())

    unmount()

    expect(disconnect).toHaveBeenCalled()
  })
})
