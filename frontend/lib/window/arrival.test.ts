import { describe, expect, it } from "vitest"

import type { DeliveryRun } from "@/lib/api/delivery-service"
import type { IssueHit } from "@/lib/api/issue-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import type { Signal } from "@/lib/store/notification-store"
import { arrivalSuggestions, SUGGESTIONS, waitingItems } from "./arrival"

const t = CONSTANTS_EN.conversation

function signal(patch: Partial<Signal>): Signal {
  return {
    id: "s1", type: "agentApproval", urgency: "warning", read: false, acknowledged: false, operation: "Ops",
    operationUrl: "/acme/projects/3", title: "Claude Code asks to push to main", issueId: "OPS-12",
    issueUrl: "/acme/projects/3?issue=12", timestamp: "just now", createdAt: "2026-11-08T10:00:00", ...patch,
  }
}

function run(patch: Partial<DeliveryRun>): DeliveryRun {
  return {
    id: 1, issueId: 1, issueKey: "OPS-1", issueTitle: "Fix login", projectId: 3, projectName: "Ops", providerKey: "claude-code",
    model: null, status: "DONE", summary: null, resultUrl: null, error: null, startedById: 7, createdAt: null,
    updatedAt: null, outcome: null, ...patch,
  }
}

const hit = (id: number, key: string, category = "STARTED", projectId = 3): IssueHit =>
  ({ id, projectId, key, title: `Issue ${key}`, status: "In progress", statusCategory: category })

/** L'arrivée d'une nouvelle conversation (R123) : ce qui attend la personne, puis trois suggestions de l'espace. */
describe("waitingItems", () => {
  it("les demandes d'accord non lues d'abord, puis les résultats à juger de la personne, chacun vers son issue", () => {
    const items = waitingItems(
      [signal({}), signal({ id: "s2", read: true }), signal({ id: "s3", type: "mention" })],
      [run({}), run({ id: 2, issueId: 2, outcome: "APPLIED" }), run({ id: 3, issueId: 3, startedById: 8 })],
      7, t,
    )

    expect(items).toEqual([
      {
        id: "signal:s1", kind: "approval", label: "Approve or refuse: Claude Code asks to push to main",
        issue: { projectId: 3, issueId: 12 }, href: null, signalId: "s1",
      },
      {
        id: "run:1", kind: "result", label: "Review the result on OPS-1 Fix login",
        issue: { projectId: 3, issueId: 1 }, href: null, signalId: null,
      },
    ])
  })

  it("un signal qui ne désigne pas une issue garde son adresse ; une mission sans projet n'ouvre rien", () => {
    const [approval, result] = waitingItems(
      [signal({ issueUrl: "", operationUrl: "/acme/members" })], [run({ projectId: null })], 7, t,
    )
    expect(approval.issue).toBeNull()
    expect(approval.href).toBe("/acme/members")
    expect(result.issue).toBeNull()
  })
})

describe("arrivalSuggestions", () => {
  const projects = [{ id: 3, name: "Ops", status: "ACTIVE" }, { id: 4, name: "Website", status: "PAUSED" }, { id: 5, name: "Old", status: "ARCHIVED" }]

  it("la mission qui travaille, l'issue ouverte la dernière changée, puis ce qui a changé dans son projet", () => {
    const suggestions = arrivalSuggestions({
      issues: [hit(12, "OPS-12"), hit(35, "OPS-35"), hit(40, "OPS-40", "COMPLETED")],
      runs: [run({ id: 9, issueId: 12, issueKey: "OPS-12", status: "RUNNING" })],
      me: 7,
      projects,
    }, t)

    expect(suggestions).toEqual([
      { id: "mission:9", label: "Where is the mission on OPS-12?", text: "Where does the mission on OPS-12 stand?" },
      { id: "summarize:35", label: "Summarize OPS-35", text: "Summarize OPS-35: where it stands and what is left to do." },
      { id: "changed:3", label: "What changed in Ops this week?", text: "What changed in Ops this week?" },
    ])
  })

  it("trois au plus, sans doublon, jamais un projet archivé ; d'autres issues puis d'autres projets complètent", () => {
    const issuesOnly = arrivalSuggestions({ issues: [hit(1, "WEB-1", "STARTED", 4), hit(2, "WEB-2", "BACKLOG", 4)], runs: [], me: 7, projects }, t)
    expect(issuesOnly.map((s) => s.id)).toEqual(["summarize:1", "changed:4", "summarize:2"])

    const projectsOnly = arrivalSuggestions({ issues: [], runs: [], me: 7, projects }, t)
    expect(projectsOnly.map((s) => s.id)).toEqual(["changed:3", "changed:4"])
    expect(projectsOnly.length).toBeLessThanOrEqual(SUGGESTIONS)
  })

  it("rien quand l'espace n'a rien : pas d'exemple inventé", () => {
    expect(arrivalSuggestions({ issues: [], runs: [run({ status: "RUNNING", startedById: 8 })], me: 7, projects: [] }, t)).toEqual([])
  })
})
