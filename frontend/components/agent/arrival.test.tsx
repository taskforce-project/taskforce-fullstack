import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push, back: vi.fn() }),
}))
vi.mock("@/lib/api/issue-service", () => ({ searchIssues: vi.fn() }))

import { Arrival } from "./arrival"
import type { DeliveryRun } from "@/lib/api/delivery-service"
import { searchIssues } from "@/lib/api/issue-service"
import type { Project } from "@/lib/api/project-service"
import type { AuthUser } from "@/lib/auth"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useNotificationStore, type Signal } from "@/lib/store/notification-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useSearchStore } from "@/lib/store/search-store"
import { useUserStore } from "@/lib/store/user-store"

const run = (patch: Partial<DeliveryRun>): DeliveryRun => ({
  id: 1, issueId: 1, issueKey: "OPS-1", issueTitle: "Fix login", projectId: 3, projectName: "Ops", providerKey: "claude-code",
  model: null, status: "DONE", summary: null, resultUrl: null, error: null, startedById: 7, createdAt: null,
  updatedAt: null, outcome: null, ...patch,
})

const approval: Signal = {
  id: "s1", type: "agentApproval", urgency: "warning", read: false, acknowledged: false, operation: "Ops",
  operationUrl: "/acme/projects/3", title: "Claude Code asks to push", issueId: "OPS-12",
  issueUrl: "/acme/projects/3?issue=12", timestamp: "just now", createdAt: "2026-11-08T10:00:00",
}

/** L'arrivée d'une nouvelle conversation (R123), qui remplace le tour guidé (R124) : jamais vide. */
describe("Arrival", () => {
  const markAsRead = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/acme")
    useSearchStore.setState({ hits: {}, latest: {}, pending: {} })
    useUserStore.setState({ user: { id: 7, email: "pierre@acme.dev" } as unknown as AuthUser })
    useNotificationStore.setState({ signals: [], markAsRead })
    useDeliveryStore.setState({ workspaceRuns: [] })
    useProjectStore.setState({ projects: [] })
    useCortexStore.setState({ draft: "" })
  })

  it("opens on what waits for the person, each line opening its issue in the pane", async () => {
    vi.mocked(searchIssues).mockResolvedValue([])
    useNotificationStore.setState({ signals: [approval] })
    useDeliveryStore.setState({ workspaceRuns: [run({})] })
    render(<Arrival slug="acme" />)

    const waiting = screen.getByRole("region", { name: "Waiting for you" })
    fireEvent.click(screen.getByRole("button", { name: "Approve or refuse: Claude Code asks to push" }))
    expect(markAsRead).toHaveBeenCalledWith("acme", "s1")
    expect(push).toHaveBeenCalledWith("/acme/projects/3?issue=12", { scroll: false })

    fireEvent.click(screen.getByRole("button", { name: "Review the result on OPS-1 Fix login" }))
    expect(push).toHaveBeenLastCalledWith("/acme/projects/3?issue=1", { scroll: false })
    expect(waiting).toBeInTheDocument()
  })

  it("then three suggestions drawn from the space; a click fills the composer, it never sends", async () => {
    vi.mocked(searchIssues).mockResolvedValue([
      { id: 35, projectId: 3, key: "OPS-35", title: "Iteration #35", status: "In progress", statusCategory: "STARTED" },
    ])
    useProjectStore.setState({ projects: [{ id: 3, name: "Ops", status: "ACTIVE" }] as unknown as Project[] })
    useDeliveryStore.setState({ workspaceRuns: [run({ id: 9, issueId: 12, issueKey: "OPS-12", status: "RUNNING" })] })
    const send = vi.fn()
    useCortexStore.setState({ send })
    render(<Arrival slug="acme" />)

    const summarize = await screen.findByRole("button", { name: "Summarize OPS-35" })
    expect(screen.getByRole("button", { name: "Where is the mission on OPS-12?" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "What changed in Ops this week?" })).toBeInTheDocument()
    expect(searchIssues).toHaveBeenCalledWith("acme", "")

    fireEvent.click(summarize)
    expect(useCortexStore.getState().draft).toBe("Summarize OPS-35: where it stands and what is left to do.")
    expect(send).not.toHaveBeenCalled()
    expect(screen.queryByRole("region", { name: "Waiting for you" })).toBeNull()
  })

  it("nothing to suggest: says so in one line, once the space has been read", async () => {
    vi.mocked(searchIssues).mockResolvedValue([])
    render(<Arrival slug="acme" />)

    expect(await screen.findByText("Nothing to suggest yet: this space has no issue or project.")).toBeInTheDocument()
  })

  it("a search that fails still lets the arrival say what it knows", async () => {
    vi.mocked(searchIssues).mockRejectedValue(new Error("down"))
    render(<Arrival slug="acme" />)

    await waitFor(() => expect(screen.getByText("Nothing to suggest yet: this space has no issue or project.")).toBeInTheDocument())
  })
})
