import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

import { DecisionPanel } from "./decision-panel"
import type { AuthUser } from "@/lib/auth"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useUserStore } from "@/lib/store/user-store"
import { approval, deliveryRun } from "@/lib/workflow/__tests__/fixtures"

const now = new Date(2026, 10, 13, 9, 0)

/** Décider (séance n°25, §6.1) : jamais un « Approve » nu. */
describe("DecisionPanel", () => {
  const decideApproval = vi.fn()
  const fetchProjectRun = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    decideApproval.mockResolvedValue(true)
    fetchProjectRun.mockResolvedValue(null)
    useDeliveryStore.setState({ decideApproval, fetchProjectRun })
    useUserStore.setState({ user: { id: "7", email: "pierre@acme.dev", displayName: "Pierre Martin" } as AuthUser })
  })

  it("shows the rule, the signatures, the deadline and what follows, and the meaning of the signature", () => {
    const asks = approval(9, {
      reason: "Releases need two people", signatures: 2, signedBy: ["Sam"], separate: true, binding: true,
      expiresAt: "2026-11-13T23:30:00",
    })
    render(<DecisionPanel slug="acme" projectId={3} run={deliveryRun(1, 2)} approval={asks} now={now} agent="Claude Code" />)

    expect(screen.getByRole("heading", { name: "Let Claude Code build the project?" })).toBeInTheDocument()
    expect(screen.getByText("Rule: Releases need two people")).toBeInTheDocument()
    expect(screen.getByText("2 different people approve: 1 so far.")).toBeInTheDocument()
    expect(screen.getByText("The person who delegated this task can't approve it.")).toBeInTheDocument()
    expect(screen.getByText(/^Expires .*\. Then: No answer in time: refused\.$/)).toBeInTheDocument()
    expect(screen.getByText("Signing as Pierre Martin. Meaning: Approval.")).toBeInTheDocument()
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument()
  })

  it("approves once, with the reason, then reads the mission again", async () => {
    render(<DecisionPanel slug="acme" projectId={3} run={deliveryRun(1, 2)} approval={approval(9)} now={now} />)
    expect(screen.getByText("No rule of your workspace covers this: the agent asks before it acts.")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Why? (optional)"), { target: { value: "Checked the diff" } })
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))

    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith("acme", 1, 9, true, false, "Checked the diff"))
    expect(fetchProjectRun).toHaveBeenCalledWith("acme", 3, 1)
    expect(toast.success).toHaveBeenCalledWith("Approved")
  })

  it("refuses, and says a failure in words", async () => {
    decideApproval.mockResolvedValue(false)
    render(<DecisionPanel slug="acme" projectId={3} run={deliveryRun(1, 2)} approval={approval(9)} now={now} />)
    fireEvent.click(screen.getByRole("button", { name: "Refuse" }))
    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith("acme", 1, 9, false, false, ""))
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/^Couldn't record your decision/))
    // Refusée par le serveur (échue, tranchée ailleurs) : la mission se relit aussi, et le nœud dit où elle en est.
    expect(fetchProjectRun).toHaveBeenCalledWith("acme", 3, 1)
  })

  it("past its deadline, a request is not offered: it says it expired, without a button", () => {
    const late = approval(9, { expiresAt: "2026-11-13T07:30:00" })
    render(<DecisionPanel slug="acme" projectId={3} run={deliveryRun(1, 2)} approval={late} now={now} />)
    expect(screen.getByText(/^This request expired .*\. No answer in time: refused\.$/)).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("a signature that waits for others says so", async () => {
    render(<DecisionPanel slug="acme" projectId={3} run={deliveryRun(1, 2)} approval={approval(9, { signatures: 2 })} now={now} />)
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Signed: the request waits for the other people"))
  })

  it("asks in words: TaskForce for its own requests, the agent's name otherwise", () => {
    const { unmount } = render(<DecisionPanel slug="acme" projectId={3} run={deliveryRun(1, 2)} approval={approval(9, { askedBy: "runner" })} now={now} />)
    expect(screen.getByRole("heading", { name: "Let TaskForce build the project?" })).toBeInTheDocument()
    unmount()
    render(<DecisionPanel slug="acme" projectId={3} run={deliveryRun(1, 2)} approval={approval(9)} now={now} />)
    expect(screen.getByRole("heading", { name: "Let Claude Code build the project?" })).toBeInTheDocument()
  })

  it("for who can't decide and a rule that names a role: only who it waits for, the rest on their own lines", () => {
    const asks = approval(9, { canDecide: false, waitingFor: [["role:admin"]], signatures: 2, signedBy: ["Sam"], separate: true })
    render(<DecisionPanel slug="acme" projectId={3} run={deliveryRun(1, 2)} approval={asks} now={now} />)
    expect(screen.getByText("Waiting for an admin. You can't decide this one.")).toBeInTheDocument()
    expect(screen.getByText("2 different people approve: 1 so far.")).toBeInTheDocument()
    expect(screen.getByText("The person who delegated this task can't approve it.")).toBeInTheDocument()
    expect(screen.getByText("Approved by Sam.")).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("for who can't decide: who it waits for, and no button", () => {
    render(<DecisionPanel slug="acme" projectId={3} run={deliveryRun(1, 2, { startedByName: "Sam" })} approval={approval(9, { canDecide: false })} now={now} />)
    expect(screen.getByText("Waiting for Sam. You can't decide this one.")).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })
})
