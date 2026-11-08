import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { push, setTheme } = vi.hoisted(() => ({ push: vi.fn(), setTheme: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  useParams: () => ({ workspace: "acme" }),
}))
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme }) }))
vi.mock("@/lib/api/issue-service", () => ({ searchIssues: vi.fn().mockResolvedValue([]) }))

import { CommandPalette } from "./command-palette"
import { searchIssues } from "@/lib/api/issue-service"
import type { Project } from "@/lib/api/project-service"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useProjectStore } from "@/lib/store/project-store"
import { searchKey, useSearchStore } from "@/lib/store/search-store"
import { useSettingsStore } from "@/lib/store/settings-store"

// cmdk fait défiler l'élément actif ; happy-dom n'implémente pas scrollIntoView.
Element.prototype.scrollIntoView ??= vi.fn()

const initial = useCortexStore.getState()

/**
 * La recherche de la fenêtre (Ctrl+K ; R121, R124) : les issues par leur clé ou leur titre, les projets, les
 * conversations, les écrans qui ont quitté le premier regard ; chacun s'ouvre dans le volet, la conversation gardée.
 */
describe("CommandPalette", () => {
  const openConversation = vi.fn().mockResolvedValue(true)

  beforeEach(() => {
    push.mockClear()
    vi.mocked(searchIssues).mockResolvedValue([])
    window.history.replaceState(null, "", "/acme?c=12")
    useSettingsStore.setState({ open: false, section: "agents" })
    useProjectStore.setState({
      projects: [
        { id: 3, name: "Operations", identifier: "OPS", status: "ACTIVE" },
        { id: 5, name: "Old", identifier: "OLD", status: "ARCHIVED" },
      ] as unknown as Project[],
    })
    useCortexStore.setState({
      ...initial, draft: "", openConversation,
      conversations: [{ id: 12, title: "Summary of OPS-35", updatedAt: null, messageCount: 2, totalTokens: 0 }],
    })
    useSearchStore.setState({ hits: {}, latest: {}, pending: {} })
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

  it("finds an issue by its key, and opens it in the pane over the board of its project", async () => {
    // La recherche de l'espace trouve l'issue (« ops 35 » pour OPS-35), après la pause de la frappe.
    vi.mocked(searchIssues).mockResolvedValue([
      { id: 350, projectId: 3, key: "OPS-35", title: "Iteration #35", status: "Done", statusCategory: "COMPLETED" },
    ])
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/Search issues/), "ops 35")

    await userEvent.click(await screen.findByText("OPS-35"))

    expect(searchIssues).toHaveBeenCalledWith("acme", "ops 35")
    expect(push).toHaveBeenCalledWith("/acme/projects/3?c=12&issue=350", { scroll: false })
    expect(useSearchStore.getState().hits[searchKey("acme", "ops 35")]).toHaveLength(1)
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
    await userEvent.type(screen.getByPlaceholderText(/Search issues/), "which issues are blocked")

    await userEvent.click(screen.getByText("Ask Cortex: which issues are blocked"))

    expect(useCortexStore.getState().draft).toBe("which issues are blocked")
    expect(push).not.toHaveBeenCalled()
  })

  it("chooses the theme, and the guided tour is gone (R124)", async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />)

    await userEvent.click(screen.getByText("Dark theme"))
    expect(setTheme).toHaveBeenCalledWith("dark")
    expect(screen.queryByText(/product tour/i)).toBeNull()
  })
})
