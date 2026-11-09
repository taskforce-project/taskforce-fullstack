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
  MissionResultCard: ({ issueKey, embedded }: { issueKey: string; embedded?: boolean }) => (
    <div role="article" aria-label={`result of ${issueKey}${embedded ? ", embedded" : ""}`} />
  ),
}))

import { WorkView } from "./work-view"
import type { DeliveryRun, DeliveryRunActivity, MissionEvidence } from "@/lib/api/delivery-service"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useUserStore } from "@/lib/store/user-store"

const RUN: DeliveryRun = {
  id: 100, issueId: 28, issueKey: "WEB-28", issueTitle: "Fix the footer", projectId: 3, projectName: "Website",
  providerKey: "claude-code", model: null, status: "RUNNING", summary: null, resultUrl: null, error: null, startedById: 7,
  startedByName: "Pierre", createdAt: "2026-11-07T10:00:00", updatedAt: "2026-11-07T10:02:00", claimedAt: "2026-11-07T10:01:00",
  endedAt: null, branch: "tf/web-28", commits: 2, outcome: null,
}

const WORKING: DeliveryRunActivity = {
  events: [
    { seq: 1, kind: "start", tool: null, text: "Claude Code 2.1 started with claude-opus-5", at: "2026-11-07T10:01:00" },
    { seq: 2, kind: "tool", tool: "Read", text: "src/footer.tsx", at: "2026-11-07T10:01:10" },
    { seq: 3, kind: "text", tool: null, text: "I'll fix the three links.", at: null },
    { seq: 4, kind: "tool", tool: "Edit", text: "src/footer.tsx", at: "2026-11-07T10:01:20" },
    { seq: 5, kind: "tool", tool: "Write", text: "src/links.ts", at: null },
    { seq: 6, kind: "tool", tool: "taskforce: add_comment", text: '{"issue":"WEB-28","content":"Links fixed."}', at: null },
    { seq: 7, kind: "error", tool: null, text: "npm test failed once", at: null },
  ],
  approvals: [
    {
      id: 8, tool: "Bash", summary: "python scripts/gen.py", status: "ALLOWED", createdAt: null, expiresAt: null, decidedAt: "2026-11-07T10:01:30",
      decidedBy: "Pierre", canDecide: false, scope: "MISSION",
    },
  ],
}

const REQUEST = {
  id: 9, tool: "WebFetch", summary: "https://nodejs.org", status: "PENDING" as const, createdAt: null,
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), decidedAt: null, decidedBy: null, canDecide: true,
  askedBy: "agent" as const, action: "web.fetch", rule: "fetch-web", reason: "An address can carry data out of the machine.",
}

const EVIDENCE: MissionEvidence = {
  format: "taskforce-evidence/1",
  events: [
    { seq: 1, at: "2026-11-07T10:01:00Z", type: "mission.started", actor: { kind: "server", id: "taskforce" }, data: null, prev: "0", hash: "aaaaaaaa1111" },
    { seq: 2, at: "2026-11-07T10:01:05Z", type: "action.decided", actor: { kind: "rule", id: "fetch-web" }, data: null, prev: "aaaaaaaa1111", hash: "bbbbbbbb2222" },
  ],
  root: "bbbbbbbb2222",
}
const SEALED: MissionEvidence = {
  ...EVIDENCE, events: [...EVIDENCE.events, { ...EVIDENCE.events[1], seq: 3, type: "mission.ended", hash: "cccccccccccc3333" }], root: "cccccccccccc3333",
}

const DONE: DeliveryRun = { ...RUN, status: "DONE", endedAt: "2026-11-07T10:04:00", summary: "## What I did\nFixed **three** links." }

