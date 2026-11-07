import { describe, expect, it } from "vitest"

import type { AnalysisJob } from "@/lib/api/analysis-service"
import type { DeliveryRun } from "@/lib/api/delivery-service"
import {
  awaitsJudgment, elapsedMinutes, isActiveJob, isActiveRun, isMine, jobState, liveRuns, myRuns, resultsToJudge, runLabel,
  runState,
} from "./missions"

const NOW = Date.parse("2026-11-05T12:00:00Z")

function run(patch: Partial<DeliveryRun> = {}): DeliveryRun {
  return {
    id: 1, issueId: 28, issueKey: "TF-28", issueTitle: "Fix the footer links", projectId: 3, projectName: "TaskForce",
    providerKey: "claude-code", model: null, status: "RUNNING", summary: null, resultUrl: null, error: null,
    startedById: 7, createdAt: "2026-11-05T11:50:00", updatedAt: "2026-11-05T11:55:00", outcome: null,
    ...patch,
  }
}

function job(patch: Partial<AnalysisJob> = {}): AnalysisJob {
  return {
    id: 4, projectId: 3, projectName: "TaskForce", depth: "DEEP", status: "RUNNING", question: null, error: null,
    briefId: null, createdAt: "2026-11-05T11:58:00", updatedAt: "2026-11-05T11:59:00", ...patch,
  }
}

/** Le travail des agents dans la fenêtre : les quatre états de R57, le travail de la personne seulement. */
describe("les missions de la fenêtre", () => {
  it.each([
    [run({ status: "QUEUED" }), "working"],
    [run({ status: "RUNNING" }), "working"],
    [run({ status: "DONE" }), "waiting"],
    [run({ status: "DONE", outcome: "APPLIED" }), "done"],
    [run({ status: "FAILED" }), "failed"],
    [run({ status: "FAILED", refused: true }), "done"],
  ])("une mission %#, en un point : %s", (mission, state) => {
    expect(runState(mission)).toBe(state)
  })

  it.each([
    [job({ status: "WAITING_FOR_INPUT" }), "waiting"],
    [job({ status: "QUEUED" }), "working"],
    [job({ status: "RUNNING" }), "working"],
    [job({ status: "FAILED" }), "failed"],
    [job({ status: "DONE" }), "done"],
  ])("une analyse %#, en un point : %s", (analysis, state) => {
    expect(jobState(analysis)).toBe(state)
    expect(isActiveJob(analysis.status)).toBe(state === "waiting" || state === "working")
  })

  it.each([
    [7, true], ["7", true], [8, false], [null, false], [undefined, false],
  ])("ne montre que les missions de la personne (%s)", (me, mine) => {
    expect(isMine(run(), me)).toBe(mine)
    expect(isMine(run({ startedById: null }), me)).toBe(false)
  })

  it("garde la dernière mission de chaque issue, la plus récente d'abord", () => {
    const latest = run({ id: 2, status: "RUNNING" })
    const earlier = run({ id: 1, status: "DONE", outcome: "RETRIED" })
    const other = run({ id: 3, issueId: 30, startedById: 8 })

    expect(myRuns([latest, earlier, other], 7)).toEqual([latest])
  })

  it("dit les résultats qui attendent le jugement de la personne", () => {
    const waiting = run({ id: 1, issueId: 1, status: "DONE" })
    const applied = run({ id: 2, issueId: 2, status: "DONE", outcome: "APPLIED" })
    const refused = run({ id: 3, issueId: 3, status: "DONE", refused: true })

    expect(awaitsJudgment(waiting)).toBe(true)
    expect(resultsToJudge([waiting, applied, refused], 7)).toEqual([waiting])
  })

  it("montre sous son projet ce qui vit : au travail, à juger, et un échec le jour où il arrive", () => {
    const working = run({ id: 1, issueId: 1 })
    const waiting = run({ id: 2, issueId: 2, status: "DONE" })
    const failedToday = run({ id: 3, issueId: 3, status: "FAILED", updatedAt: "2026-11-05T09:00:00" })
    const failedLastWeek = run({ id: 4, issueId: 4, status: "FAILED", updatedAt: "2026-10-29T09:00:00" })
    const failedUndated = run({ id: 5, issueId: 5, status: "FAILED", updatedAt: null, createdAt: null })
    const done = run({ id: 6, issueId: 6, status: "DONE", outcome: "MARKED_DONE" })

    expect(liveRuns([working, waiting, failedToday, failedLastWeek, failedUndated, done], 7, NOW))
      .toEqual([working, waiting, failedToday])
    expect(isActiveRun("QUEUED")).toBe(true)
  })

  it.each([
    ["2026-11-05T11:59:30", 0],
    ["2026-11-05T11:56:00", 4],
    ["2026-11-05T10:00:00", 120],
    [null, null],
    ["2026-11-05T12:05:00", 0],
  ])("compte le temps écoulé depuis %s : %s min", (since, minutes) => {
    expect(elapsedMinutes(since, NOW)).toBe(minutes)
  })

  it.each([
    [{ issueKey: "TF-28", issueTitle: "Fix the footer links", issueId: 28 }, "TF-28 Fix the footer links"],
    [{ issueKey: null, issueTitle: "Fix the footer links", issueId: 28 }, "Fix the footer links"],
    [{ issueKey: null, issueTitle: null, issueId: 28 }, "#28"],
  ])("nomme la mission par son issue : %o", (mission, label) => {
    expect(runLabel(mission)).toBe(label)
  })
})
