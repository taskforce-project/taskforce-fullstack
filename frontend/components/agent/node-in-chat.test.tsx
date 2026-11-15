import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))
const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, back: vi.fn() }), useParams: () => ({ workspace: "acme" }) }))

import { NodeInChat } from "./node-in-chat"
import type { AssistantTarget } from "@/lib/api/assistant-service"
import type { AuthUser } from "@/lib/auth"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { useUserStore } from "@/lib/store/user-store"
import { approval, deliveryRun, DONE, issue, projectRun } from "@/lib/workflow/__tests__/fixtures"

const TARGET: AssistantTarget = { issueId: 1, projectId: 3, key: "WEB-1", title: "Release", runId: 4 }

/** Le nœud d'une issue dans la conversation (séance n°25, §9) : les mêmes stores que la vue, et « Open in Workflow ». */
describe("NodeInChat", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.history.replaceState(null, "", "/acme?c=9")
    useUserStore.setState({ user: { id: "7" } as AuthUser })
    useDeliveryStore.setState({ runs: {}, activity: {}, projectRuns: {}, retryRun: vi.fn() })
    useIssueStore.setState({ issues: [], workflowIssues: null })
  })

  it("reads the project's row when the workflow has it: what the person may decide, and « Decide » opens the node", () => {
    useDeliveryStore.setState({ projectRuns: { 3: { rows: [projectRun(deliveryRun(4, 1), [approval(9)])], page: 0, last: true, total: 1 } } })
    render(<NodeInChat slug="acme" target={TARGET} />)

    expect(screen.getByRole("group", { name: "Release, Needs you" })).toBeInTheDocument()
    expect(screen.getByText("Waiting for your approval: build the project.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Decide" }))
    expect(nav.push).toHaveBeenCalledWith("/acme/projects/3/workflow?c=9&node=issue-1", { scroll: false })
  })

  it("otherwise reads the mission and its timeline, as the mission's card does, and changes with them", () => {
    useDeliveryStore.setState({
      runs: { 1: deliveryRun(4, 1) },
      activity: { 4: { events: [{ seq: 1, kind: "start", tool: null, text: "Started", at: null }], approvals: [] } },
    })
    const { rerender } = render(<NodeInChat slug="acme" target={TARGET} withSentence={false} />)
    expect(screen.getByRole("group", { name: "Release, Working" })).toBeInTheDocument()
    expect(screen.queryByText(/Reading up/)).toBeNull()

    useDeliveryStore.setState({ runs: { 1: deliveryRun(4, 1, { status: "DONE" }) } })
    rerender(<NodeInChat slug="acme" target={TARGET} />)
    expect(screen.getByRole("group", { name: "Release, Needs you" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Review" }))
    expect(nav.push).toHaveBeenCalledWith("/acme/projects/3?c=9&issue=1", { scroll: false })
  })

  it("a failure of one's own mission offers to try again", async () => {
    const retryRun = vi.fn().mockResolvedValue(deliveryRun(5, 1))
    useDeliveryStore.setState({ runs: { 1: deliveryRun(4, 1, { status: "FAILED", error: "Tests failed" }) }, retryRun })
    useIssueStore.setState({ issues: [issue(1, { projectId: 3 })] })
    render(<NodeInChat slug="acme" target={TARGET} />)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(retryRun).toHaveBeenCalledWith("acme", 1, 4, ""))
    expect(toast.success).toHaveBeenCalledWith("A new try started")
  })

  it("an issue finished, without a mission, is done; « Open in Workflow » opens its node", () => {
    useIssueStore.setState({ issues: [issue(1, { status: DONE })] })
    render(<NodeInChat slug="acme" target={{ ...TARGET, runId: null }} />)
    expect(screen.getByRole("group", { name: "Release, Done" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open in Workflow" }))
    expect(nav.push).toHaveBeenCalledWith("/acme/projects/3/workflow?c=9&node=issue-1", { scroll: false })
  })
})
