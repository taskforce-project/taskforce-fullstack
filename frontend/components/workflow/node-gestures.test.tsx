import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

import { NodeMenu, StopDialog, nodeCan, useNodeGestures } from "./node-gestures"
import type { DeliveryProvider, ProjectRun } from "@/lib/api/delivery-service"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { buildWorkflow, type WorkflowNode } from "@/lib/workflow/model"
import { deliveryRun, DOING, DONE, issue, ME, projectRun, STATUSES, TODO } from "@/lib/workflow/__tests__/fixtures"

const agent: DeliveryProvider = { key: "claude-code", displayName: "Claude Code", logoKey: "claude", available: true, ready: true, models: [], reason: null }

function nodeOf(runs: ProjectRun[]): WorkflowNode {
  return buildWorkflow({
    statuses: STATUSES, issues: [issue(1, { title: "Release" })], runs, relations: [], documents: {}, me: ME, today: "2026-11-13",
  }).byKey.get("issue-1") as WorkflowNode
}

/** Les gestes d'un nœud (séance n°25, §6.2) : seulement ce qui marche, chacun par sa route. */
describe("nodeCan", () => {
  it("stop a mission at work of one's own; try again one's failure; hand a not started issue to a ready agent; move always", () => {
    expect(nodeCan(nodeOf([projectRun(deliveryRun(1, 1))]), ME, [agent])).toEqual({ stop: true, retry: false, handToAgent: false, move: true })
    expect(nodeCan(nodeOf([projectRun(deliveryRun(1, 1))]), "8", [agent]).stop).toBe(false)
    expect(nodeCan(nodeOf([projectRun(deliveryRun(1, 1, { providerKey: "github-copilot" }))]), ME, [agent]).stop).toBe(false)
    expect(nodeCan(nodeOf([projectRun(deliveryRun(1, 1, { status: "FAILED", error: "x" }))]), ME, [agent]).retry).toBe(true)
    expect(nodeCan(nodeOf([]), ME, [agent]).handToAgent).toBe(true)
    expect(nodeCan(nodeOf([]), ME, [{ ...agent, ready: false }]).handToAgent).toBe(false)
    // Un membre en lecture seule ne déplace pas, et ne confie pas à un agent : deux écritures (R159, L6).
    expect(nodeCan(nodeOf([]), ME, [agent], false)).toMatchObject({ move: false, handToAgent: false })
  })
})

describe("useNodeGestures", () => {
  const updateIssue = vi.fn()
  const stopRun = vi.fn()
  const retryRun = vi.fn()
  const delegate = vi.fn()
  const fetchProjectRun = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useIssueStore.setState({ updateIssue })
    useDeliveryStore.setState({ stopRun, retryRun, delegate, fetchProjectRun })
    useCortexStore.setState({ attachments: [], open: false })
    fetchProjectRun.mockResolvedValue(null)
  })

  it("moves through the board's route, says it, and undoes it for five seconds", async () => {
    updateIssue.mockResolvedValue(issue(1, { status: DOING }))
    const { result } = renderHook(() => useNodeGestures("acme", 3))
    await act(async () => { await result.current.move(nodeOf([]), DOING) })

    expect(updateIssue).toHaveBeenCalledWith("acme", 3, 1, { statusId: DOING.id })
    const [message, options] = toast.success.mock.calls[0]
    expect(message).toBe("Moved to In Progress.")
    expect(options.duration).toBe(5000)
    await act(async () => { options.action.onClick() })
    expect(updateIssue).toHaveBeenLastCalledWith("acme", 3, 1, { statusId: TODO.id })

    updateIssue.mockResolvedValue(null)
    await act(async () => { await result.current.move(nodeOf([]), DONE) })
    expect(toast.error).toHaveBeenCalledWith("Couldn't move it. Try again.")
    await act(async () => { await result.current.move(nodeOf([]), TODO) })
    expect(updateIssue).toHaveBeenCalledTimes(3)
  })

  it("stops, tries again and hands to an agent through their routes, then reads the mission", async () => {
    const { result } = renderHook(() => useNodeGestures("acme", 3))
    stopRun.mockResolvedValue(true)
    await act(async () => { await result.current.stop(nodeOf([projectRun(deliveryRun(4, 1))])) })
    expect(stopRun).toHaveBeenCalledWith("acme", 1, 4)
    expect(fetchProjectRun).toHaveBeenCalledWith("acme", 3, 4)

    retryRun.mockResolvedValue(deliveryRun(5, 1))
    await act(async () => { await result.current.retry(nodeOf([projectRun(deliveryRun(4, 1, { status: "FAILED" }))])) })
    expect(retryRun).toHaveBeenCalledWith("acme", 1, 4, "")
    expect(fetchProjectRun).toHaveBeenCalledWith("acme", 3, 5)

    delegate.mockResolvedValue(deliveryRun(6, 1))
    await act(async () => { await result.current.handTo(nodeOf([]), agent) })
    expect(delegate).toHaveBeenCalledWith("acme", 1, "claude-code")
    expect(toast.success).toHaveBeenCalledWith("Handed to Claude Code")
  })

  it("says each failure in words", async () => {
    const { result } = renderHook(() => useNodeGestures("acme", 3))
    stopRun.mockResolvedValue(false)
    retryRun.mockResolvedValue(null)
    delegate.mockResolvedValue(null)
    await act(async () => {
      await result.current.stop(nodeOf([projectRun(deliveryRun(4, 1))]))
      await result.current.retry(nodeOf([projectRun(deliveryRun(4, 1, { status: "FAILED" }))]))
      await result.current.handTo(nodeOf([]), agent)
      await result.current.stop(nodeOf([]))
      await result.current.retry(nodeOf([]))
    })
    expect(toast.error).toHaveBeenCalledTimes(3)
  })

  it("joins the node to the composer: Cortex sees it", () => {
    const { result } = renderHook(() => useNodeGestures("acme", 3))
    act(() => result.current.ask(nodeOf([])))
    expect(useCortexStore.getState().attachments).toEqual([{ kind: "issue", projectId: 3, issueId: 1, label: "WEB-1", title: "Release" }])
    expect(useCortexStore.getState().open).toBe(true)
    expect(toast).toHaveBeenCalledWith("WEB-1 is in the composer: write your question to Cortex.")
  })
})

describe("StopDialog and NodeMenu", () => {
  it("asks before stopping, in a 420 px dialog", async () => {
    const onConfirm = vi.fn().mockResolvedValue(true)
    const onOpenChange = vi.fn()
    render(<StopDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />)
    expect(screen.getByRole("alertdialog", { name: "Stop this mission?" }).className).toContain("sm:max-w-[420px]")
    expect(screen.getByText("The work done so far stays on its branch.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Stop the mission" }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it("lists only what works for this node", async () => {
    const gestures = { move: vi.fn(), stop: vi.fn(), retry: vi.fn(), handTo: vi.fn(), ask: vi.fn() }
    const onOpen = vi.fn()
    const node = nodeOf([])
    function Menu() {
      return <NodeMenu node={node} stages={STATUSES} can={nodeCan(node, ME, [agent])} agents={[agent]} gestures={gestures} onOpen={onOpen} open onOpenChange={vi.fn()} />
    }
    render(<Menu />)
    expect(screen.getByRole("menuitem", { name: "Open" })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Move to…" })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Hand to an agent" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Stop" })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: "Try again" })).toBeNull()
    await userEvent.click(screen.getByRole("menuitem", { name: "Open" }))
    expect(onOpen).toHaveBeenCalled()
  })
})
