import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, back: vi.fn() }),
  useParams: () => ({ workspace: "acme" }),
}))

import { LinkedText } from "./answer-links"
import { AnswerText } from "./answer-text"
import type { AssistantToolCall } from "@/lib/api/assistant-service"
import type { DeliveryRun } from "@/lib/api/delivery-service"
import type { Issue } from "@/lib/api/issue-service"
import type { Project } from "@/lib/api/project-service"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { useProjectStore } from "@/lib/store/project-store"

const project = (id: number, name: string, identifier: string) => ({ id, name, identifier } as Project)

const UPDATED: AssistantToolCall = {
  name: "update_issue", status: "success", input: null, output: null, record: "rec",
  target: { issueId: 35, projectId: 4, key: "OPS-35", title: "Rotate the keys" },
}

/** Les liens d'une réponse de Cortex (R120) : une issue ou un projet nommé ouvre son volet, la conversation reste. */
describe("les liens des réponses", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.history.replaceState(null, "", "/acme?c=9")
    useProjectStore.setState({ projects: [project(3, "Website", "WEB"), project(4, "Operations", "OPS")] })
    useIssueStore.setState({ issues: [{ id: 28, identifier: "WEB-28", projectId: 3 } as Issue] })
    useDeliveryStore.setState({ workspaceRuns: [{ id: 1, issueId: 40, issueKey: "OPS-40", projectId: 4 } as DeliveryRun] })
  })

  it("links the issues of the answer's gestures, of the board and of the missions by their id", () => {
    render(<AnswerText text="I moved **OPS-35**, then looked at WEB-28 and OPS-40." toolCalls={[UPDATED]} />)

    expect(screen.getByRole("link", { name: "OPS-35" })).toHaveAttribute("href", "/acme/projects/4?issue=35")
    expect(screen.getByRole("link", { name: "OPS-35" }).closest("strong")).not.toBeNull()
    expect(screen.getByRole("link", { name: "WEB-28" })).toHaveAttribute("href", "/acme/projects/3?issue=28")
    expect(screen.getByRole("link", { name: "OPS-40" })).toHaveAttribute("href", "/acme/projects/4?issue=40")
  })

  it("opens the issue in the pane, without leaving the conversation", () => {
    render(<AnswerText text="See OPS-35." toolCalls={[UPDATED]} />)

    fireEvent.click(screen.getByRole("link", { name: "OPS-35" }))
    expect(nav.push).toHaveBeenCalledWith("/acme/projects/4?c=9&issue=35", { scroll: false })
  })

  it("opens an issue the window doesn't know by its key, and a project by its name", () => {
    render(<LinkedText text="Created OPS-41 in the project Operations." />)

    const created = screen.getByRole("link", { name: "OPS-41" })
    expect(created).toHaveAttribute("href", "/acme/projects/4?issue=OPS-41")
    fireEvent.click(created)
    expect(nav.push).toHaveBeenLastCalledWith("/acme/projects/4?c=9&issue=OPS-41", { scroll: false })

    const board = screen.getByRole("link", { name: "Operations" })
    expect(board).toHaveAttribute("href", "/acme/projects/4")
    fireEvent.click(board)
    expect(nav.push).toHaveBeenLastCalledWith("/acme/projects/4?c=9", { scroll: false })
  })

  it("leaves the rest as text: code, other keys, a workspace without projects", () => {
    render(<AnswerText text={"Run `WEB-28` in UTF-8."} />)
    expect(screen.queryByRole("link")).toBeNull()

    useProjectStore.setState({ projects: [] })
    render(<LinkedText text="Created WEB-29." />)
    expect(screen.getByText("Created WEB-29.")).toBeInTheDocument()
  })
})
