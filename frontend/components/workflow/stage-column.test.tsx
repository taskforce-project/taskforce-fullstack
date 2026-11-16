import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { StageColumn, estimateRow } from "./stage-column"
import type { NodeView } from "./workflow-node"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { buildWorkflow } from "@/lib/workflow/model"
import { columnRows } from "@/lib/workflow/view"
import { DONE, issue, ME, STATUSES, TODO } from "@/lib/workflow/__tests__/fixtures"

const t = CONSTANTS_EN.workflow
const handlers = { onSelect: vi.fn(), onOpen: vi.fn(), onAction: vi.fn() }

function setup(issues = Array.from({ length: 8 }, (_, i) => issue(i + 1, { status: DONE }))) {
  const model = buildWorkflow({ statuses: STATUSES, issues, runs: [], relations: [], documents: {}, me: ME, today: "2026-11-13" })
  const views = new Map<string, NodeView>([...model.byKey.values()].map((node) => [node.key, {
    node, sentence: null, governance: { rules: 0, ruleReasons: [], signed: null, documents: 0 }, action: null, agent: null, detail: null, who: "Nobody",
  }]))
  return { model, views }
}

/** Une étape du workflow (séance n°25, §3) : son nom, son nombre, ses cartes, ce qui reste replié. */
describe("StageColumn", () => {
  it("says its name and its count, and folds what is done beyond five", () => {
    const { model, views } = setup()
    const stage = model.stages.find((s) => s.status.id === DONE.id)
    if (!stage) throw new Error("no stage")
    const onShowDone = vi.fn()
    render(
      <StageColumn stage={stage} rows={columnRows(stage, { density: "plan", filter: null, showDone: false, showAll: false, openParents: new Set(), selectedKey: null })}
        density="plan" views={views} selectedKey={null} focusKey="issue-1" related={null} revealKey={null} t={t} handlers={handlers}
        onShowDone={onShowDone} onShowAll={vi.fn()} onOpenParent={vi.fn()} />,
    )
    expect(screen.getByRole("region", { name: "Done, 8 issues" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Done" })).toBeInTheDocument()
    expect(screen.getByText("8")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Show 3 done" }))
    expect(onShowDone).toHaveBeenCalledWith(DONE.id)
  })

  it("in Summary, a count line from the exceptions to the rest", () => {
    const { model, views } = setup([issue(1), issue(2)])
    const stage = model.stages.find((s) => s.status.id === TODO.id)
    if (!stage) throw new Error("no stage")
    render(
      <StageColumn stage={stage} rows={[]} density="summary" views={views} selectedKey={null} focusKey={null} related={null}
        revealKey={null} t={t} handlers={handlers} onShowDone={vi.fn()} onShowAll={vi.fn()} onOpenParent={vi.fn()} />,
    )
    expect(screen.getByText("2 not started")).toBeInTheDocument()
    // La colonne de Summary se partage la largeur libre, 160 px au moins (R161, H5).
    const section = document.querySelector<HTMLElement>("[data-stage]") as HTMLElement
    expect(section.style.flex).toBe("1 1 160px")
    expect(section.style.minWidth).toBe("160px")
  })

  it("on a narrow screen, a section of the list, every card at full width", () => {
    const { model, views } = setup([issue(1), issue(2)])
    const stage = model.stages.find((s) => s.status.id === TODO.id)
    if (!stage) throw new Error("no stage")
    const onShowAll = vi.fn()
    const onOpenParent = vi.fn()
    render(
      <StageColumn stage={stage} rows={[...columnRows(stage, { density: "plan", filter: null, showDone: false, showAll: false, openParents: new Set(), selectedKey: null }),
        { type: "more", key: "more", hidden: 4 }, { type: "children", key: "children-issue-1", parentKey: "issue-1", hidden: 2 }]}
        density="plan" views={views} selectedKey="issue-2" focusKey="issue-2" related={new Set(["issue-2"])} revealKey={null} t={t}
        handlers={handlers} onShowDone={vi.fn()} onShowAll={onShowAll} onOpenParent={onOpenParent} stacked />,
    )
    expect(screen.getAllByRole("listitem")).toHaveLength(4)
    fireEvent.click(screen.getByRole("button", { name: "Show 4 more" }))
    expect(onShowAll).toHaveBeenCalledWith(TODO.id)
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more sub-issues" }))
    expect(onOpenParent).toHaveBeenCalledWith("issue-1")
  })

  it("supposes a height for each row before it is measured", () => {
    const { model } = setup([issue(1)])
    const node = model.byKey.get("issue-1")
    if (!node) throw new Error("no node")
    const row = { type: "node" as const, key: node.key, node }
    expect([estimateRow(row, "summary"), estimateRow(row, "plan"), estimateRow(row, "detail")]).toEqual([48, 92, 112])
    expect(estimateRow({ type: "done", key: "done", hidden: 2 }, "plan")).toBe(28)
  })
})
