import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

// --- La connexion STOMP simulée : les topics demandés, leurs traitements, l'appel à chaque connexion, la fermeture ---
const stomp = vi.hoisted(() => ({
  handlers: null as Record<string, (body: string) => void> | null,
  onConnect: null as (() => void) | null,
  closed: 0,
}))

vi.mock("@/lib/hooks/use-stomp", () => ({
  subscribeTopics: (handlers: Record<string, (body: string) => void>, onConnect?: () => void) => {
    stomp.handlers = handlers
    stomp.onConnect = onConnect ?? null
    return () => { stomp.closed++ }
  },
}))

// --- Les stores : seules leurs actions comptent ici ---
const delivery = vi.hoisted(() => ({
  fetchProjectRuns: vi.fn(),
  fetchProjectRun: vi.fn(),
  applyProjectRunStep: vi.fn(),
}))
const issues = vi.hoisted(() => ({ fetchProjectRelations: vi.fn() }))
const workflow = vi.hoisted(() => ({ applyJobUpdate: vi.fn(), fetchJobs: vi.fn() }))

vi.mock("@/lib/store/delivery-store", () => ({
  useDeliveryStore: (selector: (s: typeof delivery) => unknown) => selector(delivery),
}))
vi.mock("@/lib/store/issue-store", () => ({
  useIssueStore: (selector: (s: typeof issues) => unknown) => selector(issues),
}))
vi.mock("@/lib/store/workflow-store", () => ({
  useWorkflowStore: (selector: (s: typeof workflow) => unknown) => selector(workflow),
}))

import { PROJECT_LIVE_DELAY_MS, analysisTopic, deliveryTopic, useProjectLive } from "./use-project-live"

const STARTED = { key: "understand", seq: null, kind: null, tool: null, at: null }
const row = (id: number, status: string) => ({ run: { id, status }, step: STARTED, links: {}, approvals: [] })
const deliveryEvent = (over: Record<string, unknown>) => JSON.stringify({
  type: "run", projectId: 30, runId: 9, issueId: 90, status: "RUNNING", outcome: null, approvalId: null, approvalStatus: null,
  step: null, ...over,
})
const send = (topic: string, body: string) => stomp.handlers?.[topic]?.(body)

