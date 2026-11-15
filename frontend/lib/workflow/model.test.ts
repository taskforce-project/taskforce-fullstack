import { describe, expect, it } from "vitest"

import { buildWorkflow, issueKey, nextStage, resolveNode, todayKey } from "@/lib/workflow/model"
import {
  approval, bigProject, DOING, DONE, deliveryRun, issue, ME, projectRun, relation, STATUSES, TODO,
} from "@/lib/workflow/__tests__/fixtures"

const base = { statuses: STATUSES, runs: [], relations: [], documents: {}, me: ME, today: "2026-11-13" }

/** La carte du projet (séance n°25, W1) : les colonnes comme étapes, les issues comme nœuds, en une passe. */
describe("la carte d'un projet", () => {
  it("une colonne par étape, dans l'ordre du tableau ; chaque issue dans la sienne", () => {
    const model = buildWorkflow({ ...base, statuses: [DONE, TODO, DOING], issues: [issue(1), issue(2, { status: DOING }), issue(3, { status: DONE })] })
    expect(model.stages.map((stage) => stage.status.name)).toEqual(["Todo", "In Progress", "Done"])
    expect(model.stages.map((stage) => stage.nodes.map((node) => node.key))).toEqual([["issue-1"], ["issue-2"], ["issue-3"]])
  })

  it("la dernière mission de chaque issue, et si elle relance une mission d'avant", () => {
    const older = projectRun(deliveryRun(1, 11, { status: "FAILED", outcome: "RETRIED", createdAt: "2026-11-10T10:00:00" }))
    const latest = projectRun(deliveryRun(2, 11, { status: "RUNNING", createdAt: "2026-11-12T10:00:00" }))
    const model = buildWorkflow({ ...base, issues: [issue(11)], runs: [older, latest] })
    const node = model.byKey.get("issue-11")
    expect(node?.run?.run.id).toBe(2)
    expect(node?.reason).toEqual({ kind: "mission", retried: true })
    expect(model.runKeys.get(2)).toBe("issue-11")
  })

  it("les liens qui bloquent, posés dans un sens ou dans l'autre, une fois chacun ; seuls les liens pas finis bloquent", () => {
    const a = issue(1)
    const b = issue(2)
    const finished = issue(3, { status: DONE })
    const model = buildWorkflow({
      ...base,
      issues: [a, b, finished],
      relations: [relation(1, a, b, "BLOCKS"), relation(2, b, a, "BLOCKED_BY"), relation(3, finished, b, "BLOCKS"), relation(4, a, b, "RELATES_TO")],
    })
    const blocked = model.byKey.get("issue-2")
    expect(blocked?.blockedBy.map((other) => other.id)).toEqual([1, 3])
    expect(blocked?.state).toBe("blocked")
    expect(blocked?.reason).toMatchObject({ kind: "blocked", blockers: [{ id: 1 }] })
    expect(model.byKey.get("issue-1")?.blocks.map((other) => other.id)).toEqual([2])
    expect(model.counts.blocked).toBe(1)
  })

  it("le statut d'une issue liée se lit dans la liste, plus récente que le lien", () => {
    const a = issue(1)
    const b = issue(2)
    const link = relation(1, a, b, "BLOCKS")
    // Le lien a été lu quand A n'était pas finie ; A l'est maintenant.
    const model = buildWorkflow({ ...base, issues: [{ ...a, status: DONE }, b], relations: [link] })
    expect(model.byKey.get("issue-2")?.state).toBe("notStarted")
  })

  it("dans une colonne : Needs you en tête, puis l'ordre des états, puis l'ordre du tableau", () => {
    const issues = [
      issue(1, { status: DOING, position: 1 }),
      issue(2, { status: DOING, position: 2 }),
      issue(3, { status: DOING, position: 3 }),
      issue(4, { status: DOING, position: 4, pinned: true }),
    ]
    const runs = [
      projectRun(deliveryRun(1, 3), [approval(1, { canDecide: true })]),
      projectRun(deliveryRun(2, 2, { status: "FAILED", error: "Boom" })),
    ]
    const model = buildWorkflow({ ...base, issues, runs })
    const doing = model.stages.find((stage) => stage.status.id === DOING.id)
    expect(doing?.nodes.map((node) => [node.key, node.state])).toEqual([
      ["issue-3", "needsYou"], ["issue-2", "failed"], ["issue-4", "working"], ["issue-1", "working"],
    ])
    expect(doing?.counts).toEqual({ needsYou: 1, failed: 1, working: 2 })
    expect(model.counts).toEqual({ needsYou: 1, blocked: 0, missing: 0, failed: 1 })
  })

  it("une sous-issue se range sous son parent dans la même colonne ; ailleurs, elle se range seule", () => {
    const parent = issue(1)
    const child = issue(2, { parent: { id: 1, sequenceNumber: 1, identifier: "WEB-1", title: "Issue 1", status: TODO } })
    const elsewhere = issue(3, { status: DOING, parent: { id: 1, sequenceNumber: 1, identifier: "WEB-1", title: "Issue 1", status: TODO } })
    const orphan = issue(4, { parent: { id: 99, sequenceNumber: 99, identifier: "WEB-99", title: "Not read", status: TODO } })
    const model = buildWorkflow({ ...base, issues: [child, orphan, parent, elsewhere] })
    const todo = model.stages[0].nodes
    expect(todo.map((node) => [node.key, node.depth])).toEqual([["issue-1", 0], ["issue-2", 1], ["issue-4", 0]])
    expect(todo[1].parentKey).toBe("issue-1")
    expect(model.byKey.get("issue-3")?.depth).toBe(0)
  })

  it("le groupe d'un parent remonte avec le meilleur état de ses sous-issues", () => {
    const parent = issue(1)
    const child = issue(2, { parent: { id: 1, sequenceNumber: 1, identifier: "WEB-1", title: "Issue 1", status: TODO } })
    const other = issue(3)
    const runs = [projectRun(deliveryRun(1, 2), [approval(1)])]
    const model = buildWorkflow({ ...base, issues: [other, parent, child], runs })
    expect(model.stages[0].nodes.map((node) => node.key)).toEqual(["issue-1", "issue-2", "issue-3"])
  })

  it("ce qui est fait sur le total, sans les issues annulées ni archivées ; les documents ; ce qui a passé sa date", () => {
    const model = buildWorkflow({
      ...base,
      issues: [
        issue(1, { status: DONE }),
        issue(2),
        issue(3, { status: STATUSES[3] }),
        issue(4, { archived: true }),
        issue(5, { dueDate: "2026-11-12" }),
        issue(6, { dueDate: "2026-11-01", status: DONE }),
      ],
      documents: { 2: 3 },
    })
    expect(model.done).toBe(2)
    expect(model.total).toBe(4)
    expect(model.byKey.has("issue-4")).toBe(false)
    expect(model.byKey.get("issue-2")?.documents).toBe(3)
    expect(model.byKey.get("issue-5")?.overdue).toBe(true)
    expect(model.byKey.get("issue-6")?.overdue).toBe(false)
  })

  it("une clé de l'adresse désigne une issue, sa mission ou sa demande", () => {
    const runs = [projectRun(deliveryRun(8, 11), [approval(21)])]
    const model = buildWorkflow({ ...base, issues: [issue(11)], runs })
    expect(resolveNode(model, "issue-11")?.key).toBe("issue-11")
    expect(resolveNode(model, "run-8")?.key).toBe("issue-11")
    expect(resolveNode(model, "approval-21")?.key).toBe("issue-11")
    expect(resolveNode(model, "run-9")).toBeNull()
    expect(resolveNode(model, "nonsense")).toBeNull()
    expect(resolveNode(model, null)).toBeNull()
  })

  it("la colonne qui suit, et rien après la dernière", () => {
    const model = buildWorkflow({ ...base, issues: [] })
    expect(nextStage(model, TODO.id)?.name).toBe("In Progress")
    expect(nextStage(model, STATUSES[3].id)).toBeNull()
    expect(nextStage(model, 999)).toBeNull()
  })

  it("aujourd'hui, à l'heure de la personne", () => {
    expect(todayKey(new Date(2026, 10, 3, 23, 30))).toBe("2026-11-03")
    expect(issueKey(4)).toBe("issue-4")
  })

  it("2 000 issues, 300 missions et 3 000 liens se calculent en une passe", () => {
    const big = bigProject(2000, 300, 3000)
    const started = performance.now()
    const model = buildWorkflow({ ...base, issues: big.issues, runs: big.runs, relations: big.relations })
    const elapsed = performance.now() - started
    expect(model.byKey.size).toBe(2000)
    expect(model.stages.reduce((sum, stage) => sum + stage.nodes.length, 0)).toBe(2000)
    // Une borne large (une machine de CI chargée) : la mesure réelle est dans le rapport du lot.
    expect(elapsed).toBeLessThan(1000)
  })
})
