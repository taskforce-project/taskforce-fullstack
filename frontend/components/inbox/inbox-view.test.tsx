import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push, back: vi.fn() }),
  usePathname: () => "/acme/inbox",
}))

import { InboxView } from "./inbox-view"
import type { DeliveryRun, OpenApproval } from "@/lib/api/delivery-service"
import type { AuthUser } from "@/lib/auth"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useNotificationStore, type Signal } from "@/lib/store/notification-store"
import { useUserStore } from "@/lib/store/user-store"

const signal = (patch: Partial<Signal>): Signal => ({
  id: "1", type: "assigned", urgency: "info", read: false, acknowledged: false, operation: "Ops", operationUrl: "/acme/projects/3",
  title: "Fix the footer", issueId: "OPS-12", issueUrl: "/acme/projects/3?issue=12", timestamp: "just now",
  createdAt: "2026-11-08T10:00:00", ...patch,
})

const approval: OpenApproval = { runId: 9, issueId: 12, issueKey: "OPS-12", issueTitle: "Fix login", projectId: 3, requests: 2 }

const run = (patch: Partial<DeliveryRun>): DeliveryRun => ({
  id: 1, issueId: 1, issueKey: "OPS-1", issueTitle: "Done work", projectId: 3, projectName: "Ops", providerKey: "claude-code",
  model: null, status: "DONE", summary: null, resultUrl: null, error: null, startedById: 7, createdAt: null, updatedAt: null,
  outcome: null, ...patch,
})

/** « Waiting for you » (R121, R128) : ce qui attend vraiment la personne, puis le fil de ses alertes et de ses mentions. */
describe("InboxView", () => {
  const fetchNotifications = vi.fn().mockResolvedValue(undefined)
  const markAsRead = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/acme/inbox")
    useUserStore.setState({ user: { id: 7 } as unknown as AuthUser })
    useDeliveryStore.setState({ openApprovals: [], workspaceRuns: [] })
    useNotificationStore.setState({ signals: [], isLoading: false, error: null, fetchNotifications, markAsRead })
  })

  it("lists what truly waits: the open requests, the results to judge, then the unread mentions", () => {
    useDeliveryStore.setState({ openApprovals: [approval], workspaceRuns: [run({})] })
    useNotificationStore.setState({ signals: [signal({ id: "2", type: "mention", title: "Spec" })] })
    render(<InboxView />)

    const rows = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")).filter(Boolean)
    expect(rows.slice(0, 3)).toEqual([
      "Approve or refuse 2 requests: OPS-12 Fix login",
      "Review the result on OPS-1 Done work",
      "Mentioned you: OPS-12 Spec",
    ])
  })

  it("a notification of a request that no longer waits is neither a row nor a number (R128)", () => {
    useNotificationStore.setState({ signals: Array.from({ length: 16 }, (_, i) => signal({ id: String(i), type: "agentApproval", title: `Ask ${i}` })) })
    render(<InboxView />)

    expect(screen.queryByText("Ask 1")).not.toBeInTheDocument()
    // Rien n'attend, le fil est vide : « All clear ».
    expect(screen.getByText("All clear")).toBeInTheDocument()
    // Le bouton « Mark all read » ne porte pas sur ce qui n'est plus affiché.
    expect(screen.queryByRole("button", { name: /Mark all read/ })).not.toBeInTheDocument()
  })

  it("an unread mention appears once: at the top; once read, it joins the feed", () => {
    useNotificationStore.setState({ signals: [signal({ id: "2", type: "mention", title: "Spec" })] })
    const { rerender } = render(<InboxView />)
    expect(screen.getAllByText(/Spec/)).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Mentioned you: OPS-12 Spec" }))
    expect(markAsRead).toHaveBeenCalledWith("acme", "2")

    useNotificationStore.setState({ signals: [signal({ id: "2", type: "mention", title: "Spec", read: true })] })
    rerender(<InboxView />)
    expect(screen.queryByRole("button", { name: "Mentioned you: OPS-12 Spec" })).not.toBeInTheDocument()
    expect(screen.getByText("Spec")).toBeInTheDocument()
  })

  it("does not say All clear under rows that wait", () => {
    useDeliveryStore.setState({ openApprovals: [approval] })
    render(<InboxView />)

    expect(screen.queryByText("All clear")).not.toBeInTheDocument()
  })

  it("keeps the rest of the feed as it was", () => {
    useNotificationStore.setState({ signals: [signal({ id: "3", title: "Assigned thing" })] })
    render(<InboxView />)

    expect(screen.getByText("Assigned thing")).toBeInTheDocument()
    expect(fetchNotifications).toHaveBeenCalledWith("acme")
  })
})
