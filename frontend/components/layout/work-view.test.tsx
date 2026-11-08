import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useParams: () => ({ workspace: "acme" }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// La carte de résultat a ses propres tests (mission-result-card.test.tsx).
vi.mock("@/components/sheets/mission-result-card", () => ({
  MissionResultCard: ({ issueKey }: { issueKey: string }) => <div role="article" aria-label={`result of ${issueKey}`} />,
}))

import { WorkView } from "./work-view"
import type { DeliveryRun, DeliveryRunActivity, MissionEvidence } from "@/lib/api/delivery-service"
import { useDeliveryStore } from "@/lib/store/delivery-store"

const RUN: DeliveryRun = {
  id: 100, issueId: 28, issueKey: "WEB-28", issueTitle: "Fix the footer", projectId: 3, projectName: "Website",
  providerKey: "claude-code", model: null, status: "RUNNING", summary: null, resultUrl: null, error: null, startedById: 7,
  startedByName: "Pierre", createdAt: "2026-11-07T10:00:00", updatedAt: "2026-11-07T10:02:00", claimedAt: "2026-11-07T10:01:00",
  endedAt: null, branch: "tf/web-28", commits: 2, outcome: null,
}

const ACTIVITY: DeliveryRunActivity = {
  events: [
    { seq: 1, kind: "start", tool: null, text: "Claude Code 2.1 started", at: "2026-11-07T10:01:00" },
    { seq: 2, kind: "text", tool: null, text: "I'll fix the three links.", at: null },
    { seq: 3, kind: "tool", tool: "Edit", text: "src/footer.tsx", at: null },
    { seq: 4, kind: "tool", tool: "Write", text: "src/links.ts", at: null },
    { seq: 5, kind: "tool", tool: "taskforce: add_comment", text: '{"issue":"WEB-28","content":"Links fixed."}', at: null },
    { seq: 6, kind: "error", tool: null, text: "npm test failed once", at: null },
  ],
  approvals: [
    {
      id: 9, tool: "WebFetch", summary: "https://nodejs.org", status: "PENDING", createdAt: null,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), decidedAt: null, decidedBy: null, canDecide: true,
      askedBy: "agent", action: "web.fetch", rule: "fetch-web", reason: "An address can carry data out of the machine.",
    },
    {
      id: 8, tool: "Bash", summary: "git push", status: "ALLOWED", createdAt: null, expiresAt: null, decidedAt: null,
      decidedBy: "Pierre", canDecide: true, scope: "ONCE",
    },
  ],
}

const EVIDENCE: MissionEvidence = {
  format: "taskforce-evidence/1",
  events: [
    { seq: 1, at: "2026-11-07T10:01:00Z", type: "mission.started", actor: { kind: "server", id: "taskforce" }, data: null, prev: "0", hash: "aaaaaaaa1111" },
    { seq: 2, at: "2026-11-07T10:01:05Z", type: "action.decided", actor: { kind: "rule", id: "fetch-web" }, data: null, prev: "aaaaaaaa1111", hash: "bbbbbbbb2222" },
  ],
  root: "bbbbbbbb2222",
}

