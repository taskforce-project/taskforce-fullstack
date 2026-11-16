import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import { Inspector, type InspectorMode } from "./inspector"
import type { NodeGestures } from "./node-gestures"
import type { DeliveryProvider } from "@/lib/api/delivery-service"
import type { AuthUser } from "@/lib/auth"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { useUserStore } from "@/lib/store/user-store"
import { buildWorkflow, type WorkflowModel } from "@/lib/workflow/model"
import { approval, deliveryRun, DOING, issue, ME, projectRun, relation, STATUSES } from "@/lib/workflow/__tests__/fixtures"

const agent: DeliveryProvider = { key: "claude-code", displayName: "Claude Code", logoKey: "claude", available: true, ready: true, models: [], reason: null }
const now = new Date(2026, 10, 13, 9, 0)

function setup(model: WorkflowModel, key: string, mode: InspectorMode = "side") {
  const node = model.byKey.get(key)
  if (!node) throw new Error("no node")
  const gestures: NodeGestures = { move: vi.fn(), stop: vi.fn(), retry: vi.fn(), handTo: vi.fn(), ask: vi.fn() }
  const props = {
    onTab: vi.fn(), onResize: vi.fn(), onClose: vi.fn(), onSelect: vi.fn(), onOpen: vi.fn(), onOpenMission: vi.fn(), onMenuOpen: vi.fn(),
  }
  const view = render(
    <Inspector slug="acme" projectId={3} node={node} model={model} stages={STATUSES} agents={[agent]}
      agent={node.run ? { name: "Claude Code", logoKey: null, model: null } : null} me={ME} tab="details" mode={mode} width={360}
      gestures={gestures} menuOpen={false} now={now} {...props} />,
  )
  return { ...view, gestures, props, node }
}

