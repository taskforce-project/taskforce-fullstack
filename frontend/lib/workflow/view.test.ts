import { describe, expect, it } from "vitest"

import { fillText } from "@/lib/delivery/result-card"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { buildWorkflow, type WorkflowModel } from "@/lib/workflow/model"
import {
  CHILDREN_SHOWN, columnRows, dependenciesOf, DONE_SHOWN, isException, MAX_EDGES, MORE_AFTER, neighborNode, nextAttention,
  relatedKeys, stageCountLine, stepNode, visibleOrder, type ColumnOptions,
} from "@/lib/workflow/view"
import { COLUMN_WIDTH, DENSITIES, isDensity, isFilter, STATE_RANK, TERMINAL, WORKFLOW_STATES } from "@/lib/workflow/states"
import {
  approval, deliveryRun, DOING, DONE, issue, ME, projectRun, relation, STATUSES, TODO,
} from "@/lib/workflow/__tests__/fixtures"

const base = { statuses: STATUSES, runs: [], relations: [], documents: {}, me: ME, today: "2026-11-13" }
const options: ColumnOptions = { density: "plan", filter: null, showDone: false, showAll: false, openParents: new Set(), selectedKey: null }

const keysOf = (rows: ReturnType<typeof columnRows>) => rows.map((row) => (row.type === "node" ? row.key : `${row.type}:${row.hidden}`))

/** Ce qu'une colonne montre (séance n°25, §3, §4.2, §10), et le clavier qui s'y déplace. */
describe("les lignes d'une colonne", () => {
  it("au-delà de cinq cartes faites, « Show {count} done » ; le nœud choisi ne se replie jamais", () => {
    const model = buildWorkflow({ ...base, issues: Array.from({ length: 8 }, (_, i) => issue(i + 1, { status: DONE })) })
    const done = model.stages[2]
    const rows = columnRows(done, options)
    expect(keysOf(rows)).toEqual(["issue-1", "issue-2", "issue-3", "issue-4", "issue-5", "done:3"])
    expect(rows.filter((row) => row.type === "node")).toHaveLength(DONE_SHOWN)
    expect(rows.at(-1)).toMatchObject({ type: "done", hidden: 3 })
    expect(columnRows(done, { ...options, showDone: true }).filter((row) => row.type === "node")).toHaveLength(8)
    const last = done.nodes.at(-1)?.key ?? ""
    expect(columnRows(done, { ...options, selectedKey: last }).some((row) => row.key === last)).toBe(true)
  })

  it("au-delà de cinquante cartes, « Show {count} more »", () => {
    const model = buildWorkflow({ ...base, issues: Array.from({ length: MORE_AFTER + 7 }, (_, i) => issue(i + 1)) })
    const rows = columnRows(model.stages[0], options)
    expect(rows.filter((row) => row.type === "node")).toHaveLength(MORE_AFTER)
    expect(rows.at(-1)).toMatchObject({ type: "more", hidden: 7 })
    expect(columnRows(model.stages[0], { ...options, showAll: true })).toHaveLength(MORE_AFTER + 7)
  })

  it("trois sous-issues sous leur parent, les autres repliées ; un parent ouvert les montre toutes", () => {
    const parentRef = { id: 1, sequenceNumber: 1, identifier: "WEB-1", title: "Issue 1", status: TODO }
    const issues = [issue(1), ...Array.from({ length: 5 }, (_, i) => issue(i + 2, { parent: parentRef }))]
    const stage = buildWorkflow({ ...base, issues }).stages[0]
    const rows = columnRows(stage, options)
    expect(rows.filter((row) => row.type === "node")).toHaveLength(1 + CHILDREN_SHOWN)
    expect(rows.at(-1)).toMatchObject({ type: "children", parentKey: "issue-1", hidden: 2 })
    expect(columnRows(stage, { ...options, openParents: new Set(["issue-1"]) }).filter((row) => row.type === "node")).toHaveLength(6)
    // Le nœud choisi parmi les replis ouvre son parent.
    const hidden = stage.nodes.at(-1)?.key ?? ""
    expect(columnRows(stage, { ...options, selectedKey: hidden }).some((row) => row.key === hidden)).toBe(true)
  })

  it("en Summary, seules les exceptions gardent une carte : Needs you, Failed, Missing, Blocked, et ce qui a passé sa date", () => {
    const a = issue(1)
    const b = issue(2)
    const model = buildWorkflow({
      ...base,
      issues: [a, b, issue(3, { dueDate: "2026-11-01" }), issue(4, { status: DOING }), issue(5, { status: DOING })],
      relations: [relation(1, a, b)],
      runs: [projectRun(deliveryRun(1, 4), [approval(1)]), projectRun(deliveryRun(2, 5, { status: "FAILED", error: "x" }))],
    })
    expect(keysOf(columnRows(model.stages[0], { ...options, density: "summary" }))).toEqual(["issue-2", "issue-3"])
    expect(keysOf(columnRows(model.stages[1], { ...options, density: "summary" }))).toEqual(["issue-4", "issue-5"])
    expect(isException(model.byKey.get("issue-1") as never)).toBe(false)
  })

  it("un filtre ne garde que son état, à plat", () => {
    const model = buildWorkflow({
      ...base,
      issues: [issue(4, { status: DOING }), issue(5, { status: DOING })],
      runs: [projectRun(deliveryRun(1, 4), [approval(1)])],
    })
    expect(keysOf(columnRows(model.stages[1], { ...options, filter: "needs-you" }))).toEqual(["issue-4"])
    expect(columnRows(model.stages[1], { ...options, filter: "failed" })).toEqual([])
  })
})

