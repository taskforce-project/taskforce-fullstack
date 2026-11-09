import { afterEach, describe, expect, it, vi } from "vitest"

import type { DeliveryRunEvent, MissionEvidence, MissionEvidenceEvent } from "@/lib/api/delivery-service"
import { diffAnchor, documentChanges, fileChanges, proofOf } from "./work-view"

let seq = 0
const event = (kind: DeliveryRunEvent["kind"], tool: string | null, text: string): DeliveryRunEvent =>
  ({ seq: ++seq, kind, tool, text, at: null })

const proofEvent = (n: number, type: string): MissionEvidenceEvent =>
  ({ seq: n, at: "2026-11-07T10:00:00Z", type, actor: { kind: "agent", id: "claude-code" }, data: null, prev: `h${n - 1}`, hash: `h${n}` })

/** La vue du travail (R95, point 3) : ce que la mission a fait, lu dans sa chronologie et son dossier ; rien n'y juge l'agent. */
describe("fileChanges : les fichiers que la mission écrit", () => {
  it("lists each file once, in the order touched, written or edited, and how many times", () => {
    const events = [
      event("text", null, "I'll fix the footer."),
      event("tool", "Read", "src/footer.tsx"),
      event("tool", "Edit", "src/footer.tsx"),
      event("tool", "Write", "src/links.ts"),
      event("tool", "MultiEdit", "src/footer.tsx"),
      event("tool", "Edit", "src/links.ts"),
      event("tool", "NotebookEdit", "notes/run.ipynb"),
      event("tool", "Bash", "npm test"),
      event("tool", "Edit", "  "),
    ]

    expect(fileChanges(events)).toEqual([
      { path: "src/footer.tsx", kind: "edited", times: 2 },
      { path: "src/links.ts", kind: "written", times: 2 },
      { path: "notes/run.ipynb", kind: "edited", times: 1 },
    ])
  })
})

describe("documentChanges : ce que la mission écrit dans TaskForce", () => {
  it("reads the comment, the issue and the checklist item of TaskForce's own tools, nothing of other servers", () => {
    const events = [
      event("tool", "taskforce: add_comment", '{"issue":"WEB-28","content":"Fixed the three links."}'),
      event("tool", "taskforce: create_issue", '{"title":"Follow-up: the header"}'),
      event("tool", "taskforce: update_issue", '{"issue":"WEB-28"}'),
      event("tool", "taskforce: check_checklist_item", '{"issue":"WEB-28","item":"Footer"}'),
      event("tool", "taskforce: get_issue", '{"issue":"WEB-28"}'),
      event("tool", "github: create_pr", '{"title":"x"}'),
      event("tool", "taskforce: add_comment", "not json"),
      event("tool", "taskforce: add_comment", "[1]"),
      event("text", "taskforce: add_comment", "{}"),
    ]

    expect(documentChanges(events).map(({ gesture, issue, text }) => ({ gesture, issue, text }))).toEqual([
      { gesture: "comment", issue: "WEB-28", text: "Fixed the three links." },
      { gesture: "issue", issue: null, text: "Follow-up: the header" },
      { gesture: "update", issue: "WEB-28", text: "" },
      { gesture: "checklist", issue: "WEB-28", text: "Footer" },
      { gesture: "comment", issue: null, text: "" },
      { gesture: "comment", issue: null, text: "" },
    ])
  })
})

describe("diffAnchor : un fichier dans l'onglet Files changed de la pull request", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("is diff- and the SHA-256 of its path", async () => {
    // L'empreinte SHA-256 de « abc », celle de la norme (FIPS 180-2).
    expect(await diffAnchor("abc")).toBe("diff-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })

  it("says nothing without the browser's digest", async () => {
    vi.stubGlobal("crypto", {})
    expect(await diffAnchor("README.md")).toBeNull()
  })
})

describe("proofOf : la preuve telle qu'elle se construit", () => {
  it("counts the record's events, and says when the mission ended", () => {
    const building: MissionEvidence = { format: "taskforce-evidence/1", events: [1, 2, 3].map((n) => proofEvent(n, "action.requested")), root: "h3" }
    expect(proofOf(building)).toEqual({ count: 3, sealed: false })

    const sealed: MissionEvidence = { ...building, events: [...building.events, proofEvent(4, "mission.ended")], root: "h4" }
    expect(proofOf(sealed)).toEqual({ count: 4, sealed: true })
  })

  it("is empty before the first event, or for a run without a record", () => {
    expect(proofOf(null)).toEqual({ count: 0, sealed: false })
    expect(proofOf(undefined)).toEqual({ count: 0, sealed: false })
  })
})