/** L'inspecteur du nœud choisi (séance n°25, §5) : une région complémentaire, trois onglets. */
describe("Inspector", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUserStore.setState({ user: { id: "7", email: "pierre@acme.dev", displayName: "Pierre Martin" } as AuthUser })
    useDeliveryStore.setState({
      activity: {}, evidence: {}, missionChanges: {},
      fetchActivity: vi.fn().mockResolvedValue(null), fetchEvidence: vi.fn().mockResolvedValue(null),
      fetchMissionChanges: vi.fn().mockResolvedValue(null), downloadEvidence: vi.fn().mockResolvedValue(true),
      decideApproval: vi.fn().mockResolvedValue(true), fetchProjectRun: vi.fn().mockResolvedValue(null),
    })
    useIssueStore.setState({ issueActivity: {}, fetchIssueActivity: vi.fn().mockResolvedValue([]) })
  })

  it("Details: what it is, who answers for it and who does it, what waits, what comes next, its links and the decision", async () => {
    const a = issue(1, { title: "Design" })
    const b = issue(2, { title: "Release", status: DOING, assignee: { id: 9, email: "alex@acme.dev", displayName: "Alex Chen", avatarUrl: null } as never })
    const model = buildWorkflow({
      statuses: STATUSES, issues: [a, b], relations: [relation(1, a, b)], documents: { 2: 2 }, me: ME, today: "2026-11-13",
      runs: [projectRun(deliveryRun(1, 2), [approval(9, { reason: "Builds can touch the release" })])],
    })
    const { gestures, props } = setup(model, "issue-2")

    const region = screen.getByRole("complementary", { name: "About the chosen node" })
    expect(within(region).getByRole("heading", { name: "Release" })).toBeInTheDocument()
    expect(within(region).getByText("An issue in In Progress, with a mission by Claude Code.")).toBeInTheDocument()
    expect(within(region).getByRole("region", { name: "Let Claude Code build the project?" })).toBeInTheDocument()
    expect(within(region).getByText("Alex Chen")).toBeInTheDocument()
    expect(within(region).getByText("Done")).toBeInTheDocument()
    fireEvent.click(within(region).getByRole("button", { name: /WEB-1/ }))
    expect(props.onSelect).toHaveBeenCalledWith("issue-1")
    fireEvent.click(within(region).getByRole("button", { name: "2 documents" }))
    expect(props.onOpen).toHaveBeenCalled()

    fireEvent.click(within(region).getByRole("button", { name: /Ask about this step/ }))
    expect(gestures.ask).toHaveBeenCalled()
    fireEvent.click(within(region).getByRole("button", { name: "Show raw" }))
    expect(within(region).getByText(/"identifier": "WEB-2"/)).toBeInTheDocument()
    fireEvent.click(within(region).getByRole("button", { name: "Close" }))
    expect(props.onClose).toHaveBeenCalled()
  })

  it("a failure says its cause and offers to try again; an issue not started can go to an agent", async () => {
    const model = buildWorkflow({
      statuses: STATUSES, issues: [issue(1, { status: DOING }), issue(2)], relations: [], documents: {}, me: ME, today: "2026-11-13",
      runs: [projectRun(deliveryRun(1, 1, { status: "FAILED", error: "The tests failed." }))],
    })
    const failed = setup(model, "issue-1")
    expect(screen.getByText("The tests failed.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(failed.gestures.retry).toHaveBeenCalled()
    failed.unmount()

    const fresh = setup(model, "issue-2", "sheet")
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }))
    expect(fresh.gestures.handTo).toHaveBeenCalledWith(fresh.node, agent)
    // En feuille, un retour ramène aux colonnes.
    fireEvent.click(screen.getByRole("button", { name: "Back to the workflow" }))
    expect(fresh.props.onClose).toHaveBeenCalled()
  })

  it("Activity: the five steps of its mission, or the activity of the issue", async () => {
    const model = buildWorkflow({
      statuses: STATUSES, issues: [issue(1, { status: DOING }), issue(2)], relations: [], documents: {}, me: ME, today: "2026-11-13",
      runs: [projectRun(deliveryRun(1, 1))],
    })
    const mission = setup(model, "issue-1")
    await userEvent.click(screen.getByRole("tab", { name: "Activity" }))
    expect(mission.props.onTab).toHaveBeenCalledWith("activity")
    mission.unmount()

    useIssueStore.setState({ issueActivity: { 2: [{ id: 1, actor: { id: 7, email: "pierre@acme.dev", displayName: "Pierre", avatarUrl: null }, action: "CREATED", oldValue: null, newValue: null, createdAt: "2026-11-13T10:00:00" }] } as never })
    const node = model.byKey.get("issue-2")
    if (!node) throw new Error("no node")
    render(
      <Inspector slug="acme" projectId={3} node={node} model={model} stages={STATUSES} agents={[]} agent={null} me={ME} tab="activity"
        mode="full" width={360} gestures={{ move: vi.fn(), stop: vi.fn(), retry: vi.fn(), handTo: vi.fn(), ask: vi.fn() }} menuOpen={false}
        now={now} onTab={vi.fn()} onResize={vi.fn()} onClose={vi.fn()} onSelect={vi.fn()} onOpen={vi.fn()} onOpenMission={vi.fn()} onMenuOpen={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByText("Pierre")).toBeInTheDocument())
    expect(screen.getByText("created")).toBeInTheDocument()
  })

  it("Evidence: the rule and its version, the requests, the files, the tests and the proof", async () => {
    useDeliveryStore.setState({
      evidence: { 1: { format: "taskforce-evidence/1", events: [{ seq: 1 }, { seq: 2 }] as never, root: "x" } },
      missionChanges: { 1: { mode: "repo", live: false, added: 12, removed: 1, more: 0, canRevert: false, canComment: false, canCorrect: false, blockedReason: null, correction: null,
        files: [{ path: "src/export.ts", status: "modified", added: 12, removed: 1, binary: false, truncated: false, withheld: false, revision: "r", reverting: false, error: null, updatedAt: null }] } },
    })
    const model = buildWorkflow({
      statuses: STATUSES, issues: [issue(1, { status: DOING })], relations: [], documents: {}, me: ME, today: "2026-11-13",
      runs: [projectRun(deliveryRun(1, 1, { status: "DONE", rulesVersion: 12, tests: { command: "npm test", ran: true, passed: true, passedCount: 12, total: 12 } }), [approval(3, { reason: "Pushes need a look" })])],
    })
    const node = model.byKey.get("issue-1")
    if (!node) throw new Error("no node")
    const onOpenMission = vi.fn()
    render(
      <Inspector slug="acme" projectId={3} node={node} model={model} stages={STATUSES} agents={[]} agent={null} me={ME} tab="evidence"
        mode="side" width={360} gestures={{ move: vi.fn(), stop: vi.fn(), retry: vi.fn(), handTo: vi.fn(), ask: vi.fn() }} menuOpen={false}
        now={now} onTab={vi.fn()} onResize={vi.fn()} onClose={vi.fn()} onSelect={vi.fn()} onOpen={vi.fn()} onOpenMission={onOpenMission} onMenuOpen={vi.fn()} />,
    )
    expect(screen.getByText("Pushes need a look")).toBeInTheDocument()
    expect(screen.getByText("Rules version 12")).toBeInTheDocument()
    expect(screen.getByText("Tests passed: 12 of 12")).toBeInTheDocument()
    expect(screen.getByText("Proof: 2 events, sealed")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /export\.ts/ }))
    expect(onOpenMission).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole("button", { name: "Download the record" }))
    await waitFor(() => expect(useDeliveryStore.getState().downloadEvidence).toHaveBeenCalledWith("acme", 1, "json"))
  })

  it("a mission named in the address shows itself, even an earlier one, and says so", () => {
    const older = projectRun(deliveryRun(1, 1, { status: "FAILED", error: "Tests failed", createdAt: "2026-11-10T09:00:00" }))
    const model = buildWorkflow({
      statuses: STATUSES, issues: [issue(1, { status: DOING })], relations: [], documents: {}, me: ME, today: "2026-11-13",
      runs: [older, projectRun(deliveryRun(2, 1, { createdAt: "2026-11-12T09:00:00" }))],
    })
    const node = model.byKey.get("issue-1")
    if (!node) throw new Error("no node")
    render(
      <Inspector slug="acme" projectId={3} node={node} model={model} stages={STATUSES} agents={[]} agent={null} me={ME} tab="evidence"
        mode="side" width={360} gestures={{ move: vi.fn(), stop: vi.fn(), retry: vi.fn(), handTo: vi.fn(), ask: vi.fn() }} menuOpen={false}
        now={now} onTab={vi.fn()} onResize={vi.fn()} onClose={vi.fn()} onSelect={vi.fn()} onOpen={vi.fn()} onOpenMission={vi.fn()} onMenuOpen={vi.fn()}
        focusRun={older} />,
    )
    expect(screen.getByText(/^An earlier mission of this issue, started /)).toBeInTheDocument()
    expect(useDeliveryStore.getState().fetchEvidence).toHaveBeenCalledWith("acme", 1)
  })

  it("Evidence: each signature says its own time, not the time of the last one", () => {
    const signed = approval(3, {
      status: "ALLOWED", signatures: 2, signedBy: ["Sam", "Ada"], signedAt: ["2026-11-11T09:00:00", "2026-11-13T07:30:00"],
      decidedAt: "2026-11-13T07:30:00",
    })
    const model = buildWorkflow({
      statuses: STATUSES, issues: [issue(1, { status: DOING })], relations: [], documents: {}, me: ME, today: "2026-11-13",
      runs: [projectRun(deliveryRun(1, 1, { status: "DONE" }), [signed])],
    })
    const node = model.byKey.get("issue-1")
    if (!node) throw new Error("no node")
    render(
      <Inspector slug="acme" projectId={3} node={node} model={model} stages={STATUSES} agents={[]} agent={null} me={ME} tab="evidence"
        mode="side" width={360} gestures={{ move: vi.fn(), stop: vi.fn(), retry: vi.fn(), handTo: vi.fn(), ask: vi.fn() }} menuOpen={false}
        now={now} onTab={vi.fn()} onResize={vi.fn()} onClose={vi.fn()} onSelect={vi.fn()} onOpen={vi.fn()} onOpenMission={vi.fn()} onMenuOpen={vi.fn()} />,
    )
    expect(screen.getByText(/^Sam, (on )?11 Nov.*\. Meaning: Approval\.$/)).toBeInTheDocument()
    expect(screen.getByText(/^Ada, today at \d\d:30\. Meaning: Approval\.$/)).toBeInTheDocument()
  })

  it("its links take the blue ink that reads in light and dark (AA), never the brand blue", () => {
    const model = buildWorkflow({
      statuses: STATUSES, issues: [issue(1, { status: DOING })], relations: [], documents: {}, me: ME, today: "2026-11-13",
      runs: [{
        ...projectRun(deliveryRun(1, 1, { status: "DONE" })),
        links: { branch: "feat/x", pullRequestUrl: "https://github.com/acme/web/pull/87", followUpOf: null, followedUpBy: null },
      }],
    })
    const node = model.byKey.get("issue-1")
    if (!node) throw new Error("no node")
    const { unmount } = render(
      <Inspector slug="acme" projectId={3} node={node} model={model} stages={STATUSES} agents={[]} agent={null} me={ME} tab="evidence"
        mode="side" width={360} gestures={{ move: vi.fn(), stop: vi.fn(), retry: vi.fn(), handTo: vi.fn(), ask: vi.fn() }} menuOpen={false}
        now={now} onTab={vi.fn()} onResize={vi.fn()} onClose={vi.fn()} onSelect={vi.fn()} onOpen={vi.fn()} onOpenMission={vi.fn()} onMenuOpen={vi.fn()} />,
    )
    const link = document.querySelector<HTMLAnchorElement>("a[href='https://github.com/acme/web/pull/87']")
    expect(link?.className).toContain("text-ink-blue")
    expect(link?.className).not.toContain("text-primary")
    unmount()
  })

  it("Evidence of an issue without a mission says the record starts with one", () => {
    const model = buildWorkflow({ statuses: STATUSES, issues: [issue(1)], relations: [], documents: {}, me: ME, today: "2026-11-13", runs: [] })
    const node = model.byKey.get("issue-1")
    if (!node) throw new Error("no node")
    render(
      <Inspector slug="acme" projectId={3} node={node} model={model} stages={STATUSES} agents={[]} agent={null} me={ME} tab="evidence"
        mode="side" width={360} gestures={{ move: vi.fn(), stop: vi.fn(), retry: vi.fn(), handTo: vi.fn(), ask: vi.fn() }} menuOpen={false}
        now={now} onTab={vi.fn()} onResize={vi.fn()} onClose={vi.fn()} onSelect={vi.fn()} onOpen={vi.fn()} onOpenMission={vi.fn()} onMenuOpen={vi.fn()} />,
    )
    expect(screen.getByText("No mission yet: the record starts when an agent works on it.")).toBeInTheDocument()
  })
})
