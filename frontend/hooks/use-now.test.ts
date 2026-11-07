import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

import { useNow } from "./use-now"

describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("reads the time again at each interval, and stops when it goes", () => {
    const { result, unmount } = renderHook(() => useNow(30_000))
    expect(result.current).toBe(Date.parse("2026-11-05T12:00:00Z"))

    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current).toBe(Date.parse("2026-11-05T12:00:30Z"))

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
