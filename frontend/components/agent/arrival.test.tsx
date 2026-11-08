import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push, back: vi.fn() }),
}))
vi.mock("@/lib/api/issue-service", () => ({ searchIssues: vi.fn() }))

import { Arrival } from "./arrival"
import type { DeliveryRun, OpenApproval } from "@/lib/api/delivery-service"
import { searchIssues } from "@/lib/api/issue-service"
import type { Project } from "@/lib/api/project-service"
import type { AuthUser } from "@/lib/auth"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useSearchStore } from "@/lib/store/search-store"
import { useUserStore } from "@/lib/store/user-store"

const run = (patch: Partial<DeliveryRun>): DeliveryRun => ({
  id: 1, issueId: 1, issueKey: "OPS-1", issueTitle: "Fix login", projectId: 3, projectName: "Ops", providerKey: "claude-code",
  model: null, status: "DONE", summary: null, resultUrl: null, error: null, startedById: 7, createdAt: null,
  updatedAt: null, outcome: null, ...patch,
})

const approval = (patch: Partial<OpenApproval> = {}): OpenApproval => ({
  runId: 9, issueId: 12, issueKey: "OPS-12", issueTitle: "Fix the footer", projectId: 3, requests: 1, ...patch,
})

/** L'arrivée d'une nouvelle conversation (R123, R127), qui remplace le tour guidé (R124) : jamais vide, d'un regard. */
describe("Arrival", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    document.body.innerHTML = ""
    window.history.replaceState(null, "", "/acme")
    useSearchStore.setState({ hits: {}, latest: {}, pending: {} })
    useUserStore.setState({ user: { id: 7, email: "pierre@acme.dev" } as unknown as AuthUser })
    useDeliveryStore.setState({ workspaceRuns: [], openApprovals: [] })
    useProjectStore.setState({ projects: [] })
    useCortexStore.setState({ draft: "" })
    vi.mocked(searchIssues).mockResolvedValue([])
  })

  it("opens on what waits for the person, each line opening its issue in the pane", async () => {
    useDeliveryStore.setState({ workspaceRuns: [run({})], openApprovals: [approval()] })
    render(<Arrival slug="acme" />)

    const waiting = screen.getByRole("region", { name: "Waiting for you" })
    // L'icône dit la demande : la ligne ne montre que la mission, le mot « Approve » est au survol et pour les lecteurs d'écran.
    expect(screen.getByText("OPS-12 Fix the footer")).toBeInTheDocument()
    expect(screen.queryByText(/Approve or refuse/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Approve or refuse: OPS-12 Fix the footer" }))
    expect(push).toHaveBeenCalledWith("/acme/projects/3?issue=12", { scroll: false })

    fireEvent.click(screen.getByRole("button", { name: "Review the result on OPS-1 Fix login" }))
    expect(push).toHaveBeenLastCalledWith("/acme/projects/3?issue=1", { scroll: false })
    expect(waiting).toBeInTheDocument()
  })

  it("shows the number of requests at the right of a mission when several wait", async () => {
    useDeliveryStore.setState({ openApprovals: [approval({ requests: 4 })] })
    render(<Arrival slug="acme" />)

    expect(screen.getByRole("button", { name: "Approve or refuse 4 requests: OPS-12 Fix the footer" })).toHaveTextContent("OPS-12 Fix the footer4")
  })

  it("fits in three lines; beyond three, See all with the total opens Waiting for you in the pane", async () => {
    useDeliveryStore.setState({
      workspaceRuns: [run({ id: 1, issueId: 1 }), run({ id: 2, issueId: 2, issueKey: "OPS-2" })],
      openApprovals: [approval({ requests: 3 }), approval({ runId: 10, issueId: 13, issueKey: "OPS-13" }), approval({ runId: 11, issueId: 14, issueKey: "OPS-14" })],
    })
    render(<Arrival slug="acme" />)

    const region = screen.getByRole("region", { name: "Waiting for you" })
    // Trois lignes et « See all » : les demandes d'abord, les résultats dans le volet.
    expect(within(region).getAllByRole("button")).toHaveLength(4)
    expect(screen.queryByRole("button", { name: /Review the result/ })).not.toBeInTheDocument()

    const seeAll = screen.getByRole("button", { name: "See all 7 waiting for you" })
    expect(seeAll).toHaveTextContent("See all7")
    fireEvent.click(seeAll)
    expect(push).toHaveBeenCalledWith("/acme/inbox", { scroll: false })
  })

  it("exactly three lines: no See all", async () => {
    useDeliveryStore.setState({ openApprovals: [approval(), approval({ runId: 10, issueId: 13 }), approval({ runId: 11, issueId: 14 })] })
    render(<Arrival slug="acme" />)

    expect(screen.queryByRole("button", { name: /See all/ })).not.toBeInTheDocument()
  })

  it("says nothing of a request that no longer waits: only what the store holds counts", async () => {
    render(<Arrival slug="acme" />)
    expect(screen.queryByRole("region", { name: "Waiting for you" })).not.toBeInTheDocument()
  })

  it("then three suggestions drawn from the space; a click fills the composer, it never sends", async () => {
    vi.mocked(searchIssues).mockResolvedValue([
      { id: 35, projectId: 3, key: "OPS-35", title: "Iteration #35", status: "In progress", statusCategory: "STARTED" },
    ])
    useProjectStore.setState({ projects: [{ id: 3, name: "Ops", status: "ACTIVE" }] as unknown as Project[] })
    useDeliveryStore.setState({ workspaceRuns: [run({ id: 9, issueId: 12, issueKey: "OPS-12", status: "RUNNING" })] })
    const send = vi.fn()
    useCortexStore.setState({ send })
    render(<Arrival slug="acme" />)

    const summarize = await screen.findByRole("button", { name: "Summarize OPS-35" })
    expect(screen.getByRole("button", { name: "Where is the mission on OPS-12?" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "What changed in Ops this week?" })).toBeInTheDocument()
    expect(searchIssues).toHaveBeenCalledWith("acme", "")

    fireEvent.click(summarize)
    expect(useCortexStore.getState().draft).toBe("Summarize OPS-35: where it stands and what is left to do.")
    expect(send).not.toHaveBeenCalled()
    expect(screen.queryByRole("region", { name: "Waiting for you" })).toBeNull()
  })

  it("nothing to suggest: says so in one line, once the space has been read", async () => {
    vi.mocked(searchIssues).mockResolvedValue([])
    render(<Arrival slug="acme" />)

    expect(await screen.findByText("Nothing to suggest yet: this space has no issue or project.")).toBeInTheDocument()
  })

  it("a search that fails still lets the arrival say what it knows", async () => {
    vi.mocked(searchIssues).mockRejectedValue(new Error("down"))
    render(<Arrival slug="acme" />)

    await waitFor(() => expect(screen.getByText("Nothing to suggest yet: this space has no issue or project.")).toBeInTheDocument())
  })
})
