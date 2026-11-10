import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

// --- L'abonnement STOMP simulé : le topic demandé, ce qui reçoit les messages, la fermeture ---
const stomp = vi.hoisted(() => ({
  topic: null as string | null,
  onMessage: null as ((body: string) => void) | null,
  closed: 0,
}))

vi.mock("@/lib/hooks/use-stomp", () => ({
  subscribeTopic: (topic: string, onMessage: (body: string) => void) => {
    stomp.topic = topic
    stomp.onMessage = onMessage
    return () => { stomp.closed++ }
  },
}))

import { ISSUE_REFRESH_DELAY_MS, useIssueRealtime } from "./use-issue-realtime"

const event = (action: string, issueId: number) => JSON.stringify({ action, projectId: 30, issueId, issue: null })

describe("useIssueRealtime : la fiche ouverte d'une issue se relit (rejeu de la 1.8.0)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stomp.topic = null
    stomp.onMessage = null
    stomp.closed = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ["no project", null, 7],
    ["no issue (the sheet is closed)", 30, null],
  ])("subscribes to nothing with %s", (_label, projectId, issueId) => {
    renderHook(() => useIssueRealtime(projectId, issueId, vi.fn()))

    expect(stomp.topic).toBeNull()
  })

  it("listens to the project's topic", () => {
    renderHook(() => useIssueRealtime(30, 7, vi.fn()))

    expect(stomp.topic).toBe("/topic/projects.30")
  })

  it.each(["activity", "updated"])("reads the issue again when its %s event arrives (an agent's comment)", (action) => {
    const onChange = vi.fn()
    renderHook(() => useIssueRealtime(30, 7, onChange))

    stomp.onMessage?.(event(action, 7))
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(ISSUE_REFRESH_DELAY_MS)

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("reads once for a burst of events", () => {
    const onChange = vi.fn()
    renderHook(() => useIssueRealtime(30, 7, onChange))

    stomp.onMessage?.(event("activity", 7))
    stomp.onMessage?.(event("updated", 7))
    stomp.onMessage?.(event("activity", 7))
    vi.advanceTimersByTime(ISSUE_REFRESH_DELAY_MS)

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["another issue of the project", event("activity", 8)],
    ["the issue's deletion", event("deleted", 7)],
    ["a message that isn't JSON", "not json {"],
  ])("ignores %s", (_label, body) => {
    const onChange = vi.fn()
    renderHook(() => useIssueRealtime(30, 7, onChange))

    stomp.onMessage?.(body)
    vi.advanceTimersByTime(ISSUE_REFRESH_DELAY_MS)

    expect(onChange).not.toHaveBeenCalled()
  })

  it("calls the latest callback, without subscribing again", () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useIssueRealtime(30, 7, cb), { initialProps: { cb: first } })

    rerender({ cb: second })
    stomp.onMessage?.(event("activity", 7))
    vi.advanceTimersByTime(ISSUE_REFRESH_DELAY_MS)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(stomp.closed).toBe(0)
  })

  it("closes the subscription and drops a pending read when the sheet closes", () => {
    const onChange = vi.fn()
    const { unmount } = renderHook(() => useIssueRealtime(30, 7, onChange))

    stomp.onMessage?.(event("activity", 7))
    unmount()
    vi.advanceTimersByTime(ISSUE_REFRESH_DELAY_MS)

    expect(stomp.closed).toBe(1)
    expect(onChange).not.toHaveBeenCalled()
  })
})
