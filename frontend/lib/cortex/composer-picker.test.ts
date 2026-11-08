import { describe, expect, it } from "vitest"

import type { IssueHit } from "@/lib/api/issue-service"
import {
  applyPick, attachmentKey, gestureOptions, issueOption, MAX_ATTACHMENTS, mentionOptions, nextIndex, PER_GROUP, personName,
  projectOption, toRequest, triggerAt, withAttachment, type ComposerAttachment,
} from "./composer-picker"

const hit = (id: number, key: string, title = `Issue ${id}`): IssueHit =>
  ({ id, projectId: 3, key, title, status: "Todo", statusCategory: "UNSTARTED" })

const issue = (id: number): ComposerAttachment => ({ kind: "issue", projectId: 3, issueId: id, label: `OPS-${id}`, title: "T" })
const project = (id: number): ComposerAttachment => ({ kind: "project", projectId: id, issueId: null, label: `P${id}`, title: null })

/** Ce que le compositeur sait de ce qu'on tape (R123) : « @ », « / » en tête, et ce qui se joint à la demande. */
describe("triggerAt", () => {
  it.each([
    ["@", 1, { kind: "mention", query: "", start: 0, end: 1 }],
    ["summarize @ops", 14, { kind: "mention", query: "ops", start: 10, end: 14 }],
    ["summarize @ops and", 14, { kind: "mention", query: "ops", start: 10, end: 14 }],
    ["/", 1, { kind: "gesture", query: "", start: 0, end: 1 }],
    ["/sum", 4, { kind: "gesture", query: "sum", start: 0, end: 4 }],
  ])("« %s » au curseur %i ouvre une liste", (text, caret, expected) => {
    expect(triggerAt(text, caret)).toEqual(expected)
  })

  it.each([
    ["mail@ops", 8],        // une adresse, pas une mention
    ["@ops done", 9],       // la mention est finie, un blanc après elle
    ["summarize /x", 12],   // « / » ne compte qu'en tête
    ["/summarize now", 14], // le geste est choisi
    ["", 0],
  ])("« %s » au curseur %i n'ouvre rien", (text, caret) => {
    expect(triggerAt(text, caret)).toBeNull()
  })

  it("un curseur hors du texte se ramène à sa fin", () => {
    expect(triggerAt("@op", 99)).toEqual({ kind: "mention", query: "op", start: 0, end: 3 })
  })
})

describe("applyPick", () => {
  it("remplace ce qui a ouvert la liste, suivi d'un blanc, et place le curseur après", () => {
    const trigger = { kind: "mention" as const, query: "ops", start: 10, end: 14 }
    expect(applyPick("summarize @ops", trigger, "OPS-35")).toEqual({ text: "summarize OPS-35 ", caret: 17 })
    expect(applyPick("summarize @ops please", trigger, "OPS-35")).toEqual({ text: "summarize OPS-35 please", caret: 16 })
  })

  it("un geste remplit le compositeur tel qu'il s'écrit", () => {
    expect(applyPick("/sum", { kind: "gesture", query: "sum", start: 0, end: 4 }, "Summarize ")).toEqual({ text: "Summarize ", caret: 10 })
  })
})

describe("les pièces jointes", () => {
  it("se nomment par leur issue ou leur projet, une seule fois, trois au plus", () => {
    expect(attachmentKey(issue(35))).toBe("issue:35")
    expect(attachmentKey(project(3))).toBe("project:3")
    const one = withAttachment([], issue(35))
    expect(withAttachment(one, issue(35))).toHaveLength(1)
    const full = [issue(1), issue(2), project(3)]
    expect(full).toHaveLength(MAX_ATTACHMENTS)
    expect(withAttachment(full, issue(4))).toEqual(full)
  })

  it("partent avec la demande : une issue dans son projet, ou un projet", () => {
    expect(toRequest([issue(35), project(4)])).toEqual([{ projectId: 3, issueId: 35 }, { projectId: 4 }])
  })
})

describe("les listes", () => {
  const people = [
    { userId: 1, displayName: "Pierre MICHEL", email: "pierre@acme.dev" },
    { userId: 2, displayName: null, email: "jonathan@acme.dev" },
  ]
  const projects = [{ id: 3, name: "Operations", identifier: "OPS" }, { id: 4, name: "Website", identifier: "WEB" }]

  it("« @ » : les issues trouvées, puis les personnes et les projets qui répondent, dès le premier caractère", () => {
    const all = mentionOptions("", { issues: [hit(35, "OPS-35")], people, projects })
    expect(all.map((o) => o.group)).toEqual(["issues", "people", "people", "projects", "projects"])

    const ops = mentionOptions("op", { issues: [], people, projects })
    expect(ops.map((o) => o.label)).toEqual(["Operations"])
    expect(ops[0].attach).toEqual({ kind: "project", projectId: 3, issueId: null, label: "Operations", title: null })

    const jo = mentionOptions("JON", { issues: [], people, projects })
    expect(jo).toEqual([{ id: "person:2", group: "people", label: "jonathan", detail: "jonathan@acme.dev", insert: "jonathan", attach: null }])
  })

  it("chaque groupe reste court", () => {
    const many = Array.from({ length: 9 }, (_, i) => hit(i + 1, `OPS-${i + 1}`))
    expect(mentionOptions("", { issues: many, people: [], projects: [] })).toHaveLength(PER_GROUP)
  })

  it("une issue s'écrit par sa clé et se joint ; un projet par son nom", () => {
    expect(issueOption(hit(35, "OPS-35", "Iteration #35"))).toEqual({
      id: "issue:35", group: "issues", label: "OPS-35", detail: "Iteration #35", insert: "OPS-35",
      attach: { kind: "issue", projectId: 3, issueId: 35, label: "OPS-35", title: "Iteration #35" },
    })
    expect(projectOption({ id: 4, name: "Website" }).detail).toBeNull()
    expect(personName({ userId: 1, displayName: "  ", email: "pierre@acme.dev" })).toBe("pierre")
  })

  it("« / » : les gestes dont le nom répond", () => {
    const gestures = [{ id: "summarize", label: "Summarize an issue", text: "Summarize " }, { id: "move", label: "Move an issue", text: "Move " }]
    expect(gestureOptions("sum", gestures).map((o) => o.insert)).toEqual(["Summarize "])
    expect(gestureOptions("", gestures)).toHaveLength(2)
  })

  it("le clavier parcourt la liste en rebouclant", () => {
    expect(nextIndex(0, 1, 3)).toBe(1)
    expect(nextIndex(2, 1, 3)).toBe(0)
    expect(nextIndex(0, -1, 3)).toBe(2)
    expect(nextIndex(0, 1, 0)).toBe(-1)
  })
})
