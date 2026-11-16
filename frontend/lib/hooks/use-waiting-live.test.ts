import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

// --- La connexion STOMP simulée : les topics écoutés, la fermeture ---
const stomp = vi.hoisted(() => ({
  handlers: null as Record<string, (body: string) => void> | null,
  opened: 0,
  closed: 0,
}))
vi.mock("@/lib/hooks/use-stomp", () => ({
  subscribeTopics: (handlers: Record<string, (body: string) => void>) => {
    stomp.handlers = handlers
    stomp.opened++
    return () => { stomp.closed++ }
  },
}))

import { useDeliveryStore } from "@/lib/store/delivery-store"
import type { OpenApproval } from "@/lib/api/delivery-service"
import { WAITING_LIVE_DELAY_MS, useWaitingLive } from "./use-waiting-live"

const waiting = (runId: number, projectId: number | null): OpenApproval =>
  ({ runId, issueId: runId * 10, issueKey: `WEB-${runId}`, issueTitle: "Release", projectId, requests: 1 })
const event = (type: string) => JSON.stringify({ type, projectId: 3, runId: 9, issueId: 90, status: "RUNNING", outcome: null, approvalId: 4, approvalStatus: "ALLOWED", step: null })

describe("useWaitingLive : « Waiting for you » en direct (séance n°25, critère 3)", () => {
  const fetchOpenApprovals = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    stomp.handlers = null
    stomp.opened = 0
    stomp.closed = 0
    fetchOpenApprovals.mockReset().mockResolvedValue([])
    useDeliveryStore.setState({ openApprovals: [], fetchOpenApprovals })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("listens to nothing while nothing waits for the person", () => {
    renderHook(() => useWaitingLive("acme"))
    expect(stomp.opened).toBe(0)
  })

  it("listens to the delivery topic of each project where a request waits, once each", () => {
    useDeliveryStore.setState({ openApprovals: [waiting(9, 3), waiting(8, 5), waiting(7, 3), waiting(6, null)] })
    renderHook(() => useWaitingLive("acme"))
    expect(Object.keys(stomp.handlers ?? {})).toEqual(["/topic/projects.3.delivery", "/topic/projects.5.delivery"])
  })

  it("reads what waits again once a decision lands elsewhere, a burst once", async () => {
    useDeliveryStore.setState({ openApprovals: [waiting(9, 3)] })
    renderHook(() => useWaitingLive("acme"))
    const send = stomp.handlers?.["/topic/projects.3.delivery"]

    act(() => { send?.(event("approval")); send?.(event("approval")); send?.(event("run")) })
    expect(fetchOpenApprovals).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(WAITING_LIVE_DELAY_MS) })
    expect(fetchOpenApprovals).toHaveBeenCalledTimes(1)
    expect(fetchOpenApprovals).toHaveBeenCalledWith("acme")
  })

  it("ignores a step, or what is not a message", async () => {
    useDeliveryStore.setState({ openApprovals: [waiting(9, 3)] })
    renderHook(() => useWaitingLive("acme"))
    const send = stomp.handlers?.["/topic/projects.3.delivery"]
    act(() => { send?.(event("step")); send?.("not json {") })
    await act(async () => { await vi.advanceTimersByTimeAsync(WAITING_LIVE_DELAY_MS) })
    expect(fetchOpenApprovals).not.toHaveBeenCalled()
  })

  it("closes its connection when the projects change or the window leaves", () => {
    useDeliveryStore.setState({ openApprovals: [waiting(9, 3)] })
    const { unmount } = renderHook(() => useWaitingLive("acme"))
    act(() => useDeliveryStore.setState({ openApprovals: [waiting(9, 3), waiting(8, 5)] }))
    expect(stomp.opened).toBe(2)
    expect(stomp.closed).toBe(1)
    unmount()
    expect(stomp.closed).toBe(2)
  })
})
