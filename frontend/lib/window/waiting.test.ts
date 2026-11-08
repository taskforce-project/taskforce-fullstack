import { describe, expect, it } from "vitest"

import type { DeliveryRun, OpenApproval } from "@/lib/api/delivery-service"
import type { Signal } from "@/lib/store/notification-store"
import { latestAgentSignal, unreadMentions, waitingCount } from "./waiting"

function signal(type: Signal["type"], read = false, id = `${type}-${read}`): Signal {
  return {
    id, type, urgency: "info", read, acknowledged: false, operation: "Website", operationUrl: "",
    title: type, issueId: "TF-1", issueUrl: "", timestamp: "just now", createdAt: "2026-11-05T10:00:00",
  }
}

function run(patch: Partial<DeliveryRun>): DeliveryRun {
  return {
    id: 1, issueId: 1, issueKey: "TF-1", issueTitle: "A", projectId: 3, projectName: "Website", providerKey: "claude-code",
    model: null, status: "DONE", summary: null, resultUrl: null, error: null, startedById: 7, createdAt: null,
    updatedAt: null, outcome: null, ...patch,
  }
}

const approval = (runId: number, requests: number): OpenApproval =>
  ({ runId, issueId: runId * 10, issueKey: `TF-${runId}`, issueTitle: "A", projectId: 3, requests })

/** « Waiting for you » (R121, R128) remplace la cloche : ce qui bloque un agent et ce qui attend un jugement, rien d'autre. */
describe("waitingCount", () => {
  it("compte les demandes ouvertes une par une, et les résultats à juger de la personne", () => {
    const runs = [run({ id: 1, issueId: 1 }), run({ id: 2, issueId: 2, outcome: "APPLIED" }), run({ id: 3, issueId: 3, startedById: 8 })]

    expect(waitingCount([approval(1, 3), approval(2, 1)], runs, 7)).toBe(5)
  })

  it.each([
    [[], [], 7, 0],
    [[], [run({ status: "RUNNING" })], 7, 0],
    [[], [run({})], null, 0],
  ])("ne compte rien de ce qui n'attend pas la personne (%#)", (approvals, runs, me, count) => {
    expect(waitingCount(approvals, runs, me)).toBe(count)
  })
})

describe("unreadMentions", () => {
  it("garde les mentions non lues, rien d'autre", () => {
    const mention = signal("mention")
    expect(unreadMentions([mention, signal("mention", true), signal("agentApproval"), signal("assigned")])).toEqual([mention])
  })
})

/** Le dernier signal d'un agent reçu : ce qui attend la personne se relit quand il change. */
describe("latestAgentSignal", () => {
  it("rend l'identifiant le plus grand des signaux d'agent, quel que soit le tri", () => {
    expect(latestAgentSignal([
      signal("agentApproval", false, "12"), signal("agentDone", true, "40"), signal("mention", false, "99"), signal("agentFailed", false, "7"),
    ])).toBe(40)
  })

  it.each([
    [[signal("mention", false, "3")]],
    [[]],
  ])("rend null sans signal d'agent (%#)", (signals) => {
    expect(latestAgentSignal(signals)).toBeNull()
  })

  it("compte aussi une mission qui n'a pas démarré", () => {
    expect(latestAgentSignal([signal("agentNotStarted", false, "5")])).toBe(5)
  })
})