/** La vue du travail (R138) : cinq étapes en phrases, les commandes à un interrupteur, la preuve en une ligne ; rien n'y juge l'agent (R57). */
describe("WorkView", () => {
  const fetchWorkspaceRuns = vi.fn()
  const fetchRun = vi.fn()
  const fetchActivity = vi.fn()
  const fetchEvidence = vi.fn()
  const downloadEvidence = vi.fn()
  const stopRun = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] })
    vi.setSystemTime(new Date("2026-11-07T10:05:00Z"))
    fetchWorkspaceRuns.mockResolvedValue([])
    useUserStore.setState({ user: { id: "7", email: "pierre@acme.dev", firstName: "Pierre", lastName: "M", displayName: "Pierre" } })
    useDeliveryStore.setState({
      workspaceRuns: [RUN], runs: { 28: RUN }, activity: { 100: WORKING }, evidence: { 100: EVIDENCE },
      fetchWorkspaceRuns, fetchRun, fetchActivity, fetchEvidence, downloadEvidence, stopRun,
    })
  })
  afterEach(() => vi.useRealTimers())

  const steps = () => screen.getByRole("region", { name: "Steps" })

  it("says which issue, which agent and model, for how long, and where it is in one sentence", () => {
    render(<WorkView runId={100} />)

    expect(screen.getByRole("img", { name: "Working" })).toBeInTheDocument()
    const issue = screen.getByRole("link", { name: "WEB-28" })
    expect(issue).toHaveAttribute("href", "/acme/projects/3?issue=28")
    fireEvent.click(issue)
    expect(nav.push).toHaveBeenCalledWith("/acme/projects/3?issue=28", { scroll: false })
    expect(screen.getByText("Claude Code · Opus 5, for Pierre · 4 min")).toBeInTheDocument()
    expect(screen.getByText("Doing the work")).toBeInTheDocument()
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

  it("tells the five steps in sentences, the current one open, and no command in sight", () => {
    render(<WorkView runId={100} />)

    const region = within(steps())
    expect(region.getAllByRole("button", { expanded: false }).map((b) => b.textContent)).toEqual([
      "UnderstandRead footer.tsx", "PlanI'll fix the three links.",
    ])
    expect(region.getByText("Check").parentElement).toHaveTextContent("CheckNot started")
    expect(region.getByText("Hand over").parentElement).toHaveTextContent("Hand overNot started")
    expect(region.getByRole("button", { expanded: true })).toHaveTextContent("DoThat didn't work")
    expect(region.getByText("Edited footer.tsx")).toBeInTheDocument()
    expect(region.getByText("Commented on the issue")).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/taskforce:|add_comment|npm test|Claude Code 2\.1/)
  })

  it("a switch brings the commands back, with their times, and the branch", () => {
    render(<WorkView runId={100} />)
    expect(screen.queryByText(/Branch tf\/web-28/)).toBeNull()

    fireEvent.click(screen.getByRole("switch", { name: "Show commands" }))

    const region = within(steps())
    expect(region.getByText("Edit src/footer.tsx")).toBeInTheDocument()
    expect(region.getByText('taskforce: add_comment {"issue":"WEB-28","content":"Links fixed."}')).toBeInTheDocument()
    expect(region.getByText("npm test failed once")).toBeInTheDocument()
    expect(screen.getByText("Claude Code · Opus 5, for Pierre · 4 min · Branch tf/web-28 · 2 commits")).toBeInTheDocument()
  })

  it("what waits shows in its step and in the sentence of the header, the command behind the switch", () => {
    useDeliveryStore.setState({ activity: { 100: { events: WORKING.events.slice(0, 2), approvals: [REQUEST] } } })
    render(<WorkView runId={100} />)

    expect(screen.getByText("Waiting for you: 1 request")).toBeInTheDocument()
    const region = within(steps())
    expect(region.getByRole("button", { expanded: true })).toHaveTextContent("UnderstandWants to open nodejs.org")
    const card = region.getByRole("group", { name: "Claude Code wants to open a web page" })
    expect(within(card).getByRole("button", { name: "Allow for this mission" })).toBeInTheDocument()
    expect(within(card).queryByText("https://nodejs.org")).toBeNull()

    fireEvent.click(screen.getByRole("switch", { name: "Show commands" }))
    expect(within(region.getByRole("group", { name: "Claude Code wants to open a web page" })).getByText("WebFetch https://nodejs.org")).toBeInTheDocument()
  })

  it("for a teammate, the wait is someone else's", () => {
    useUserStore.setState({ user: { id: "8", email: "ada@acme.dev", firstName: "Ada", lastName: "L", displayName: "Ada" } })
    useDeliveryStore.setState({ activity: { 100: { events: [], approvals: [{ ...REQUEST, canDecide: false }] } } })
    render(<WorkView runId={100} />)

    expect(screen.getByText("Waiting for Pierre: 1 request")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Waiting for an answer" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
  })

  describe("Stop", () => {
    it("asks first, then stops the mission", async () => {
      vi.useRealTimers()
      stopRun.mockResolvedValue(true)
      const { toast } = await import("sonner")
      render(<WorkView runId={100} />)

      fireEvent.click(screen.getByRole("button", { name: "Stop" }))
      const dialog = await screen.findByRole("alertdialog", { name: "Stop this mission?" })
      expect(dialog).toHaveTextContent("Claude Code stops within a few seconds.")
      expect(stopRun).not.toHaveBeenCalled()

      fireEvent.click(within(dialog).getByRole("button", { name: "Stop the mission" }))

      await waitFor(() => expect(stopRun).toHaveBeenCalledWith("acme", 28, 100))
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Mission stopped"))
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    })

    it("keeps working on Keep working", async () => {
      vi.useRealTimers()
      render(<WorkView runId={100} />)

      fireEvent.click(screen.getByRole("button", { name: "Stop" }))
      fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Keep working" }))

      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
      expect(stopRun).not.toHaveBeenCalled()
    })

    it("says so when it couldn't", async () => {
      vi.useRealTimers()
      stopRun.mockResolvedValue(false)
      const { toast } = await import("sonner")
      render(<WorkView runId={100} />)

      fireEvent.click(screen.getByRole("button", { name: "Stop" }))
      fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Stop the mission" }))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't stop the mission: it may have just ended. Look at where it is now."))
    })

    it.each([
      ["a teammate's mission", { ...RUN, startedById: 8 }],
      ["a mission that ended", DONE],
      ["an agent TaskForce can't stop", { ...RUN, providerKey: "github-copilot" }],
    ])("isn't offered for %s", (_label, run) => {
      useDeliveryStore.setState({ workspaceRuns: [run], runs: { 28: run } })
      render(<WorkView runId={100} />)

      expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
    })

    it("a queued mission can be stopped too", () => {
      const queued = { ...RUN, status: "QUEUED" as const }
      useDeliveryStore.setState({ workspaceRuns: [queued], runs: { 28: queued }, activity: { 100: { events: [], approvals: [] } } })
      render(<WorkView runId={100} />)

      expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument()
      expect(screen.getByText("Waiting for your runner to pick it up")).toBeInTheDocument()
    })
  })

  it("the trial agent is named by its model, once", () => {
    const trial = { ...RUN, providerKey: "taskforce-agent", model: "qwen3:8b" }
    useDeliveryStore.setState({ workspaceRuns: [trial], runs: { 28: trial }, activity: { 100: { events: [], approvals: [] } } })
    render(<WorkView runId={100} />)

    expect(screen.getByText("qwen3:8b, for Pierre · 4 min")).toBeInTheDocument()
  })

  it("the time reads under a minute, and without a name who it's for", () => {
    const fresh = { ...RUN, startedByName: null, claimedAt: "2026-11-07T10:04:50" }
    useDeliveryStore.setState({ workspaceRuns: [fresh], runs: { 28: fresh }, activity: { 100: { events: [], approvals: [] } } })
    render(<WorkView runId={100} />)

    expect(screen.getByText("Claude Code · under a minute")).toBeInTheDocument()
  })

  it("the issue without a project is its key, not a link", () => {
    const orphan = { ...RUN, projectId: null, issueKey: null, issueTitle: null }
    useDeliveryStore.setState({ workspaceRuns: [orphan], runs: { 28: orphan } })
    render(<WorkView runId={100} />)

    expect(screen.queryByRole("link", { name: "#28" })).toBeNull()
    expect(screen.getByRole("heading", { name: "#28" })).toBeInTheDocument()
  })

  it("the slot of the changes lists what it produced", () => {
    render(<WorkView runId={100} />)

    expect(within(screen.getByRole("region", { name: "Files and documents" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "src/footer.tsxEdited", "src/links.tsWritten", "Commented",
    ])
  })

  it("approvals say what was allowed, in one sentence first, then line by line, the command behind the switch", () => {
    render(<WorkView runId={100} />)

    const row = screen.getByRole("button", { name: "Approvals: 1 request, allowed by you" })
    expect(screen.queryByText("Ran a script: allowed by you for this mission")).toBeNull()

    fireEvent.click(row)
    expect(screen.getByText("Ran a script: allowed by you for this mission")).toBeInTheDocument()
    expect(screen.queryByText("Bash python scripts/gen.py")).toBeNull()

    fireEvent.click(screen.getByRole("switch", { name: "Show commands" }))
    expect(screen.getByText("Bash python scripts/gen.py")).toBeInTheDocument()

    fireEvent.click(row)
    expect(screen.queryByText("Ran a script: allowed by you for this mission")).toBeNull()
  })

  it("has no approvals row when nothing was asked", () => {
    useDeliveryStore.setState({ activity: { 100: { events: [], approvals: [] } } })
    render(<WorkView runId={100} />)

    expect(screen.queryByRole("button", { name: /^Approvals/ })).toBeNull()
  })

  describe("the proof", () => {
    it.each([
      ["while it builds", EVIDENCE, "2 events so far"],
      ["sealed", SEALED, "3 events, sealed"],
      ["one event", { ...EVIDENCE, events: EVIDENCE.events.slice(0, 1) }, "1 event so far"],
      ["one event, sealed", { ...EVIDENCE, events: [SEALED.events[2]] }, "1 event, sealed"],
    ])("folds into one line: %s", (_label, evidence, line) => {
      useDeliveryStore.setState({ evidence: { 100: evidence } })
      render(<WorkView runId={100} />)

      expect(screen.getByText(line)).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/sha256|bbbbbbbb|#2/)
    })

    it("says when there is no record yet, without offering a download", () => {
      useDeliveryStore.setState({ evidence: { 100: null } })
      render(<WorkView runId={100} />)

      expect(screen.getByText("No record yet")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "JSON" })).toBeNull()
    })

    it("downloads the record", () => {
      downloadEvidence.mockResolvedValue(true)
      render(<WorkView runId={100} />)

      fireEvent.click(screen.getByRole("button", { name: "JSON" }))
      fireEvent.click(screen.getByRole("button", { name: "Markdown" }))

      expect(downloadEvidence.mock.calls).toEqual([["acme", 100, "json"], ["acme", 100, "md"]])
    })

    it("says what happened when the download fails", async () => {
      vi.useRealTimers()
      downloadEvidence.mockResolvedValue(false)
      const { toast } = await import("sonner")
      render(<WorkView runId={100} />)

      fireEvent.click(screen.getByRole("button", { name: "Markdown" }))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/^Couldn't download the record/)))
    })

    it("stops reading it once the mission ended", () => {
      useDeliveryStore.setState({ workspaceRuns: [DONE], runs: { 28: DONE }, evidence: { 100: SEALED } })
      render(<WorkView runId={100} />)

      vi.advanceTimersByTime(10_000)
      expect(fetchEvidence).toHaveBeenCalledTimes(1)
    })
  })

  describe("the result", () => {
    it("shows the result card when the finished mission waits for the person, embedded in the view", () => {
      useDeliveryStore.setState({ workspaceRuns: [DONE], runs: { 28: DONE } })
      render(<WorkView runId={100} />)

      expect(screen.getAllByRole("img", { name: "Waiting for you" })).toHaveLength(2)
      expect(within(steps()).getByText("Hand over").parentElement).toHaveTextContent("Hand overReady for your review")
      expect(screen.getByRole("article", { name: "result of WEB-28, embedded" })).toBeInTheDocument()
      expect(screen.getAllByText("Ready for your review")).toHaveLength(2)
    })

    it.each([
      ["applied", "APPLIED", "Applied: the pull request is merged"],
      ["marked done", "MARKED_DONE", "Marked as done"],
    ] as const)("keeps the agent's words once it's %s", (_label, outcome, sentence) => {
      const decided = { ...DONE, outcome }
      useDeliveryStore.setState({ workspaceRuns: [decided], runs: { 28: decided } })
      render(<WorkView runId={100} />)

      expect(screen.queryByRole("article")).toBeNull()
      expect(screen.getAllByText(sentence).length).toBeGreaterThan(0)
      const result = screen.getByRole("region", { name: "Result" })
      expect(within(result).getByText("What I did")).toBeInTheDocument()
      expect(within(result).getByText("three").tagName).toBe("STRONG")
    })

    it("leaves the result card to the issue's latest mission", () => {
      useDeliveryStore.setState({ workspaceRuns: [DONE], runs: { 28: { ...RUN, id: 101 } } })
      render(<WorkView runId={100} />)

      expect(screen.queryByRole("article")).toBeNull()
      expect(within(screen.getByRole("region", { name: "Result" })).getByText("What I did")).toBeInTheDocument()
    })

    it("has no result while it works", () => {
      render(<WorkView runId={100} />)
      expect(screen.queryByRole("region", { name: "Result" })).toBeNull()
    })

    it("a failure says what happened", () => {
      const failed = { ...RUN, status: "FAILED" as const, error: "The runner stopped. Delegate the task again.", endedAt: "2026-11-07T10:03:00" }
      useDeliveryStore.setState({ workspaceRuns: [failed], runs: { 28: failed } })
      render(<WorkView runId={100} />)

      expect(screen.getByText("It stopped before the end: The runner stopped. Delegate the task again.")).toBeInTheDocument()
      expect(screen.getAllByRole("img", { name: "Failed" })).toHaveLength(2)
    })

    it("a mission the person stopped isn't a failure", () => {
      const stopped = { ...RUN, status: "FAILED" as const, outcome: "STOPPED" as const, error: "Stopped by Pierre.", endedAt: "2026-11-07T10:03:00" }
      useDeliveryStore.setState({ workspaceRuns: [stopped], runs: { 28: stopped } })
      render(<WorkView runId={100} />)

      expect(screen.getByText("Stopped by you")).toBeInTheDocument()
      expect(screen.getByRole("img", { name: "Stopped" })).toBeInTheDocument()
      expect(screen.queryByRole("img", { name: "Failed" })).toBeNull()
    })
  })

  it("links to the pull request once decided; while it waits for review, the result card has the link", () => {
    const pr = { ...DONE, resultUrl: "https://github.com/acme/website/pull/212" }
    useDeliveryStore.setState({ workspaceRuns: [pr], runs: { 28: pr } })
    const { unmount } = render(<WorkView runId={100} />)
    expect(screen.queryByRole("link", { name: "Pull request acme/website#212" })).toBeNull()
    unmount()

    const applied = { ...pr, outcome: "APPLIED" as const }
    useDeliveryStore.setState({ workspaceRuns: [applied], runs: { 28: applied } })
    render(<WorkView runId={100} />)

    expect(screen.getByRole("link", { name: "Pull request acme/website#212" })).toHaveAttribute("href", "https://github.com/acme/website/pull/212")
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
