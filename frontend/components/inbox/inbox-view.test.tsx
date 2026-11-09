import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

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
import { GROUP_PAGE } from "@/lib/window/inbox"

const signal = (patch: Partial<Signal>): Signal => ({
  id: "1", type: "statusChanged", urgency: "info", read: false, acknowledged: false, operation: "Ops", operationUrl: "/acme/projects/3",
  title: "Fix the footer: moved to Done", issueId: "OPS-12", issueUrl: "/acme/projects/3?issue=12", timestamp: "just now",
  createdAt: "2026-11-08T10:00:00", ...patch,
})

const approval: OpenApproval = { runId: 9, issueId: 12, issueKey: "OPS-12", issueTitle: "Fix login", projectId: 3, requests: 2 }

const run = (patch: Partial<DeliveryRun>): DeliveryRun => ({
  id: 1, issueId: 1, issueKey: "OPS-1", issueTitle: "Done work", projectId: 3, projectName: "Ops", providerKey: "claude-code",
  model: null, status: "DONE", summary: null, resultUrl: null, error: null, startedById: 7, createdAt: null, updatedAt: null,
  outcome: null, ...patch,
})

const group = (name: string) => screen.getByRole("region", { name })

/** « Waiting for you » (R121, R128, R141) : trois groupes de lignes, une phrase par ligne, plus de tableau. */
describe("InboxView", () => {
  const fetchNotifications = vi.fn().mockResolvedValue(undefined)
  const markAsRead = vi.fn().mockResolvedValue(undefined)
  const markAllAsRead = vi.fn().mockResolvedValue(true)
  const acknowledge = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/acme/inbox")
    useUserStore.setState({ user: { id: 7 } as unknown as AuthUser })
    useDeliveryStore.setState({ openApprovals: [], workspaceRuns: [] })
    useNotificationStore.setState({ signals: [], isLoading: false, error: null, fetchNotifications, markAsRead, markAllAsRead, acknowledge })
  })

  it("groups what needs the person, what happened and the alerts, one sentence per row, without a table", () => {
    useDeliveryStore.setState({ openApprovals: [approval], workspaceRuns: [run({})] })
    useNotificationStore.setState({
      signals: [
        signal({ id: "2", type: "mention", title: "Spec", actor: { name: "Ada", initials: "A", avatarUrl: null, email: null } }),
        signal({ id: "3" }),
        signal({ id: "4", type: "overdue", title: "Launch: deadline breached", issueId: "OPS-36", timestamp: "9 days ago" }),
      ],
    })
    render(<InboxView />)

    expect(within(group("Needs you")).getAllByRole("button").map((b) => b.getAttribute("aria-label")).filter(Boolean)).toEqual([
      "Approve or refuse 2 requests on Fix login",
      "Review the result on Done work",
      "Ada mentioned you on Spec",
    ])
    expect(within(group("What happened")).getByText("Fix the footer: moved to Done")).toBeInTheDocument()
    const alerts = within(group("Alerts"))
    expect(alerts.getByText("Launch: deadline breached")).toBeInTheDocument()
    expect(alerts.getByText("OPS-36")).toBeInTheDocument()
    expect(alerts.getByText("9 days ago")).toBeInTheDocument()
    // Ni tableau, ni colonne, ni mot interne (R133), ni pagination sous quelques dizaines de lignes.
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.queryByText("Ack")).not.toBeInTheDocument()
    expect(screen.queryByText("Op")).not.toBeInTheDocument()
    expect(screen.queryByText(/Rows per page/)).not.toBeInTheDocument()
    expect(screen.queryByText("Ops")).not.toBeInTheDocument()
  })

  it("a row is 36 px and its actions say what they do, in words, on hover", () => {
    useNotificationStore.setState({ signals: [signal({ id: "3" })] })
    render(<InboxView />)

    const row = screen.getByRole("button", { name: "Status changed: Fix the footer: moved to Done" })
    expect(row.className).toContain("h-9")
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }))
    expect(markAsRead).toHaveBeenCalledWith("acme", "3")
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(acknowledge).toHaveBeenCalledWith("acme", "3")
    fireEvent.click(screen.getByRole("button", { name: "Open on its board" }))
    expect(push).toHaveBeenCalledWith("/acme/projects/3?issue=12")
  })

  it("a click opens the issue in the pane, over the list", () => {
    useNotificationStore.setState({ signals: [signal({ id: "3" })] })
    render(<InboxView />)

    fireEvent.click(screen.getByRole("button", { name: /^Status changed/ }))
    expect(markAsRead).toHaveBeenCalledWith("acme", "3")
    expect(push).toHaveBeenCalledWith("/acme/inbox?issue=12&project=3", { scroll: false })
  })

  it("a row that leads nowhere does not pretend to be a button, and an unknown type still has a row", () => {
    useNotificationStore.setState({ signals: [signal({ id: "3", type: "assignmentDeclined" as Signal["type"], issueUrl: "", operationUrl: "", title: "Declined" })] })
    render(<InboxView />)

    expect(screen.queryByRole("button", { name: /Declined/ })).not.toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Notification: Declined" })).toBeInTheDocument()
  })

  it("an overload leads to the member, without a key", () => {
    useNotificationStore.setState({
      signals: [signal({ id: "5", type: "overload", title: "Ada is overloaded (9 open issues)", issueId: "overload-7", issueUrl: "/acme/members/7" })],
    })
    render(<InboxView />)

    expect(screen.queryByText("overload-7")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /^Too much work/ }))
    expect(push).toHaveBeenCalledWith("/acme/members/7")
  })

  it("a notification of a request that no longer waits is neither a row nor a number (R128)", () => {
    useNotificationStore.setState({ signals: Array.from({ length: 16 }, (_, i) => signal({ id: String(i), type: "agentApproval", title: `Ask ${i}` })) })
    render(<InboxView />)

    expect(screen.queryByText("Ask 1")).not.toBeInTheDocument()
    // Rien n'attend, le fil est vide : une ligne.
    expect(screen.getByText("Nothing is waiting for you.")).toBeInTheDocument()
    // « Mark all as read » ne porte pas sur ce qui n'est plus affiché.
    expect(screen.queryByRole("button", { name: "Mark all as read" })).not.toBeInTheDocument()
  })

  it("an unread mention appears once: at the top; once read, it joins what happened", () => {
    useNotificationStore.setState({ signals: [signal({ id: "2", type: "mention", title: "Spec" })] })
    const { rerender } = render(<InboxView />)
    expect(screen.getAllByText(/Spec/)).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Someone mentioned you on Spec" }))
    expect(markAsRead).toHaveBeenCalledWith("acme", "2")

    useNotificationStore.setState({ signals: [signal({ id: "2", type: "mention", title: "Spec", read: true })] })
    rerender(<InboxView />)
    expect(within(group("What happened")).getByText("Someone mentioned you on Spec")).toBeInTheDocument()
  })

  it("the end of a mission whose result waits at the top is not said twice", () => {
    useDeliveryStore.setState({ workspaceRuns: [run({})] })
    useNotificationStore.setState({ signals: [signal({ id: "6", type: "agentDone", title: "Done work: Claude Code finished", issueId: "OPS-1" })] })
    render(<InboxView />)

    expect(screen.queryByText("Done work: Claude Code finished")).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "What happened" })).not.toBeInTheDocument()
  })

  it("does not say the list is empty under rows that wait", () => {
    useDeliveryStore.setState({ openApprovals: [approval] })
    render(<InboxView />)

    expect(screen.queryByText("Nothing is waiting for you.")).not.toBeInTheDocument()
  })

  it("marks everything as read, and refreshes on request", () => {
    useNotificationStore.setState({ signals: [signal({ id: "3" })] })
    render(<InboxView />)

    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }))
    expect(markAllAsRead).toHaveBeenCalledWith("acme")
    expect(fetchNotifications).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    expect(fetchNotifications).toHaveBeenCalledTimes(2)
  })

  it("shows every row up to a few dozen, then one line to see the rest", () => {
    useNotificationStore.setState({
      signals: Array.from({ length: GROUP_PAGE + 2 }, (_, i) => signal({ id: String(i), title: `Row ${i}`, read: true })),
    })
    render(<InboxView />)

    expect(within(group("What happened")).getAllByRole("listitem")).toHaveLength(GROUP_PAGE)
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }))
    expect(within(group("What happened")).getAllByRole("listitem")).toHaveLength(GROUP_PAGE + 2)
    expect(screen.queryByRole("button", { name: /^Show \d+ more/ })).not.toBeInTheDocument()
  })

  it("a failure says what happened and what to do, and is not an empty list", () => {
    useNotificationStore.setState({ error: "Could not load notifications." })
    render(<InboxView />)

    expect(screen.getByText(/Couldn't load this list. Check your connection/)).toBeInTheDocument()
    expect(screen.queryByText("Nothing is waiting for you.")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(fetchNotifications).toHaveBeenCalledTimes(2)
  })

  it("loads without claiming the list is empty", () => {
    useNotificationStore.setState({ isLoading: true })
    render(<InboxView />)

    expect(screen.queryByText("Nothing is waiting for you.")).not.toBeInTheDocument()
  })

  it.each([
    ["alerts", "No alert right now.", "Alerts", "Launch: deadline breached", "Fix the footer: moved to Done"],
    ["mentions", "Nobody has mentioned you yet.", "Mentions", "Someone mentioned you on Spec", "Launch: deadline breached"],
  ] as const)("keeps its address for the %s alone", (show, empty, title, kept, gone) => {
    const { unmount } = render(<InboxView show={show} />)
    expect(screen.getByText(empty)).toBeInTheDocument()
    unmount()

    useNotificationStore.setState({
      signals: [
        signal({ id: "3" }),
        signal({ id: "4", type: "overdue", title: "Launch: deadline breached" }),
        signal({ id: "2", type: "mention", title: "Spec", read: true }),
      ],
    })
    render(<InboxView show={show} />)

    expect(within(group(title)).getByText(kept)).toBeInTheDocument()
    expect(screen.queryByText(gone)).not.toBeInTheDocument()
  })
})
