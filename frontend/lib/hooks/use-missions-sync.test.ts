import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

import type { AnalysisJob } from "@/lib/api/analysis-service"
import type { DeliveryRun } from "@/lib/api/delivery-service"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useNotificationStore, type Signal } from "@/lib/store/notification-store"
import { useWorkflowStore } from "@/lib/store/workflow-store"
import { useMissionsSync } from "./use-missions-sync"

const run = (id: number, status: DeliveryRun["status"]): DeliveryRun => ({
  id, issueId: id * 10, issueKey: null, issueTitle: null, projectId: 3, projectName: null, providerKey: "claude-code",
  model: null, status, summary: null, resultUrl: null, error: null, startedById: 7, createdAt: null, updatedAt: null,
})

const job = (id: number, status: AnalysisJob["status"]): AnalysisJob => ({
  id, projectId: 3, projectName: "Website", depth: "QUICK", status, question: null, error: null, briefId: null,
  createdAt: "2026-11-05T10:00:00", updatedAt: "2026-11-05T10:00:00",
})

const deliveryInitial = useDeliveryStore.getState()
const workflowInitial = useWorkflowStore.getState()

const signal = (id: string, type: Signal["type"]) => ({ id, type, read: false }) as Signal

/** Le travail des agents que la fenêtre montre, relu depuis le shell tant qu'il tourne (l'ancien bouton d'AI Workflows). */
describe("useMissionsSync", () => {
  const fetchJobs = vi.fn().mockResolvedValue(undefined)
  const fetchWorkspaceRuns = vi.fn().mockResolvedValue([])
  const fetchRun = vi.fn().mockResolvedValue(null)
  const fetchOpenApprovals = vi.fn().mockResolvedValue([])

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useDeliveryStore.setState({ ...deliveryInitial, workspaceRuns: [], fetchWorkspaceRuns, fetchRun, fetchOpenApprovals })
    useNotificationStore.setState({ signals: [] })
    useWorkflowStore.setState({ ...workflowInitial, jobs: [], fetchJobs })
  })
  afterEach(() => vi.useRealTimers())

  it("loads the analyses and the missions, and reads nothing more while nothing runs", () => {
    renderHook(() => useMissionsSync("acme"))

    expect(fetchJobs).toHaveBeenCalledWith("acme")
    expect(fetchWorkspaceRuns).toHaveBeenCalledWith("acme")
    expect(fetchOpenApprovals).toHaveBeenCalledWith("acme")
    vi.advanceTimersByTime(20_000)
    expect(fetchJobs).toHaveBeenCalledTimes(1)
    expect(fetchRun).not.toHaveBeenCalled()
  })

  it("reads a running analysis every 5 s", () => {
    useWorkflowStore.setState({ jobs: [job(1, "RUNNING"), job(2, "DONE")] })
    renderHook(() => useMissionsSync("acme"))

    vi.advanceTimersByTime(5_000)
    expect(fetchJobs).toHaveBeenCalledTimes(2)
  })

  it("moves the running missions forward, five at most, then reads the list", async () => {
    useDeliveryStore.setState({
      workspaceRuns: [1, 2, 3, 4, 5, 6].map((id) => run(id, "RUNNING")).concat(run(7, "DONE")),
    })
    renderHook(() => useMissionsSync("acme"))

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })

    expect(fetchRun.mock.calls.map((call) => call[1])).toEqual([10, 20, 30, 40, 50])
    expect(fetchWorkspaceRuns).toHaveBeenCalledTimes(2)
    // Les demandes ouvertes se relisent au même rythme, après que les missions ont avancé (R128).
    expect(fetchOpenApprovals).toHaveBeenCalledTimes(2)
  })

  it("reads what waits again as soon as an agent signals something, even with no mission known to run", () => {
    useNotificationStore.setState({ signals: [signal("5", "agentApproval"), signal("9", "mention")] })
    renderHook(() => useMissionsSync("acme"))
    expect(fetchOpenApprovals).toHaveBeenCalledTimes(1)

    act(() => useNotificationStore.setState({ signals: [signal("6", "agentDone"), signal("5", "agentApproval")] }))
    expect(fetchOpenApprovals).toHaveBeenCalledTimes(2)
    expect(fetchWorkspaceRuns).toHaveBeenCalledTimes(2)

    // Une mention n'y change rien.
    act(() => useNotificationStore.setState({ signals: [signal("7", "mention"), signal("6", "agentDone"), signal("5", "agentApproval")] }))
    expect(fetchOpenApprovals).toHaveBeenCalledTimes(2)
  })

  it("does nothing without a workspace", () => {
    renderHook(() => useMissionsSync(""))
    expect(fetchJobs).not.toHaveBeenCalled()
    expect(fetchWorkspaceRuns).not.toHaveBeenCalled()
    expect(fetchOpenApprovals).not.toHaveBeenCalled()
  })
})
