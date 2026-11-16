import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

// --- Le direct simulé : l'état qu'il rend, et le temps réel des issues ---
const live = vi.hoisted(() => ({ value: { state: "connecting", readAt: null, failed: false } as { state: string; readAt: number | null; failed: boolean } }))
vi.mock("@/lib/hooks/use-project-live", () => ({ useProjectLive: () => live.value }))
vi.mock("@/lib/hooks/use-project-realtime", () => ({ useProjectRealtime: vi.fn() }))

// --- Les stores : leurs lectures ---
const issues = vi.hoisted(() => ({
  fetchStatuses: vi.fn(),
  fetchWorkflowIssues: vi.fn(),
  fetchDocumentCounts: vi.fn(),
  error: null as string | null,
}))
const projects = vi.hoisted(() => ({ fetchObjective: vi.fn() }))
const delivery = vi.hoisted(() => ({ fetchProjectProviders: vi.fn(), projectRuns: {} as Record<number, unknown> }))
vi.mock("@/lib/store/issue-store", () => {
  const useIssueStore = (selector: (s: typeof issues) => unknown) => selector(issues)
  useIssueStore.getState = () => issues
  return { useIssueStore }
})
vi.mock("@/lib/store/project-store", () => ({ useProjectStore: (selector: (s: typeof projects) => unknown) => selector(projects) }))
vi.mock("@/lib/store/delivery-store", () => ({ useDeliveryStore: (selector: (s: typeof delivery) => unknown) => selector(delivery) }))

import { DOCUMENTS_SETTLE_MS, RUNS_WAIT_MS, useWorkflowData } from "./use-workflow-data"
import { useProjectRealtime, type ProjectChange } from "@/lib/hooks/use-project-realtime"

describe("useWorkflowData : ce que le workflow d'un projet lit (séance n°25, W1)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    live.value = { state: "connecting", readAt: null, failed: false }
    issues.error = null
    issues.fetchStatuses.mockResolvedValue([{ id: 1 }])
    issues.fetchWorkflowIssues.mockResolvedValue([])
    issues.fetchDocumentCounts.mockResolvedValue({})
    projects.fetchObjective.mockResolvedValue(null)
    delivery.fetchProjectProviders.mockResolvedValue([])
    delivery.projectRuns = {}
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("reads the columns, every issue, the documents, the objective and the agents, then waits for the missions", async () => {
    const { result, rerender } = renderHook(() => useWorkflowData("acme", 3))
    expect(result.current.load).toBe("loading")
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    expect(issues.fetchStatuses).toHaveBeenCalledWith("acme", 3)
    expect(issues.fetchWorkflowIssues).toHaveBeenCalledWith("acme", 3)
    expect(issues.fetchDocumentCounts).toHaveBeenCalledWith("acme", 3)
    expect(projects.fetchObjective).toHaveBeenCalledWith("acme", 3)
    expect(delivery.fetchProjectProviders).toHaveBeenCalledWith("acme", 3)
    // Sans ses missions, une issue au travail se lirait « Not started » : la carte les attend.
    expect(result.current.load).toBe("loading")
    delivery.projectRuns = { 3: { rows: [] } }
    rerender()
    expect(result.current.load).toBe("ready")
  })

  it("shows the map without the missions after a while, or at once when they can't be read", async () => {
    const { result, rerender } = renderHook(() => useWorkflowData("acme", 3))
    await act(async () => { await vi.advanceTimersByTimeAsync(RUNS_WAIT_MS) })
    expect(result.current.load).toBe("ready")

    live.value = { state: "live", readAt: null, failed: true }
    rerender()
    expect(result.current.load).toBe("ready")
  })

  it("says the failure when the issues can't be read, and reads again on « Try again »", async () => {
    issues.fetchWorkflowIssues.mockResolvedValue(null)
    const { result } = renderHook(() => useWorkflowData("acme", 3))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.load).toBe("error")

    issues.fetchWorkflowIssues.mockResolvedValue([])
    delivery.projectRuns = { 3: { rows: [] } }
    act(() => result.current.retry())
    expect(result.current.load).toBe("loading")
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.load).toBe("ready")
    expect(issues.fetchWorkflowIssues).toHaveBeenCalledTimes(2)
  })

  it("says the failure when the columns can't be read", async () => {
    issues.fetchStatuses.mockResolvedValue([])
    issues.error = "Couldn't load the statuses"
    const { result } = renderHook(() => useWorkflowData("acme", 3))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.load).toBe("error")
  })

  it("reads the issues, their documents and the objective again when the live connection comes back", async () => {
    live.value = { state: "live", readAt: 1, failed: false }
    const { rerender } = renderHook(() => useWorkflowData("acme", 3))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    vi.clearAllMocks()

    live.value = { state: "reconnecting", readAt: 1, failed: false }
    rerender()
    expect(issues.fetchWorkflowIssues).not.toHaveBeenCalled()
    live.value = { state: "live", readAt: 2, failed: false }
    rerender()
    expect(issues.fetchWorkflowIssues).toHaveBeenCalledWith("acme", 3)
    expect(issues.fetchDocumentCounts).toHaveBeenCalledWith("acme", 3)
    expect(projects.fetchObjective).toHaveBeenCalledWith("acme", 3)
  })

  it("reads the objective and the document counts again when the project's topic says they changed elsewhere", async () => {
    renderHook(() => useWorkflowData("acme", 3))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const onChange = vi.mocked(useProjectRealtime).mock.calls.at(-1)?.[1] as (change: ProjectChange) => void
    vi.clearAllMocks()

    act(() => onChange({ action: "objective.changed", projectId: 3, issueId: null }))
    expect(projects.fetchObjective).toHaveBeenCalledWith("acme", 3)

    // Trois documents ajoutés d'un coup : une seule relecture, un moment après le dernier ; rien pour un autre projet.
    act(() => {
      onChange({ action: "attachments.changed", projectId: 3, issueId: 7 })
      onChange({ action: "attachments.changed", projectId: 3, issueId: 8 })
      onChange({ action: "attachments.changed", projectId: 3, issueId: 7 })
      onChange({ action: "attachments.changed", projectId: 4, issueId: 9 })
    })
    expect(issues.fetchDocumentCounts).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(DOCUMENTS_SETTLE_MS) })
    expect(issues.fetchDocumentCounts).toHaveBeenCalledTimes(1)
    expect(issues.fetchDocumentCounts).toHaveBeenCalledWith("acme", 3)
  })

  it("reads nothing without a project", () => {
    renderHook(() => useWorkflowData("acme", 0))
    expect(issues.fetchWorkflowIssues).not.toHaveBeenCalled()
  })
})
