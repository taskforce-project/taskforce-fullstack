import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { StateMark } from "./state-mark"
import { SummaryNodeCard, WorkflowNodeCard, type NodeView } from "./workflow-node"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { buildWorkflow } from "@/lib/workflow/model"
import { approval, deliveryRun, DOING, issue, ME, projectRun, STATUSES } from "@/lib/workflow/__tests__/fixtures"

const t = CONSTANTS_EN.workflow

function viewOf(patch: Partial<NodeView> = {}): NodeView {
  const model = buildWorkflow({
    statuses: STATUSES, relations: [], documents: { 1: 2 }, me: ME, today: "2026-11-13",
    issues: [issue(1, { title: "Ship the export", status: DOING, assignee: { id: 9, email: "alex@acme.dev", displayName: "Alex Chen", avatarUrl: null } as never })],
    runs: [projectRun(deliveryRun(1, 1), [approval(4, { rule: "deploy", reason: "Deploys need a look", signatures: 2, signedBy: ["Sam"] })])],
  })
  const node = model.byKey.get("issue-1")
  if (!node) throw new Error("no node")
  return {
    node,
    sentence: "Waiting for your approval: build the project.",
    governance: { rules: 1, ruleReasons: ["Deploys need a look"], signed: { signed: 1, needed: 2 }, documents: 2 },
    action: "decide",
    agent: { name: "Claude Code", logoKey: null, model: null },
    detail: "Claude Code · feat/export · tests 12/12",
    who: "You",
    ...patch,
  }
}

const handlers = () => ({ onSelect: vi.fn(), onOpen: vi.fn(), onAction: vi.fn() })

/** La carte d'un nœud (séance n°25, §4.1) : la marque et son mot, jamais la couleur seule ; un seul bouton. */
describe("WorkflowNodeCard", () => {
  it("names itself by its title and state, is described by its sentence, and shows who answers and who does it", () => {
    render(<WorkflowNodeCard view={viewOf()} density="plan" selected={false} focusable dimmed={false} t={t} handlers={handlers()} />)
    const card = screen.getByRole("button", { name: "Ship the export, Needs you" })
    expect(card).toHaveAttribute("tabindex", "0")
    expect(card).toHaveAccessibleDescription("Waiting for your approval: build the project.")
    expect(screen.getByRole("img", { name: "Needs you" })).toBeInTheDocument()
    expect(screen.getByText("WEB-1")).toBeInTheDocument()
    expect(screen.getByText("Alex")).toBeInTheDocument()
    expect(screen.getByText("Claude Code")).toBeInTheDocument()
    expect(screen.getByText("1 rule")).toHaveAttribute("title", "Deploys need a look")
    expect(screen.getByText("1 of 2 signed")).toBeInTheDocument()
    expect(screen.getByText("2 documents")).toBeInTheDocument()
    // La ligne de l'ingénieur n'est qu'en Detail.
    expect(screen.queryByText(/feat\/export/)).toBeNull()
  })

  it("a click chooses it; Enter, a double click and its title open it; its one button acts", () => {
    const on = handlers()
    render(<WorkflowNodeCard view={viewOf()} density="detail" selected focusable={false} dimmed t={t} handlers={on} />)
    const card = screen.getByRole("button", { name: "Ship the export, Needs you" })
    expect(card).toHaveAttribute("aria-pressed", "true")
    expect(card).toHaveAttribute("tabindex", "-1")
    expect(screen.getByText("Claude Code · feat/export · tests 12/12")).toBeInTheDocument()

    fireEvent.click(card)
    expect(on.onSelect).toHaveBeenCalledWith("issue-1")
    fireEvent.keyDown(card, { key: "Enter" })
    fireEvent.doubleClick(card)
    fireEvent.click(screen.getByRole("button", { name: "Ship the export" }))
    expect(on.onOpen).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByRole("button", { name: "Decide" }))
    expect(on.onAction).toHaveBeenCalledWith("issue-1", "decide")
    expect(on.onSelect).toHaveBeenCalledTimes(1)
  })

  it("says nothing more than it knows: no foot, no second line, no button", () => {
    const view = viewOf({ sentence: null, governance: { rules: 0, ruleReasons: [], signed: null, documents: 0 }, action: null, agent: null })
    const bare = { ...view, node: { ...view.node, issue: { ...view.node.issue, assignee: null } } }
    render(<WorkflowNodeCard view={bare} density="plan" selected={false} focusable dimmed={false} t={t} handlers={handlers()} />)
    expect(screen.getAllByRole("button")).toHaveLength(2)
    expect(screen.queryByText(/rule/)).toBeNull()
  })

  it("« See why » for a failure is a quieter button", () => {
    render(<WorkflowNodeCard view={viewOf({ action: "seeWhy" })} density="plan" selected={false} focusable dimmed={false} t={t} handlers={handlers()} stretch />)
    expect(screen.getByRole("button", { name: "See why" }).className).toContain("border")
  })
})

describe("SummaryNodeCard", () => {
  it("one line: the mark, the title and who must act", () => {
    const on = handlers()
    render(<SummaryNodeCard view={viewOf()} selected={false} focusable dimmed={false} t={t} handlers={on} />)
    const card = screen.getByRole("button", { name: "Ship the export, Needs you, You" })
    fireEvent.click(card)
    expect(on.onSelect).toHaveBeenCalledWith("issue-1")
    fireEvent.keyDown(card, { key: "Enter" })
    expect(on.onOpen).toHaveBeenCalledWith("issue-1")
  })

  it("says « Overdue » for what passed its date", () => {
    const view = viewOf()
    const late = { ...view, node: { ...view.node, state: "notStarted" as const, overdue: true } }
    render(<SummaryNodeCard view={late} selected={false} focusable dimmed={false} t={t} handlers={handlers()} />)
    expect(screen.getByRole("button", { name: /^Ship the export, Overdue/ })).toBeInTheDocument()
  })
})

describe("StateMark", () => {
  it("each state has its mark and its word, written or on hover; Working alone turns", () => {
    const { rerender } = render(<StateMark state="working" word="Working" />)
    const mark = screen.getByRole("img", { name: "Working" })
    expect(mark).toHaveAttribute("title", "Working")
    expect(mark.querySelector("svg")?.getAttribute("class")).toContain("animate-spin")
    rerender(<StateMark state="done" word="Done" showWord />)
    expect(screen.getByText("Done")).toBeInTheDocument()
    expect(document.querySelector("svg")?.getAttribute("class")).not.toContain("animate-spin")
  })
})
