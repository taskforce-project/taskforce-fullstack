import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => "/acme",
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push: nav.push }),
}))
vi.mock("@/components/workflows/workflow-canvas-dialog", () => ({
  WorkflowCanvasDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="workflow canvas" /> : null),
}))
vi.mock("@/lib/api/assistant-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/assistant-service")>()),
  undoAction: vi.fn(),
}))

import { ChangesRow, MissionsRow, ResultsRow } from "./work-rows"
import type { AnalysisJob } from "@/lib/api/analysis-service"
import { undoAction, type AssistantToolCall } from "@/lib/api/assistant-service"
import type { DeliveryRun } from "@/lib/api/delivery-service"
import type { AuthUser } from "@/lib/auth"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useUserStore } from "@/lib/store/user-store"
import { useWindowStore } from "@/lib/store/window-store"
import { useWorkflowStore } from "@/lib/store/workflow-store"

function run(id: number, patch: Partial<DeliveryRun> = {}): DeliveryRun {
  return {
    id, issueId: id * 10, issueKey: `WEB-${id}`, issueTitle: `Issue ${id}`, projectId: 3, projectName: "Website",
    providerKey: "claude-code", model: null, status: "RUNNING", summary: null, resultUrl: null, error: null,
    startedById: 7, createdAt: "2026-11-05T11:50:00", updatedAt: "2026-11-05T11:55:00", claimedAt: "2026-11-05T11:52:00",
    outcome: null, ...patch,
  }
}

function job(id: number, patch: Partial<AnalysisJob> = {}): AnalysisJob {
  return {
    id, projectId: 3, projectName: "Website", depth: "DEEP", status: "RUNNING", question: null, error: null, briefId: null,
    createdAt: "2026-11-05T11:59:30", updatedAt: "2026-11-05T11:59:30", ...patch,
  }
}

const success = (name: string, patch: Partial<AssistantToolCall> = {}): AssistantToolCall => ({
  name, status: "success", input: null, output: null, record: "rec-1", ...patch,
})

const unfold = (name: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }))