describe("le clavier", () => {
  const model = buildWorkflow({
    ...base,
    issues: [issue(1), issue(2), issue(3, { status: DOING }), issue(4, { status: DONE }), issue(5, { status: DOING })],
    runs: [projectRun(deliveryRun(1, 5), [approval(1)]), projectRun(deliveryRun(2, 2, { status: "FAILED", error: "x" }))],
  })
  const columns = model.stages.map((stage) => columnRows(stage, options))
  const order = visibleOrder(columns)

  it("j et k vont d'un nœud au suivant, colonne par colonne", () => {
    expect(order).toEqual(["issue-2", "issue-1", "issue-5", "issue-3", "issue-4"])
    expect(stepNode(order, null, 1)).toBe("issue-2")
    expect(stepNode(order, null, -1)).toBe("issue-4")
    expect(stepNode(order, "issue-1", 1)).toBe("issue-5")
    expect(stepNode(order, "issue-4", 1)).toBe("issue-4")
    expect(stepNode([], null, 1)).toBeNull()
  })

  it("← et → vont à la colonne voisine, à la même hauteur, en sautant les colonnes vides", () => {
    expect(neighborNode(columns, "issue-1", 1)).toBe("issue-3")
    expect(neighborNode(columns, "issue-3", 1)).toBe("issue-4")
    expect(neighborNode(columns, "issue-4", 1)).toBeNull()
    expect(neighborNode(columns, "issue-4", -1)).toBe("issue-5")
    expect(neighborNode(columns, null, 1)).toBe("issue-2")
  })

  it("f mène au prochain nœud qui demande l'attention : Needs you, puis Failed, en boucle", () => {
    expect(nextAttention(model, null)).toBe("issue-5")
    expect(nextAttention(model, "issue-5")).toBe("issue-2")
    expect(nextAttention(model, "issue-2")).toBe("issue-5")
    const calm = buildWorkflow({ ...base, issues: [issue(1)] })
    expect(nextAttention(calm, null)).toBeNull()
  })
})

describe("les dépendances du nœud choisi", () => {
  it("seulement les siennes, cinquante au plus, le reste en nombre", () => {
    const hub = issue(1)
    const others = Array.from({ length: 60 }, (_, i) => issue(i + 2))
    const model: WorkflowModel = buildWorkflow({
      ...base, issues: [hub, ...others],
      relations: [...others.slice(0, 30).map((o, i) => relation(i + 1, o, hub)), ...others.slice(30).map((o, i) => relation(i + 100, hub, o))],
    })
    const node = model.byKey.get("issue-1") ?? null
    const { edges, more } = dependenciesOf(node)
    expect(edges).toHaveLength(MAX_EDGES)
    expect(more).toBe(10)
    expect(edges[0]).toEqual({ from: "issue-2", to: "issue-1", side: "blockedBy" })
    expect(edges.at(-1)?.side).toBe("blocks")
    expect(relatedKeys(node).size).toBe(61)
    expect(dependenciesOf(null)).toEqual({ edges: [], more: 0 })
    expect(relatedKeys(null).size).toBe(0)
  })

  it("le compte d'une colonne en Summary, des exceptions au reste", () => {
    const model = buildWorkflow({
      ...base,
      issues: [issue(4, { status: DOING }), issue(5, { status: DOING }), issue(6, { status: DOING })],
      runs: [projectRun(deliveryRun(1, 4), [approval(1)])],
    })
    expect(stageCountLine(model.stages[1], CONSTANTS_EN.workflow.countOf, fillText)).toBe("1 needs you · 2 working")
  })
})

describe("les états, les densités et les filtres", () => {
  it("dix états, dans l'ordre du tri ; Skipped et Stopped avec Done", () => {
    expect(WORKFLOW_STATES).toHaveLength(10)
    expect(WORKFLOW_STATES.map((state) => STATE_RANK[state])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 9])
    expect([...TERMINAL]).toEqual(["done", "skipped", "stopped"])
  })

  it("ce que l'adresse peut dire", () => {
    expect(DENSITIES).toEqual(["summary", "plan", "detail"])
    expect(isDensity("detail")).toBe(true)
    expect(isDensity("big")).toBe(false)
    expect(isFilter("needs-you")).toBe(true)
    expect(isFilter(null)).toBe(false)
    expect(COLUMN_WIDTH).toEqual({ summary: 160, plan: 264, detail: 304 })
  })
})
