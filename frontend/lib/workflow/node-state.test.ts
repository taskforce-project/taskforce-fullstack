import { describe, expect, it } from "vitest"

import { isFinished, nodeStateOf, pendingOf } from "@/lib/workflow/node-state"
import { approval, deliveryRun, ME, projectRun } from "@/lib/workflow/__tests__/fixtures"

const blocker = { id: 9, sequenceNumber: 9, identifier: "WEB-9", title: "Ship the API", status: { id: 1, name: "Todo", category: "UNSTARTED" as const, color: "", position: 1 } }

/** D'où vient l'état d'un nœud (séance n°25, §4.5) : cas par cas, le premier qui s'applique l'emporte. */
describe("l'état d'un nœud", () => {
  it("Needs you : une demande que la personne peut décider, avant tout le reste", () => {
    const run = projectRun(deliveryRun(1, 11), [approval(5, { canDecide: false }), approval(6, { canDecide: true })])
    const state = nodeStateOf({ category: "STARTED", run, blockers: [blocker], me: ME })
    expect(state.state).toBe("needsYou")
    expect(state.reason).toEqual({ kind: "approval", approval: run.approvals[1] })
  })

  it("Needs you : un résultat prêt pour la revue de la personne qui a délégué, même dans une colonne finie", () => {
    const run = projectRun(deliveryRun(1, 11, { status: "DONE" }))
    expect(nodeStateOf({ category: "COMPLETED", run, blockers: [], me: ME })).toEqual({ state: "needsYou", reason: { kind: "review" } })
  })

  it("Waiting : le même résultat, pour une autre personne", () => {
    const run = projectRun(deliveryRun(1, 11, { status: "DONE" }))
    expect(nodeStateOf({ category: "STARTED", run, blockers: [], me: "8" }).reason).toEqual({ kind: "reviewOther" })
  })

  it("une mission en cours n'est jamais finie : bloquée, en attente d'une autre personne, en file, ou au travail", () => {
    const running = deliveryRun(1, 11, { status: "RUNNING" })
    expect(nodeStateOf({ category: "COMPLETED", run: projectRun(running), blockers: [blocker], me: ME }).state).toBe("blocked")
    const waiting = nodeStateOf({ category: "COMPLETED", run: projectRun(running, [approval(5, { canDecide: false })]), blockers: [], me: ME })
    expect(waiting.state).toBe("waiting")
    expect(waiting.reason.kind).toBe("waitingApproval")
    const queued = nodeStateOf({ category: "COMPLETED", run: projectRun(deliveryRun(1, 11, { status: "QUEUED" })), blockers: [], me: ME })
    expect(queued).toEqual({ state: "waiting", reason: { kind: "queued" } })
    expect(nodeStateOf({ category: "COMPLETED", run: projectRun(running), blockers: [], me: ME }))
      .toEqual({ state: "working", reason: { kind: "mission", retried: false } })
  })

  it("une mission relancée reste au travail, et le dit, jamais au vert d'avance", () => {
    const retry = projectRun(deliveryRun(2, 11, { status: "RUNNING" }))
    expect(nodeStateOf({ category: "COMPLETED", run: retry, retried: true, blockers: [], me: ME }))
      .toEqual({ state: "working", reason: { kind: "mission", retried: true } })
  })

  it("Done et Skipped viennent de la colonne", () => {
    expect(nodeStateOf({ category: "COMPLETED", run: null, blockers: [], me: ME }).state).toBe("done")
    expect(nodeStateOf({ category: "CANCELLED", run: null, blockers: [blocker], me: ME }).state).toBe("skipped")
    // Une issue terminée à la main garde son vert, même si sa dernière mission avait échoué.
    const failed = projectRun(deliveryRun(1, 11, { status: "FAILED", error: "Tests failed" }))
    expect(nodeStateOf({ category: "COMPLETED", run: failed, blockers: [], me: ME }).state).toBe("done")
  })

  it("Failed : la dernière mission a échoué, avec sa cause ; ni refusée au départ, ni arrêtée, ni relancée", () => {
    const failed = projectRun(deliveryRun(1, 11, { status: "FAILED", error: "  The tests failed.  " }))
    expect(nodeStateOf({ category: "STARTED", run: failed, blockers: [], me: ME }))
      .toEqual({ state: "failed", reason: { kind: "failed", cause: "The tests failed." } })
    const noCause = projectRun(deliveryRun(1, 11, { status: "FAILED", error: null }))
    expect(nodeStateOf({ category: "STARTED", run: noCause, blockers: [], me: ME }).reason).toEqual({ kind: "failed", cause: null })
    const retried = projectRun(deliveryRun(1, 11, { status: "FAILED", outcome: "RETRIED" }))
    expect(nodeStateOf({ category: "UNSTARTED", run: retried, blockers: [], me: ME }).state).toBe("notStarted")
  })

  it("Stopped : une personne a arrêté la mission", () => {
    const stopped = projectRun(deliveryRun(1, 11, { status: "FAILED", outcome: "STOPPED" }))
    expect(nodeStateOf({ category: "UNSTARTED", run: stopped, blockers: [], me: ME })).toEqual({ state: "stopped", reason: { kind: "stopped" } })
  })

  it("Blocked : une issue pas finie la bloque", () => {
    expect(nodeStateOf({ category: "UNSTARTED", run: null, blockers: [blocker], me: ME }))
      .toEqual({ state: "blocked", reason: { kind: "blocked", blockers: [blocker] } })
  })

  it("Working : une issue en cours tenue par une personne ; Not started : une issue d'une colonne de départ", () => {
    expect(nodeStateOf({ category: "STARTED", run: null, blockers: [], me: ME })).toEqual({ state: "working", reason: { kind: "person" } })
    expect(nodeStateOf({ category: "BACKLOG", run: null, blockers: [], me: ME }))
      .toEqual({ state: "notStarted", reason: { kind: "notStarted", refusal: null } })
  })

  it("une mission refusée au départ par une règle n'est pas une panne : Not started, avec la raison (R38)", () => {
    const refused = projectRun(deliveryRun(1, 11, { status: "FAILED", refused: true, error: "A rule asks for approval" }))
    expect(nodeStateOf({ category: "UNSTARTED", run: refused, blockers: [], me: ME }))
      .toEqual({ state: "notStarted", reason: { kind: "notStarted", refusal: "A rule asks for approval" } })
  })

  it("les demandes ouvertes ne comptent que pour une mission en cours", () => {
    expect(pendingOf(null)).toEqual([])
    expect(pendingOf(projectRun(deliveryRun(1, 11, { status: "DONE" }), [approval(5)]))).toEqual([])
    expect(pendingOf(projectRun(deliveryRun(1, 11), [approval(5), approval(6, { status: "ALLOWED" })]))).toHaveLength(1)
  })

  it("une issue finie, au sens des liens : terminée ou annulée", () => {
    expect(isFinished("COMPLETED")).toBe(true)
    expect(isFinished("CANCELLED")).toBe(true)
    expect(isFinished("STARTED")).toBe(false)
    expect(isFinished(undefined)).toBe(false)
  })
})
