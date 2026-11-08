import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push, back: vi.fn() }),
}))

import { WaitingRows } from "./waiting-rows"
import { useNotificationStore } from "@/lib/store/notification-store"
import type { WaitingItem } from "@/lib/window/arrival"

const item = (patch: Partial<WaitingItem>): WaitingItem => ({
  id: "approval:9", kind: "approval", label: "OPS-12 Fix", name: "Approve or refuse: OPS-12 Fix", count: 1,
  issue: { projectId: 3, issueId: 12 }, href: null, signalId: null, ...patch,
})

/** Une ligne par chose (R127, R129) : la même dans l'arrivée et dans le volet. */
describe("WaitingRows", () => {
  const markAsRead = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/acme")
    useNotificationStore.setState({ markAsRead })
  })

  it("a line opens its issue in the pane, named in full on hover and for screen readers", () => {
    render(<WaitingRows slug="acme" items={[item({})]} />)

    const row = screen.getByRole("button", { name: "Approve or refuse: OPS-12 Fix" })
    expect(row).toHaveTextContent("OPS-12 Fix")
    expect(row).not.toHaveTextContent("Approve")
    expect(row.className).toContain("h-8")
    fireEvent.click(row)
    expect(push).toHaveBeenCalledWith("/acme/projects/3?issue=12", { scroll: false })
    expect(markAsRead).not.toHaveBeenCalled()
  })

  it("shows the count at the right only when several wait, never in red", () => {
    render(<WaitingRows slug="acme" items={[item({ count: 3 }), item({ id: "b", name: "Other one", label: "Other" })]} />)

    const count = screen.getByText("3")
    expect(count.className).not.toMatch(/destructive|red|animate/)
    expect(screen.getByRole("button", { name: "Other one" })).toHaveTextContent(/^Other$/)
  })

  it("a mention read by its click, and an address that is not an issue", () => {
    render(<WaitingRows slug="acme" items={[item({ id: "m", kind: "mention", name: "Mentioned you: A", issue: null, href: "/acme/members", signalId: "s1" })]} />)

    fireEvent.click(screen.getByRole("button", { name: "Mentioned you: A" }))
    expect(markAsRead).toHaveBeenCalledWith("acme", "s1")
    expect(push).toHaveBeenCalledWith("/acme/members")
  })

  it("does nothing for a line with nowhere to go", () => {
    render(<WaitingRows slug="acme" items={[item({ issue: null, href: null })]} />)

    fireEvent.click(screen.getByRole("button", { name: "Approve or refuse: OPS-12 Fix" }))
    expect(push).not.toHaveBeenCalled()
  })

  it("See all shows the total and opens the pane", () => {
    const onOpen = vi.fn()
    render(<WaitingRows slug="acme" items={[item({})]} more={{ total: 17, onOpen }} />)

    const seeAll = screen.getByRole("button", { name: "See all 17 waiting for you" })
    expect(seeAll).toHaveTextContent("See all17")
    fireEvent.click(seeAll)
    expect(onOpen).toHaveBeenCalled()
  })
})