describe("useProjectLive : le direct d'un projet ouvert (R166)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    stomp.handlers = null
    stomp.onConnect = null
    stomp.closed = 0
    delivery.fetchProjectRuns.mockResolvedValue([row(9, "RUNNING"), row(8, "DONE"), row(7, "RUNNING")])
    delivery.fetchProjectRun.mockResolvedValue(null)
    issues.fetchProjectRelations.mockResolvedValue(null)
    workflow.fetchJobs.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ["no workspace", null, 30],
    ["no project", "acme", null],
  ])("reads and listens to nothing with %s", (_label, slug, projectId) => {
    renderHook(() => useProjectLive(slug, projectId))

    expect(stomp.handlers).toBeNull()
    expect(delivery.fetchProjectRuns).not.toHaveBeenCalled()
    expect(issues.fetchProjectRelations).not.toHaveBeenCalled()
  })

  it("reads the project's links and first page of missions, each with its step: no timeline", async () => {
    renderHook(() => useProjectLive("acme", 30))
    await vi.advanceTimersByTimeAsync(0)

    expect(issues.fetchProjectRelations).toHaveBeenCalledWith("acme", 30)
    expect(delivery.fetchProjectRuns).toHaveBeenCalledWith("acme", 30)
    expect(delivery.fetchProjectRuns).toHaveBeenCalledTimes(1)
    expect(delivery.fetchProjectRun).not.toHaveBeenCalled()
  })

  it("listens to the project's missions and analyses on one connection", () => {
    renderHook(() => useProjectLive("acme", 30))

    expect(Object.keys(stomp.handlers ?? {})).toEqual(["/topic/projects.30.delivery", "/topic/projects.30.analysis"])
    expect(deliveryTopic(30)).toBe("/topic/projects.30.delivery")
    expect(analysisTopic(30)).toBe("/topic/projects.30.analysis")
  })

  it.each(["run", "approval"])("puts the step of a %s event in place at once, and reads the mission again once a burst is over", async (type) => {
    renderHook(() => useProjectLive("acme", 30))
    await vi.advanceTimersByTimeAsync(0)
    const asked = { key: "handover", seq: 12, kind: "tool", tool: "Edit", at: "2026-11-13T10:00:00" }
    const answered = { ...asked, key: "do" }

    send(deliveryTopic(30), deliveryEvent({ type, approvalId: 4, approvalStatus: "PENDING", step: asked }))
    send(deliveryTopic(30), deliveryEvent({ type, approvalId: 4, approvalStatus: "ALLOWED", step: answered }))
    expect(delivery.applyProjectRunStep.mock.calls).toEqual([[30, 9, asked], [30, 9, answered]])
    expect(delivery.fetchProjectRun).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(PROJECT_LIVE_DELAY_MS)

    expect(delivery.fetchProjectRun).toHaveBeenCalledTimes(1)
    expect(delivery.fetchProjectRun).toHaveBeenCalledWith("acme", 30, 9)
  })

  it("puts a new step in place at once, without reading the mission again", async () => {
    renderHook(() => useProjectLive("acme", 30))
    await vi.advanceTimersByTimeAsync(0)
    const step = { key: "check", seq: 12, kind: "test", tool: "npm test", at: "2026-11-13T10:00:00" }

    send(deliveryTopic(30), deliveryEvent({ type: "step", step }))

    expect(delivery.applyProjectRunStep).toHaveBeenCalledWith(30, 9, step)
    await vi.advanceTimersByTimeAsync(PROJECT_LIVE_DELAY_MS)
    expect(delivery.fetchProjectRun).not.toHaveBeenCalled()
  })

  it("a step event without its step reads the mission again", async () => {
    renderHook(() => useProjectLive("acme", 30))

    send(deliveryTopic(30), deliveryEvent({ type: "step", step: null }))
    await vi.advanceTimersByTimeAsync(PROJECT_LIVE_DELAY_MS)

    expect(delivery.applyProjectRunStep).not.toHaveBeenCalled()
    expect(delivery.fetchProjectRun).toHaveBeenCalledWith("acme", 30, 9)
  })

  it("ignores what is not this project's, or not a message at all", async () => {
    renderHook(() => useProjectLive("acme", 30))
    await vi.advanceTimersByTimeAsync(0)

    send(deliveryTopic(30), deliveryEvent({ projectId: 31 }))
    send(deliveryTopic(30), deliveryEvent({ runId: "9" }))
    send(deliveryTopic(30), "not json {")
    send(analysisTopic(30), JSON.stringify({ id: 4, projectId: 31, status: "DONE" }))
    send(analysisTopic(30), JSON.stringify({ projectId: 30 }))
    send(analysisTopic(30), "not json {")
    await vi.advanceTimersByTimeAsync(PROJECT_LIVE_DELAY_MS)

    expect(delivery.fetchProjectRun).not.toHaveBeenCalled()
    expect(delivery.applyProjectRunStep).not.toHaveBeenCalled()
    expect(workflow.applyJobUpdate).not.toHaveBeenCalled()
  })

  it("puts an analysis that changed in place of its own", () => {
    renderHook(() => useProjectLive("acme", 30))
    const job = { id: 4, projectId: 30, projectName: "Website", depth: "QUICK", status: "DONE", question: null, error: null, briefId: 2 }

    send(analysisTopic(30), JSON.stringify(job))

    expect(workflow.applyJobUpdate).toHaveBeenCalledWith(job)
  })

  it("reads everything again at each connection, the first included", async () => {
    renderHook(() => useProjectLive("acme", 30))
    await vi.advanceTimersByTimeAsync(0)
    vi.clearAllMocks()
    delivery.fetchProjectRuns.mockResolvedValue([])

    // Ce qui est publié entre la lecture du montage et l'abonnement n'arrive pas par le topic : la première connexion relit.
    stomp.onConnect?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(delivery.fetchProjectRuns).toHaveBeenCalledWith("acme", 30)
    expect(issues.fetchProjectRelations).toHaveBeenCalledWith("acme", 30)
    expect(workflow.fetchJobs).toHaveBeenCalledWith("acme")

    // Après une coupure, de même.
    stomp.onConnect?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(delivery.fetchProjectRuns).toHaveBeenCalledTimes(2)
    expect(issues.fetchProjectRelations).toHaveBeenCalledTimes(2)
    expect(workflow.fetchJobs).toHaveBeenCalledTimes(2)
  })

  it("closes the connection when the project is left, and reads nothing after", async () => {
    const { unmount } = renderHook(() => useProjectLive("acme", 30))
    send(deliveryTopic(30), deliveryEvent({}))

    unmount()
    await vi.advanceTimersByTimeAsync(PROJECT_LIVE_DELAY_MS)

    expect(stomp.closed).toBe(1)
    expect(delivery.fetchProjectRun).not.toHaveBeenCalled()
  })
})
