import { describe, it, expect, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { push, setTheme } = vi.hoisted(() => ({ push: vi.fn(), setTheme: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  useParams: () => ({ workspace: "acme" }),
}))
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme }) }))
vi.mock("@/lib/api/issue-service", () => ({
  searchIssues: vi.fn().mockResolvedValue([]),
  searchIssueComments: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/api/note-service", () => ({ searchNotes: vi.fn().mockResolvedValue([]) }))

import { CommandPalette } from "./command-palette"
import { searchIssueComments, searchIssues } from "@/lib/api/issue-service"
import { searchNotes } from "@/lib/api/note-service"
import type { Project } from "@/lib/api/project-service"
import type { WorkspaceMember } from "@/lib/api/workspace-service"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useProjectStore } from "@/lib/store/project-store"
import { searchKey, useSearchStore } from "@/lib/store/search-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

// cmdk fait défiler l'élément actif ; happy-dom n'implémente pas scrollIntoView.
Element.prototype.scrollIntoView ??= vi.fn()

const initial = useCortexStore.getState()
const field = () => screen.getByPlaceholderText(/Search issues/)
const selected = () => document.querySelector('[cmdk-item][aria-selected="true"]')

/**
 * La palette de la fenêtre (Ctrl+K ; R121, R124, R141) : les issues par leur clé, leur titre et leurs commentaires, les
 * projets, les personnes, les notes, les conversations, les écrans qui ont quitté le premier regard ; chacun s'ouvre dans
 * le volet, la conversation gardée.
 */
describe("CommandPalette", () => {
  const openConversation = vi.fn().mockResolvedValue(true)
  const fetchMembers = vi.fn().mockResolvedValue([])

  beforeEach(() => {
    push.mockClear()
    fetchMembers.mockClear()
    vi.mocked(searchIssues).mockReset().mockResolvedValue([])
    vi.mocked(searchIssueComments).mockReset().mockResolvedValue([])
    vi.mocked(searchNotes).mockReset().mockResolvedValue([])
    window.history.replaceState(null, "", "/acme?c=12")
    useSettingsStore.setState({ open: false, section: "agents" })
    useProjectStore.setState({
      projects: [
        { id: 3, name: "Operations", identifier: "OPS", status: "ACTIVE" },
        { id: 5, name: "Old", identifier: "OLD", status: "ARCHIVED" },
      ] as unknown as Project[],
    })
    useWorkspaceStore.setState({
      fetchMembers,
      members: [
        { id: 21, userId: 7, email: "ada@acme.test", displayName: "Ada Lovelace", avatarUrl: null, role: "MEMBER", joinedAt: "" },
      ] as unknown as WorkspaceMember[],
    })
    useCortexStore.setState({
      ...initial, draft: "", openConversation,
      conversations: [{ id: 12, title: "Summary of OPS-35", updatedAt: null, messageCount: 2, totalTokens: 0 }],
    })
    useSearchStore.setState({ hits: {}, latest: {}, pending: {}, comments: {}, notes: {} })
  })

  it.each([
    // Sans section, le modal rouvre la dernière consultée (comportement du store).
    ["Settings", "agents"],
    ["Your profile", "profile"],
  ])("« %s » opens the settings window on « %s » without changing the pane", async (label, section) => {
    const onOpenChange = vi.fn()
    render(<CommandPalette open onOpenChange={onOpenChange} />)

    await userEvent.click(screen.getByText(label))

    expect(useSettingsStore.getState()).toMatchObject({ open: true, section })
    expect(push).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it.each([
    ["Dashboard", "/acme/dashboard?c=12"],
    ["My work", "/acme/my-work?c=12"],
    ["Roadmap", "/acme/roadmap?c=12"],
    ["Members", "/acme/members?c=12"],
    ["Waiting for you", "/acme/inbox?c=12"],
    // Ce que Cortex sait et comment il progresse (R125) : le volet « Progress » reste par la recherche.
    ["Progress", "/acme/progress?c=12"],
  ])("finds « %s », which left the first look, and opens it in the pane with the conversation kept", async (label, href) => {
    render(<CommandPalette open onOpenChange={vi.fn()} />)

    await userEvent.click(screen.getByText(label))

    expect(push).toHaveBeenCalledWith(href, { scroll: false })
  })

  it("is 640 px wide with a footer that tells its keys", () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />)

    expect(screen.getByRole("dialog").className).toContain("sm:max-w-[640px]")
    expect(screen.getByText("Open")).toBeInTheDocument()
    expect(screen.getByText("Ask Cortex")).toBeInTheDocument()
    expect(screen.getByText(/Ctrl\s*↵/)).toBeInTheDocument()
  })

  it("selects the first result, then follows the arrows", async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await waitFor(() => expect(selected()).toHaveTextContent("Operations"))

    fireEvent.keyDown(field(), { key: "ArrowDown" })

    expect(selected()).toHaveTextContent("Summary of OPS-35")
  })

  it("finds an issue by its key, and opens it in the pane over the board of its project", async () => {
    // La recherche de l'espace trouve l'issue (« ops 35 » pour OPS-35), après la pause de la frappe.
    vi.mocked(searchIssues).mockImplementation(async (_, query) => (query ? [
      { id: 350, projectId: 3, key: "OPS-35", title: "Iteration #35", status: "Done", statusCategory: "COMPLETED" },
    ] : []))
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await userEvent.type(field(), "ops 35")

    await screen.findByText("OPS-35")
    await waitFor(() => expect(selected()).toHaveTextContent("OPS-35"))
    await userEvent.click(screen.getByText("OPS-35"))

    expect(searchIssues).toHaveBeenCalledWith("acme", "ops 35")
    expect(push).toHaveBeenCalledWith("/acme/projects/3?c=12&issue=350", { scroll: false })
    expect(useSearchStore.getState().hits[searchKey("acme", "ops 35")]).toHaveLength(1)
  })

  it("goes deep: what is written under an issue, without repeating an issue found by its title", async () => {
    vi.mocked(searchIssues).mockImplementation(async (_, query) => (query ? [
      { id: 1, projectId: 3, key: "OPS-1", title: "Deploy pipeline", status: null, statusCategory: null },
    ] : []))
    vi.mocked(searchIssueComments).mockResolvedValue([
      { issueId: 1, projectId: 3, key: "OPS-1", title: "Deploy pipeline", excerpt: "already found" },
      { issueId: 9, projectId: 3, key: "OPS-9", title: "Quiet title", excerpt: "the deploy failed on Monday" },
    ])
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await userEvent.type(field(), "deploy")

    await userEvent.click(await screen.findByText("the deploy failed on Monday"))

    expect(screen.queryByText("already found")).not.toBeInTheDocument()
    expect(push).toHaveBeenCalledWith("/acme/projects/3?c=12&issue=9", { scroll: false })
  })

  it("finds a note by its words, and reads it in the pane", async () => {
    vi.mocked(searchNotes).mockResolvedValue([{ id: 5, title: "Runbook", excerpt: "roll the deploy" }])
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await userEvent.type(field(), "deploy")

    await screen.findByText("Runbook")
    expect(screen.getByText("roll the deploy")).toBeInTheDocument()
    await userEvent.click(screen.getByText("Runbook"))

    expect(searchNotes).toHaveBeenCalledWith("acme", "deploy")
    expect(push).toHaveBeenCalledWith("/acme/notes/5?c=12", { scroll: false })
  })

  it("finds a person by name or email, and opens the card in the pane", async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await userEvent.type(field(), "lovelace")

    await userEvent.click(await screen.findByText("Ada Lovelace"))

    expect(push).toHaveBeenCalledWith("/acme/members/21?c=12", { scroll: false })
  })

  it("loads the people once, on its first opening", () => {
    useWorkspaceStore.setState({ members: [] })
    const { rerender } = render(<CommandPalette open onOpenChange={vi.fn()} />)
    rerender(<CommandPalette open={false} onOpenChange={vi.fn()} />)
    rerender(<CommandPalette open onOpenChange={vi.fn()} />)

    expect(fetchMembers).toHaveBeenCalledTimes(1)
  })

  it("opens a project's board, never an archived one, and a conversation at the center", async () => {
    const onOpenChange = vi.fn()
    render(<CommandPalette open onOpenChange={onOpenChange} />)

    expect(screen.queryByText("Old")).toBeNull()
    await userEvent.click(screen.getByText("Operations"))
    expect(push).toHaveBeenCalledWith("/acme/projects/3?c=12", { scroll: false })

    await userEvent.click(screen.getByText("Summary of OPS-35"))
    expect(openConversation).toHaveBeenCalledWith("acme", 12)
  })

  it("asks Cortex by filling the composer: nothing leaves without sending (R76)", async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await userEvent.type(field(), "which issues are blocked")

    await userEvent.click(await screen.findByText("Ask Cortex: which issues are blocked"))

    expect(useCortexStore.getState().draft).toBe("which issues are blocked")
    expect(push).not.toHaveBeenCalled()
  })

  it("with no result, says so and offers to ask Cortex, already selected", async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await userEvent.type(field(), "zzz nothing")

    const offer = (await screen.findByText("Ask Cortex: zzz nothing")).closest("[cmdk-item]")
    expect(screen.getByText("No results for “zzz nothing”")).toBeInTheDocument()
    await waitFor(() => expect(selected()).toBe(offer))
  })

  it("Ctrl+Enter asks Cortex from anywhere in the list", async () => {
    const onOpenChange = vi.fn()
    vi.mocked(searchIssues).mockImplementation(async (_, query) => (query ? [
      { id: 1, projectId: 3, key: "OPS-1", title: "T", status: null, statusCategory: null },
    ] : []))
    render(<CommandPalette open onOpenChange={onOpenChange} />)
    await userEvent.type(field(), "ops")

    await screen.findByText("OPS-1")
    fireEvent.keyDown(field(), { key: "Enter", ctrlKey: true })

    expect(useCortexStore.getState().draft).toBe("ops")
    expect(push).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("Enter pressed before the answer opens the first result of that answer, not of the list before", async () => {
    let answer: (hits: Awaited<ReturnType<typeof searchIssues>>) => void = () => {}
    vi.mocked(searchIssues).mockImplementation((_, query) => (query
      ? new Promise((resolve) => { answer = resolve })
      : Promise.resolve([])))
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await userEvent.type(field(), "ops-7")

    fireEvent.keyDown(field(), { key: "Enter" })
    expect(push).not.toHaveBeenCalled()
    await waitFor(() => expect(searchIssues).toHaveBeenCalledWith("acme", "ops-7"))
    answer([{ id: 7, projectId: 3, key: "OPS-7", title: "T", status: null, statusCategory: null }])

    await waitFor(() => expect(push).toHaveBeenCalledWith("/acme/projects/3?c=12&issue=7", { scroll: false }))
  })

  it("keeps the list in place until the answer arrives", async () => {
    let answer: (hits: Awaited<ReturnType<typeof searchIssues>>) => void = () => {}
    vi.mocked(searchIssues).mockImplementation((_, query) => (query
      ? new Promise((resolve) => { answer = resolve })
      : Promise.resolve([])))
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await userEvent.type(field(), "ops")
    await waitFor(() => expect(searchIssues).toHaveBeenCalledWith("acme", "ops"))

    // Le serveur n'a pas répondu : la liste d'avant reste, sans section qui saute.
    expect(screen.getByText("Summary of OPS-35")).toBeInTheDocument()
    answer([{ id: 7, projectId: 3, key: "OPS-7", title: "T", status: null, statusCategory: null }])

    expect(await screen.findByText("OPS-7")).toBeInTheDocument()
  })

  it("says when the search can't answer, and what to do", async () => {
    vi.mocked(searchNotes).mockRejectedValue(new Error("down"))
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await userEvent.type(field(), "ops")

    expect(await screen.findByText(/Check your connection/)).toBeInTheDocument()
  })

  it("filters its own rows when typing, and shows the sections it has", async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await userEvent.type(field(), "dash")

    const dashboard = await screen.findByText("Dashboard")
    expect(within(dashboard.closest("[cmdk-group]") as HTMLElement).getByText("Screens")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText("Operations")).toBeNull())
  })

  it("chooses the theme, and the guided tour is gone (R124)", async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />)

    await userEvent.click(screen.getByText("Dark theme"))
    expect(setTheme).toHaveBeenCalledWith("dark")
    expect(screen.queryByText(/product tour/i)).toBeNull()
  })
})