/** La vue du travail (R95, point 3) : un volet pour une mission, en direct ; rien n'y juge l'agent (R57). */
describe("WorkView", () => {
  const fetchWorkspaceRuns = vi.fn()
  const fetchRun = vi.fn()
  const fetchActivity = vi.fn()
  const fetchEvidence = vi.fn()
  const downloadEvidence = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] })
    vi.setSystemTime(new Date("2026-11-07T10:05:00Z"))
    fetchWorkspaceRuns.mockResolvedValue([])
    useDeliveryStore.setState({
      workspaceRuns: [RUN], runs: { 28: RUN }, activity: { 100: ACTIVITY }, evidence: { 100: EVIDENCE },
      fetchWorkspaceRuns, fetchRun, fetchActivity, fetchEvidence, downloadEvidence,
    })
  })
  afterEach(() => vi.useRealTimers())

  it("shows the mission live: its state, its issue, the agent, the time, its branch", () => {
    render(<WorkView runId={100} />)

    expect(screen.getByRole("img", { name: "Working" })).toBeInTheDocument()
    const issue = screen.getByRole("link", { name: "WEB-28" })
    expect(issue).toHaveAttribute("href", "/acme/projects/3?issue=28")
    fireEvent.click(issue)
    expect(nav.push).toHaveBeenCalledWith("/acme/projects/3?issue=28", { scroll: false })
    expect(screen.getByText("Claude Code, for Pierre · 4 min · Branch tf/web-28 · 2 commits")).toBeInTheDocument()
  })

  it("reads again the mission, its timeline and its record while it works", () => {
    render(<WorkView runId={100} />)
    expect(fetchRun).toHaveBeenCalledWith("acme", 28)
    expect(fetchActivity).toHaveBeenCalledWith("acme", 100)
    expect(fetchEvidence).toHaveBeenCalledWith("acme", 100)

    vi.advanceTimersByTime(5_000)
    expect(fetchRun.mock.calls.length).toBeGreaterThan(2)
    expect(fetchActivity.mock.calls.length).toBeGreaterThan(2)
    expect(fetchEvidence).toHaveBeenCalledTimes(2)
    expect(fetchWorkspaceRuns).not.toHaveBeenCalled()
  })

  it("lists its steps and tool calls, and the request that waits for the person", () => {
    render(<WorkView runId={100} />)

    const waiting = screen.getByRole("region", { name: "Waiting for you" })
    expect(within(waiting).getByRole("button", { name: "Allow for this mission" })).toBeInTheDocument()
    const steps = within(screen.getByRole("region", { name: "Steps" })).getAllByRole("listitem")
    expect(steps[1]).toHaveTextContent("I'll fix the three links.")
    expect(steps[2]).toHaveTextContent("Edit src/footer.tsx")
    expect(steps[5]).toHaveTextContent("npm test failed once")
  })

  it("lists the files and documents it produced, each diff waiting for its pull request", () => {
    render(<WorkView runId={100} />)

    const files = screen.getByRole("region", { name: "Files and documents" })
    expect(within(files).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "src/footer.tsxEdited", "src/links.tsWritten", "Commented WEB-28: Links fixed.",
    ])
    expect(within(files).queryByRole("link")).toBeNull()
    expect(within(files).getByText("Each file's diff opens here once the agent's pull request is open.")).toBeInTheDocument()
  })

  it("links each file to its diff in the pull request", async () => {
    vi.useRealTimers()
    const done = { ...RUN, status: "DONE" as const, resultUrl: "https://github.com/acme/website/pull/212", endedAt: "2026-11-07T10:04:00" }
    useDeliveryStore.setState({ workspaceRuns: [done], runs: { 28: done } })
    render(<WorkView runId={100} />)

    expect(screen.getByRole("link", { name: "Pull request acme/website#212" })).toHaveAttribute("href", "https://github.com/acme/website/pull/212")
    await waitFor(() => expect(screen.getAllByRole("link", { name: "Diff" })[0].getAttribute("href"))
      .toMatch(/^https:\/\/github\.com\/acme\/website\/pull\/212\/files#diff-[0-9a-f]{64}$/))
  })

  it("lists the approvals it asked for, and the proof as it builds", () => {
    render(<WorkView runId={100} />)

    expect(within(screen.getByRole("region", { name: "Approvals" })).getByRole("listitem"))
      .toHaveTextContent("Bash git push: Allowed by Pierre")
    const proof = screen.getByRole("region", { name: "Proof" })
    expect(proof).toHaveTextContent("2 events in the mission's record, each chained to the one before. The record grows as the agent works.")
    expect(within(proof).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "#2Rule decided · rulebbbbbbbb", "#1Mission started · TaskForceaaaaaaaa",
    ])
    fireEvent.click(within(proof).getByRole("button", { name: "JSON" }))
    fireEvent.click(within(proof).getByRole("button", { name: "Markdown" }))
    expect(downloadEvidence.mock.calls).toEqual([["acme", 100, "json"], ["acme", 100, "md"]])
  })

  it("shows the result card when the finished mission waits for the person, and the sealed record", () => {
    const done = { ...RUN, status: "DONE" as const, endedAt: "2026-11-07T10:04:00" }
    useDeliveryStore.setState({
      workspaceRuns: [done], runs: { 28: done }, activity: { 100: { events: [], approvals: [] } },
      evidence: { 100: { ...EVIDENCE, events: [...EVIDENCE.events, { ...EVIDENCE.events[1], seq: 3, type: "mission.ended", hash: "cccccccccccc3333" }], root: "cccccccccccc3333" } },
    })
    render(<WorkView runId={100} />)

    expect(screen.getByRole("img", { name: "Waiting for you" })).toBeInTheDocument()
    expect(screen.getByRole("article", { name: "result of WEB-28" })).toBeInTheDocument()
    expect(screen.getByText("No step yet: the agent hasn't started.")).toBeInTheDocument()
    expect(screen.getByText("No file or document yet.")).toBeInTheDocument()
    expect(screen.getByText("The agent hasn't asked for anything.")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Proof" })).toHaveTextContent("Sealed when the mission ended, root cccccccccccc.")
    vi.advanceTimersByTime(10_000)
    expect(fetchEvidence).toHaveBeenCalledTimes(1)
  })

  it("leaves the result card to the issue's latest mission, and says when there is no record yet", () => {
    const older = { ...RUN, status: "DONE" as const }
    useDeliveryStore.setState({ workspaceRuns: [older], runs: { 28: { ...RUN, id: 101 } }, evidence: { 100: null } })
    render(<WorkView runId={100} />)

    expect(screen.queryByRole("article")).toBeNull()
    expect(screen.getByText("No record yet: it starts with the mission.")).toBeInTheDocument()
  })

  it("says it is opening the mission, then that it isn't among the recent ones", async () => {
    vi.useRealTimers()
    useDeliveryStore.setState({ workspaceRuns: [], runs: {} })
    render(<WorkView runId={404} />)

    expect(screen.getByRole("status")).toHaveTextContent("Opening the mission")
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("This mission isn't among your workspace's recent missions."))
    expect(fetchWorkspaceRuns).toHaveBeenCalledWith("acme")
  })
})
