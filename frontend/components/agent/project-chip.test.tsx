import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

const pathname = vi.hoisted(() => ({ value: "/acme" }))
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }))

import { ProjectChip } from "./project-chip"
import type { Project } from "@/lib/api/project-service"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useScreenStore } from "@/lib/store/screen-store"

const initial = useCortexStore.getState()
const projects = [
  { id: 3, name: "Operations", identifier: "OPS", status: "ACTIVE" },
  { id: 4, name: "Website", identifier: "WEB", status: "ACTIVE" },
  { id: 5, name: "Old", identifier: "OLD", status: "ARCHIVED" },
] as unknown as Project[]

function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: /Project of this conversation/ }), { button: 0, ctrlKey: false })
}

/** Où travaille la conversation (R135) : visible, et changeable d'un clic, « No project » compris. */
describe("ProjectChip", () => {
  const chooseProject = vi.fn().mockResolvedValue(true)

  beforeEach(() => {
    vi.clearAllMocks()
    pathname.value = "/acme"
    useCortexStore.setState({ ...initial, project: null, projectPinned: false, conversationId: null, turns: [], notice: null, chooseProject })
    useProjectStore.setState({ projects })
    useScreenStore.setState({ openIssue: null })
  })

  it("says No project on a screen without one", () => {
    render(<ProjectChip slug="acme" />)
    expect(screen.getByRole("button", { name: "Project of this conversation: No project" })).toHaveTextContent("No project")
  })

  it("a new conversation takes the project of the pane open", () => {
    pathname.value = "/acme/projects/3"
    render(<ProjectChip slug="acme" />)
    expect(screen.getByRole("button", { name: "Project of this conversation: Operations" })).toBeInTheDocument()
  })

  it("takes the project of the issue sheet open over a list", () => {
    useScreenStore.setState({ openIssue: { projectId: 4, issueId: 9 } })
    render(<ProjectChip slug="acme" />)
    expect(screen.getByRole("button", { name: "Project of this conversation: Website" })).toBeInTheDocument()
  })

  it("never changes by itself once the conversation has started", () => {
    pathname.value = "/acme/projects/3"
    useCortexStore.setState({ project: 4, projectPinned: true })
    render(<ProjectChip slug="acme" />)
    expect(screen.getByRole("button", { name: "Project of this conversation: Website" })).toBeInTheDocument()
  })

  it("comes back to the pane's project on a new conversation", () => {
    pathname.value = "/acme/projects/3"
    useCortexStore.setState({ project: 4, projectPinned: true })
    render(<ProjectChip slug="acme" />)

    act(() => useCortexStore.setState({ project: null, projectPinned: false }))

    expect(screen.getByRole("button", { name: "Project of this conversation: Operations" })).toBeInTheDocument()
  })

  it("lists No project and the open projects, a check on the current one", () => {
    useCortexStore.setState({ project: 4, projectPinned: true })
    render(<ProjectChip slug="acme" />)
    openMenu()

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["No project", "Operations", "Website"])
    expect(screen.getByRole("menuitem", { name: "Website" }).querySelector("svg")).not.toBeNull()
    expect(screen.getByRole("menuitem", { name: "Operations" }).querySelector("svg")).toBeNull()
  })

  it("changes at a click, No project included", async () => {
    useCortexStore.setState({ project: 4, projectPinned: true })
    render(<ProjectChip slug="acme" />)
    openMenu()

    fireEvent.click(screen.getByRole("menuitem", { name: "No project" }))
    await act(async () => { await Promise.resolve() })

    expect(chooseProject).toHaveBeenCalledWith("acme", null)
  })

  it("picking the current one does nothing", async () => {
    useCortexStore.setState({ project: 4, projectPinned: true })
    render(<ProjectChip slug="acme" />)
    openMenu()

    fireEvent.click(screen.getByRole("menuitem", { name: "Website" }))
    await act(async () => { await Promise.resolve() })

    expect(chooseProject).not.toHaveBeenCalled()
  })

  it("says it when the choice could not be kept", async () => {
    chooseProject.mockResolvedValueOnce(false)
    render(<ProjectChip slug="acme" />)
    openMenu()

    fireEvent.click(screen.getByRole("menuitem", { name: "Operations" }))
    await act(async () => { await Promise.resolve() })

    expect(useCortexStore.getState().notice).toContain("did not change")
  })

  it("the field gets the cursor back when the list closes", async () => {
    const field = document.createElement("textarea")
    field.id = "command-bar-input"
    document.body.append(field)
    useCortexStore.setState({ project: 4, projectPinned: true })
    render(<ProjectChip slug="acme" />)
    openMenu()

    fireEvent.click(screen.getByRole("menuitem", { name: "Website" }))

    await vi.waitFor(() => expect(document.activeElement).toBe(field))
    field.remove()
  })
})
