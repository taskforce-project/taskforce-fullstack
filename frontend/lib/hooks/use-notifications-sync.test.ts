import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

vi.mock("@/lib/hooks/use-notifications-realtime", () => ({ useNotificationsRealtime: vi.fn() }))

import { useNotificationsRealtime } from "@/lib/hooks/use-notifications-realtime"
import { useNotificationStore } from "@/lib/store/notification-store"
import { useNotificationsSync } from "./use-notifications-sync"

const initial = useNotificationStore.getState()

/** Ce que la cloche tenait, pour « Waiting for you » (R121) : la liste, le temps réel, et un filet toutes les 60 s. */
describe("useNotificationsSync", () => {
  const ensureNotifications = vi.fn().mockResolvedValue(undefined)
  const fetchNotifications = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useNotificationStore.setState({ ...initial, ensureNotifications, fetchNotifications })
  })
  afterEach(() => vi.useRealTimers())

  it("loads the list once, listens in real time, and reads it again every minute", () => {
    const { unmount } = renderHook(() => useNotificationsSync("acme"))

    expect(ensureNotifications).toHaveBeenCalledWith("acme")
    expect(useNotificationsRealtime).toHaveBeenCalledWith("acme")
    vi.advanceTimersByTime(60_000)
    expect(fetchNotifications).toHaveBeenCalledWith("acme")

    unmount()
    vi.advanceTimersByTime(120_000)
    expect(fetchNotifications).toHaveBeenCalledTimes(1)
  })

  it.each([[""], [null], [undefined]])("does nothing without a workspace (%s)", (slug) => {
    renderHook(() => useNotificationsSync(slug))
    vi.advanceTimersByTime(60_000)

    expect(ensureNotifications).not.toHaveBeenCalled()
    expect(fetchNotifications).not.toHaveBeenCalled()
    expect(useNotificationsRealtime).toHaveBeenCalledWith(slug ?? undefined)
  })
})
