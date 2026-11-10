import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const lines = vi.hoisted(() => ({ value: [] as { key: string; name: string; reconnect: boolean }[] }))
vi.mock("@/lib/hooks/use-connector-lines", () => ({ useConnectorLines: () => lines.value }))
vi.mock("@/lib/api/issue-service", () => ({ searchIssues: vi.fn().mockResolvedValue([]) }))

import { AttachMenu } from "./attach-menu"
import type { IssueHit } from "@/lib/api/issue-service"
import type { Project } from "@/lib/api/project-service"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useProjectStore } from "@/lib/store/project-store"
import { searchKey, useSearchStore } from "@/lib/store/search-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

const initial = useCortexStore.getState()
const hit: IssueHit = { id: 35, projectId: 3, key: "OPS-35", title: "Iteration #35", status: "Done", statusCategory: "COMPLETED" }

function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "Add files, an issue or a project" }), { button: 0, ctrlKey: false })
}

/** Le « + » (R134) : un menu comme celui qu'on connaît, Add files, Issue, Project, puis Connectors. */
describe("AttachMenu", () => {
  const onDone = vi.fn()
  const onFiles = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    lines.value = []
    useCortexStore.setState({ ...initial, attachments: [] })
    useSearchStore.setState({ hits: { [searchKey("acme", "")]: [hit], [searchKey("acme", "ops")]: [hit] }, latest: {}, pending: {} })
    useProjectStore.setState({ projects: [{ id: 3, name: "Operations", identifier: "OPS", status: "ACTIVE" } as unknown as Project] })
    useWorkspaceStore.setState({ members: [], fetchMembers: vi.fn().mockResolvedValue([]) })
  })

  const shown = () => render(<AttachMenu slug="acme" onDone={onDone} onFiles={onFiles} />)

  it("offers the four lines, in their order", () => {
    shown()
    openMenu()

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Add files", "Issue", "Project", "Connectors"])
  })

  it("Issue opens a search for issues only; the choice becomes an attachment", () => {
    shown()
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Issue" }))

    const search = screen.getByRole("combobox", { name: "Find an issue" })
    expect(screen.getByRole("option", { name: /OPS-35/ })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /Operations/ })).toBeNull()
    fireEvent.change(search, { target: { value: "ops" } })
    fireEvent.keyDown(search, { key: "Enter" })

    expect(useCortexStore.getState().attachments.map((a) => a.label)).toEqual(["OPS-35"])
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(onDone).toHaveBeenCalled()
  })

  it("Project opens a search for projects only", () => {
    shown()
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Project" }))

    expect(screen.getByRole("combobox", { name: "Find a project" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("option", { name: /Operations/ }))
    expect(useCortexStore.getState().attachments.map((a) => a.label)).toEqual(["Operations"])
  })

  it("the keyboard walks the search, and Escape closes it", () => {
    shown()
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Issue" }))
    const search = screen.getByRole("combobox", { name: "Find an issue" })

    fireEvent.keyDown(search, { key: "ArrowDown" })
    fireEvent.keyDown(search, { key: "ArrowUp" })
    expect(search).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: /OPS-35/ }).id)
    fireEvent.keyDown(search, { key: "Escape" })

    expect(screen.queryByRole("combobox")).toBeNull()
    expect(useCortexStore.getState().attachments).toEqual([])
  })

  it("a click away closes the search", () => {
    shown()
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Issue" }))

    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole("combobox")).toBeNull()
  })

  it("three attachments fill it, but files can still be added", () => {
    useCortexStore.setState({
      attachments: [1, 2, 3].map((id) => ({ kind: "issue" as const, projectId: 3, issueId: id, label: `OPS-${id}`, title: null })),
    })
    shown()
    openMenu()

    expect(screen.getByRole("menuitem", { name: "Issue" })).toHaveAttribute("data-disabled")
    expect(screen.getByRole("menuitem", { name: "Project" })).toHaveAttribute("data-disabled")
    expect(screen.getByRole("menuitem", { name: "Add files" })).not.toHaveAttribute("data-disabled")
  })

  it("Add files opens the system's choice, and hands over what is chosen", () => {
    const { container } = shown()
    const input = container.querySelector("input[type=file]") as HTMLInputElement
    const click = vi.spyOn(input, "click")
    openMenu()

    fireEvent.click(screen.getByRole("menuitem", { name: "Add files" }))
    expect(click).toHaveBeenCalled()

    const file = new File(["body"], "notes.md")
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFiles).toHaveBeenCalledWith([file])
    expect(onDone).toHaveBeenCalled()
  })

  describe("Connectors", () => {
    function openConnectors() {
      openMenu()
      const row = screen.getByRole("menuitem", { name: "Connectors" })
      fireEvent.keyDown(row, { key: "ArrowRight" })
    }

    it("lists the connected ones, and opens their view", () => {
      lines.value = [{ key: "linear", name: "Linear", reconnect: false }, { key: "gh", name: "GitHub", reconnect: true }]
      const openSettings = vi.fn()
      useSettingsStore.setState({ openSettings })
      shown()
      openConnectors()

      expect(screen.getByRole("menuitem", { name: "Linear" })).toBeInTheDocument()
      expect(screen.getByRole("menuitem", { name: /GitHub/ })).toHaveTextContent("Reconnect")
      fireEvent.click(screen.getByRole("menuitem", { name: "Manage connectors" }))
      expect(openSettings).toHaveBeenCalledWith("integrations")
    })

    it("says so when there is none", () => {
      shown()
      openConnectors()

      expect(screen.getByRole("menuitem", { name: "No connector yet" })).toBeInTheDocument()
    })
  })
})
