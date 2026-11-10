import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"
import type { Signal } from "@/lib/store/notification-store"
import type { WaitingItem } from "@/lib/window/arrival"
import { alertsOf, happenedOf, mentionsOf, signalHint, signalKind, signalSentence, waitingSentence } from "./inbox"

const t = CONSTANTS_EN.inbox

const signal = (patch: Partial<Signal>): Signal => ({
  id: "1", type: "completed", urgency: "info", read: true, acknowledged: false, operation: "Ops", operationUrl: "", title: "Fix it",
  issueId: "OPS-1", issueUrl: "", timestamp: "just now", createdAt: "2026-11-08T10:00:00", ...patch,
})

const item = (patch: Partial<WaitingItem>): WaitingItem => ({
  id: "a", kind: "approval", label: "OPS-1 Fix", name: "n", count: 1, issue: null, href: null, signalId: null, key: "OPS-1", title: "Fix",
  at: null, who: null, ...patch,
})

/** Les trois groupes de « Waiting for you » (R141) et la phrase de chaque ligne (R133). */
describe("inbox", () => {
  it("the alerts are about time and load", () => {
    const signals = [signal({ id: "1", type: "overdue" }), signal({ id: "2", type: "dueSoon" }), signal({ id: "3", type: "overload" }), signal({ id: "4" })]
    expect(alertsOf(signals).map((s) => s.id)).toEqual(["1", "2", "3"])
  })

  it("what happened is the rest, the latest first, without what is said elsewhere", () => {
    const signals = [
      signal({ id: "old", createdAt: "2026-11-01T10:00:00" }),
      signal({ id: "new", createdAt: "2026-11-08T10:00:00" }),
      signal({ id: "alert", type: "overdue" }),
      signal({ id: "ask", type: "agentApproval" }),
      signal({ id: "unread-mention", type: "mention", read: false }),
      signal({ id: "read-mention", type: "mention", read: true, createdAt: "2026-11-02T10:00:00" }),
      signal({ id: "to-review", type: "agentDone", issueId: "OPS-9" }),
      signal({ id: "reviewed", type: "agentDone", issueId: "OPS-8", createdAt: "2026-10-30T10:00:00" }),
    ]
    expect(happenedOf(signals, [item({ kind: "result", key: "OPS-9" })]).map((s) => s.id)).toEqual(["new", "read-mention", "old", "reviewed"])
  })

  it("keeps the mentions, read or not, for their own address", () => {
    expect(mentionsOf([signal({ id: "1", type: "mention" }), signal({ id: "2", type: "mention", read: false }), signal({ id: "3" })]).map((s) => s.id)).toEqual(["1", "2"])
  })

  it.each([
    [{ kind: "approval", count: 1 }, "Approve or refuse a request on Fix"],
    [{ kind: "approval", count: 3 }, "Approve or refuse 3 requests on Fix"],
    [{ kind: "result" }, "Review the result on Fix"],
    [{ kind: "mention", who: "Ada" }, "Ada mentioned you on Fix"],
    [{ kind: "mention" }, "Someone mentioned you on Fix"],
    [{ kind: "result", title: "" }, "Review the result on OPS-1 Fix"],
  ] as const)("says what waits in words: %j", (patch, sentence) => {
    expect(waitingSentence(item(patch), t)).toBe(sentence)
  })

  const actor = { name: "Ada", initials: "A", avatarUrl: null, email: null }

  it.each([
    [{ type: "mention", actor }, "Ada mentioned you on Fix it"],
    [{ type: "commented", actor }, "Ada commented on Fix it"],
    [{ type: "assigned", actor }, "Ada assigned you Fix it"],
    [{ type: "assigned" }, "Someone assigned you Fix it"],
    [{ type: "overdue", title: "Fix it: deadline breached" }, "Fix it: deadline breached"],
  ] as const)("builds the sentence of a signal: %j", (patch, sentence) => {
    expect(signalSentence(signal(patch), t)).toBe(sentence)
  })

  it("names the kind, and falls back on an unknown type", () => {
    expect(signalKind(signal({ type: "agentFailed" }), t)).toBe("Agent failed")
    expect(signalKind(signal({ type: "assignmentDeclined" as Signal["type"] }), t)).toBe("Notification")
  })

  it("keeps a comment's words on hover, and what an agent wrote in its issue", () => {
    expect(signalHint(signal({ type: "commented", body: "Looks good" }), t)).toBe("Commented, Ops: Looks good")
    expect(signalHint(signal({ type: "agentFailed", body: "refused by the rule x" }), t)).toBe("Agent failed, Ops")
    expect(signalHint(signal({ type: "completed", operation: "" }), t)).toBe("Completed")
  })
})
