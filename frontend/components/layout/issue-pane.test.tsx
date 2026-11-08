import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

// Le contenu de l'issue (ses champs, son fil, sa carte de résultat) se teste avec lui : ici, ce que le volet lui donne.
vi.mock("@/components/sheets/issue-sheet", () => ({
  IssueDetail: ({ issue, onClose, projectId }: { issue: { identifier: string; title: string }; onClose: () => void; projectId: number }) => (
    <div role="article" aria-label={`${issue.identifier} in project ${projectId}`}>
      <p>{issue.title}</p>
      <button type="button" onClick={onClose}>delete it</button>
    </div>
  ),
}))
vi.mock("@/lib/api/issue-service", () => ({ getIssue: vi.fn() }))

import { IssuePane, toSheetIssue } from "./issue-pane"
import { getIssue, type Issue } from "@/lib/api/issue-service"
import { useIssueStore } from "@/lib/store/issue-store"

const issue = (patch: Partial<Issue> = {}): Issue => ({
  id: 34, sequenceNumber: 34, identifier: "WEB-34", projectId: 3, projectName: "Website", title: "Fix the footer",
  description: "Three links", priority: "HIGH", status: { id: 2, name: "In progress", category: "STARTED" },
  type: null, assignee: { id: 7, email: "pierre@acme.dev", displayName: "Pierre", avatarUrl: null },
  reporter: { id: 7, email: "pierre@acme.dev" }, assignmentStatus: null, parent: null, childCount: 0, startDate: null,
  dueDate: "2026-11-20T00:00:00", completedAt: null, storyPoints: 3, labels: [], commentCount: 0, archived: false, pinned: true,
  createdAt: "2026-11-01T10:00:00", updatedAt: "2026-11-02T10:00:00", ...patch,
} as Issue)

/** L'issue dans le volet (R120) : par-dessus l'écran qui la liste, avec son retour et son fil d'Ariane. */
describe("IssuePane", () => {
  const onBack = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useIssueStore.setState({ issues: [], loadedProjectId: null, isLoading: false })
  })

  it("reads the issue as its content does: the raw due date, the points, the assignee's avatar", () => {
    expect(toSheetIssue(issue())).toEqual({
      id: "34", identifier: "WEB-34", title: "Fix the footer", description: "Three links", priority: "HIGH",
      statusId: 2, statusName: "In progress", statusCategory: "STARTED",
      assignee: { name: "Pierre", email: "pierre@acme.dev", userId: 7, avatarUrl: null }, assigneeId: 7,
      labels: [], pinned: true, archived: false, dueDate: "2026-11-20T00:00:00", storyPoints: 3,
      createdAt: "2026-11-01T10:00:00",
    })
    expect(toSheetIssue(issue({ assignee: null, description: null }))).toMatchObject({ assignee: null, assigneeId: null, description: undefined })
  })

  it("opens at once the issue of the board already loaded, under its breadcrumb, and goes back", () => {
    useIssueStore.setState({ issues: [issue()], loadedProjectId: 3 })
    render(<IssuePane slug="acme" target={{ projectId: 3, issueId: 34, key: null }} under="Board" actions={<button type="button">full</button>} onBack={onBack} />)

    expect(screen.getByRole("article", { name: "WEB-34 in project 3" })).toBeInTheDocument()
    expect(getIssue).not.toHaveBeenCalled()
    const crumbs = screen.getByRole("navigation", { name: "WEB-34" })
    expect(crumbs).toHaveTextContent("Board")
    expect(screen.getByText("WEB-34", { selector: "[aria-current]" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "full" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Back to Board" }))
    fireEvent.click(screen.getByRole("button", { name: "Board" }))
    fireEvent.click(screen.getByRole("button", { name: "delete it" }))
    expect(onBack).toHaveBeenCalledTimes(3)
  })

  it("keeps the issue as it was at its opening while it is edited", () => {
    useIssueStore.setState({ issues: [issue()], loadedProjectId: 3 })
    render(<IssuePane slug="acme" target={{ projectId: 3, issueId: 34, key: null }} under="Board" onBack={onBack} />)

    act(() => { useIssueStore.setState({ issues: [issue({ title: "Renamed elsewhere" })] }) })
    expect(screen.getByText("Fix the footer")).toBeInTheDocument()
  })

  it("loads an issue the board doesn't show, and says so while it comes", async () => {
    let resolve: (value: Issue) => void = () => {}
    vi.mocked(getIssue).mockReturnValue(new Promise<Issue>((r) => { resolve = r }))
    render(<IssuePane slug="acme" target={{ projectId: 3, issueId: 34, key: null }} under="Waiting for you" onBack={onBack} />)

    expect(screen.getByRole("status")).toHaveTextContent("Opening the issue")
    expect(screen.getByRole("navigation", { name: "#34" })).toBeInTheDocument()
    expect(getIssue).toHaveBeenCalledWith("acme", 3, 34)
    await act(async () => { resolve(issue({ archived: true })) })
    expect(screen.getByRole("article", { name: "WEB-34 in project 3" })).toBeInTheDocument()
  })

  it("says when the issue can't be opened, and tries again", async () => {
    vi.mocked(getIssue).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(issue())
    render(<IssuePane slug="acme" target={{ projectId: 3, issueId: 34, key: null }} under="Board" onBack={onBack} />)

    await waitFor(() => expect(screen.getByText("Couldn't open this issue.")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByRole("article", { name: "WEB-34 in project 3" })).toBeInTheDocument())
    expect(getIssue).toHaveBeenCalledTimes(2)
  })

  it("finds an issue named by its key on its project's board, once the board is loaded", () => {
    useIssueStore.setState({ issues: [], loadedProjectId: 3, isLoading: true })
    const { rerender } = render(<IssuePane slug="acme" target={{ projectId: 3, issueId: null, key: "WEB-34" }} under="Board" onBack={onBack} />)
    expect(screen.getByRole("status")).toBeInTheDocument()

    act(() => { useIssueStore.setState({ issues: [issue()], isLoading: false }) })
    rerender(<IssuePane slug="acme" target={{ projectId: 3, issueId: null, key: "WEB-34" }} under="Board" onBack={onBack} />)
    expect(screen.getByRole("article", { name: "WEB-34 in project 3" })).toBeInTheDocument()
    expect(getIssue).not.toHaveBeenCalled()
  })

  it("says when the key names no issue of the board", () => {
    useIssueStore.setState({ issues: [issue()], loadedProjectId: 3, isLoading: false })
    render(<IssuePane slug="acme" target={{ projectId: 3, issueId: null, key: "WEB-99" }} under="Board" onBack={onBack} />)

    expect(screen.getByText("WEB-99 isn't on this board: it may be archived or deleted.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })
})
