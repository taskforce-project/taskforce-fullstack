import { describe, expect, it } from "vitest"

import type { DeliveryRun } from "@/lib/api/delivery-service"
import type { Signal } from "@/lib/store/notification-store"
import { waitingCount } from "./waiting"

function signal(type: Signal["type"], read = false): Signal {
  return {
    id: `${type}-${read}`, type, urgency: "info", read, acknowledged: false, operation: "Website", operationUrl: "",
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

/** « Waiting for you » (R121) remplace la cloche : les demandes d'accord, les résultats à juger, les mentions. */
describe("waitingCount", () => {
  it("compte les demandes d'accord et les mentions non lues, et les résultats à juger", () => {
    const signals = [
      signal("agentApproval"), signal("mention"), signal("mention", true), signal("assigned"), signal("agentDone"),
    ]
    const runs = [run({ id: 1, issueId: 1 }), run({ id: 2, issueId: 2, outcome: "APPLIED" }), run({ id: 3, issueId: 3, startedById: 8 })]

    expect(waitingCount(signals, runs, 7)).toBe(3)
  })

  it.each([
    [[], [], 7, 0],
    [[signal("commented")], [], 7, 0],
    [[], [run({})], null, 0],
  ])("ne compte rien de ce qui n'attend pas la personne (%#)", (signals, runs, me, count) => {
    expect(waitingCount(signals, runs, me)).toBe(count)
  })
})