/** Results, Changes et Missions (R122) : le travail de la personne, chaque ligne vers son objet (R57). */
describe("les lignes du travail de la zone de droite", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"))
    vi.clearAllMocks()
    useWindowStore.setState({ rows: {} })
    useUserStore.setState({ user: { id: "7" } as AuthUser })
    useDeliveryStore.setState({ workspaceRuns: [] })
    useWorkflowStore.setState({ jobs: [] })
    useCortexStore.setState({ turns: [], done: [], undos: {}, deletions: {} })
  })
  afterEach(() => vi.useRealTimers())

  it("lists the results that wait for the person's judgment, each opening its issue", () => {
    useDeliveryStore.setState({
      workspaceRuns: [run(1, { status: "DONE" }), run(2, { status: "DONE", outcome: "APPLIED" }), run(3, { status: "DONE", startedById: 8 })],
    })
    render(<ResultsRow />)

    expect(screen.getByRole("button", { name: /^Results/ })).toHaveTextContent("1")
    unfold("Results")
    const result = screen.getByRole("link", { name: /WEB-1 Issue 1/ })
    expect(result).toHaveAttribute("href", "/acme/projects/3?issue=10")
    fireEvent.click(result)
    expect(nav.push).toHaveBeenCalledWith("/acme/projects/3?issue=10", { scroll: false })
  })

  it("says when no result waits", () => {
    render(<ResultsRow />)
    unfold("Results")
    expect(screen.getByText("No result waits for your review.")).toBeInTheDocument()
  })

  it("lists what the conversation changed, with Undo where it can, and the pull requests of its missions", async () => {
    vi.mocked(undoAction).mockResolvedValue({ tool: "create_issue", status: "success", output: "WEB-14 is gone." })
    useCortexStore.setState({
      turns: [{
        id: "a1", role: "assistant",
        answer: {
          answer: "Done.", reasoning: null, mode: "fast", sources: [], steps: [],
          toolCalls: [
            success("update_issue", { input: '{"issue":"WEB-12","status":"Done"}', target: { issueId: 120, projectId: 3, key: "WEB-12", title: "Fix the login" } }),
            success("delegate_issue", { target: { issueId: 50, projectId: 3, key: "WEB-5", title: "Pricing" } }),
          ],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        },
      }],
      done: [success("create_issue", { input: '{"title":"Pricing page"}', output: "Created WEB-14" })],
    })
    useDeliveryStore.setState({ workspaceRuns: [run(5, { status: "DONE", resultUrl: "https://github.com/acme/website/pull/212" })] })
    render(<ChangesRow />)

    expect(screen.getByRole("button", { name: /^Changes/ })).toHaveTextContent("3")
    unfold("Changes")
    // Le plus récent d'abord : la carte, puis les gestes du tour, du dernier au premier.
    expect(screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent).slice(0, 3)).toEqual([
      "Created Pricing page", "Handed to an agent WEB-5 Pricing", "Moved WEB-12 Fix the login",
    ])
    expect(screen.getByRole("link", { name: "Pull request acme/website#212" }))
      .toHaveAttribute("href", "https://github.com/acme/website/pull/212")

    // Undo sur la création, faite sur sa carte : le même état que dans la conversation.
    const undo = screen.getAllByRole("button", { name: "Undo" })
    expect(undo).toHaveLength(1)
    fireEvent.click(undo[0])
    await waitFor(() => expect(screen.getByText("Undone. WEB-14 is gone.")).toBeInTheDocument())
  })

  // Ce que la carte de suppression fait entre dans « Changes » (R122), et l'archivage s'y défait comme sur la carte.
  it("shows the archive and the deletion done on the delete card, the archive with its Undo", async () => {
    const archiveIssue = vi.fn().mockResolvedValue({ id: 120 })
    useIssueStore.setState({ archiveIssue })
    const target = { issueId: 120, projectId: 3, key: "WEB-12", title: "Fix the login" }
    const card = success("delete_issue", { status: "pending", record: "rec-2", target })
    await useCortexStore.getState().archiveFromCard("acme", card, true)
    useCortexStore.getState().noteDone(success("delete_issue", { record: "rec-3", target: { issueId: 90, projectId: 3, key: "WEB-9", title: "Old page" } }))
    render(<ChangesRow />)

    unfold("Changes")
    expect(screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent)).toEqual([
      "Deleted WEB-9 Old page", "Archived WEB-12 Fix the login",
    ])
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))

    await waitFor(() => expect(archiveIssue).toHaveBeenLastCalledWith("acme", 3, 120, false))
    await waitFor(() => expect(screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent)).toEqual(["Deleted WEB-9 Old page"]))
    expect(useCortexStore.getState().deletions["rec-2:120"]).toEqual({ status: "idle" })
  })

  it("says when putting an archived issue back fails", async () => {
    const archiveIssue = vi.fn().mockResolvedValueOnce({ id: 120 }).mockResolvedValueOnce(null)
    useIssueStore.setState({ archiveIssue })
    const card = success("delete_issue", { status: "pending", record: "rec-2", target: { issueId: 120, projectId: 3, key: "WEB-12", title: "Fix the login" } })
    await useCortexStore.getState().archiveFromCard("acme", card, true)
    render(<ChangesRow />)

    unfold("Changes")
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))

    await waitFor(() => expect(screen.getByText("Couldn't put it back on the board. Try again.")).toBeInTheDocument())
    expect(screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent)).toEqual(["Archived WEB-12 Fix the login"])
  })

  it("says when the conversation changed nothing yet", () => {
    render(<ChangesRow />)
    unfold("Changes")
    expect(screen.getByText("This conversation hasn't changed anything in TaskForce yet.")).toBeInTheDocument()
  })

  it("shows the running missions with their time, then unfolds the history from Done", () => {
    useDeliveryStore.setState({
      workspaceRuns: [run(1), run(2, { status: "DONE", outcome: "APPLIED" }), run(3, { startedById: 8 })],
    })
    useWorkflowStore.setState({ jobs: [job(4), job(6, { status: "DONE" })] })
    render(<MissionsRow />)

    expect(screen.getByRole("button", { name: /^Missions/ })).toHaveTextContent("2")
    unfold("Missions")
    // Une mission ouvre sa vue du travail (R95, point 3).
    const working = screen.getByRole("link", { name: /WEB-1 Issue 1/ })
    expect(working).toHaveTextContent("8 min")
    expect(working).toHaveAttribute("href", "/acme/missions/1")
    fireEvent.click(working)
    expect(nav.push).toHaveBeenCalledWith("/acme/missions/1", { scroll: false })
    expect(screen.getByRole("link", { name: /Analysis of Website/ })).toHaveTextContent("Under a minute")
    expect(screen.queryByRole("link", { name: /WEB-2/ })).toBeNull()
    expect(screen.queryByRole("link", { name: /WEB-3/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Done: 2" }))
    expect(screen.getByRole("link", { name: /WEB-2 Issue 2/ })).toHaveAttribute("href", "/acme/missions/2")
    expect(screen.getAllByRole("link", { name: /Analysis of Website/ })[1]).toHaveAttribute("href", "/acme/analytics")
  })

  it("answers the question of an analysis that waits, and says when the reply fails", async () => {
    const answer = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    useWorkflowStore.setState({ jobs: [job(4, { status: "WAITING_FOR_INPUT", question: "Which release matters most?" })], answer })
    render(<MissionsRow />)
    unfold("Missions")

    expect(screen.getByText("Which release matters most?")).toBeInTheDocument()
    const reply = screen.getByRole("textbox", { name: "Your reply" })
    fireEvent.change(reply, { target: { value: "  The spring one " } })
    fireEvent.click(screen.getByRole("button", { name: "Send the reply" }))
    await waitFor(() => expect(screen.getByText("Couldn't send the reply. Try again.")).toBeInTheDocument())
    expect(answer).toHaveBeenCalledWith("acme", 4, "The spring one")

    fireEvent.click(screen.getByRole("button", { name: "Send the reply" }))
    await waitFor(() => expect(reply).toHaveValue(""))
  })

  it("says when no mission runs, and keeps the workflow canvas two clicks away", () => {
    render(<MissionsRow />)
    unfold("Missions")

    expect(screen.getByText("No mission running.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open the workflow canvas" }))
    expect(screen.getByRole("dialog", { name: "workflow canvas" })).toBeInTheDocument()
  })
})
