import { describe, expect, it } from "vitest"

import { linkIndex, splitLinks } from "./answer-links"

const PROJECTS = [
  { id: 3, name: "Website", identifier: "WEB" },
  { id: 5, name: "API Platform", identifier: "API" },
  { id: 7, name: "Ux", identifier: "UX" },
]

/** Les liens d'une réponse (R120) : la clé d'une issue et le nom d'un projet ouvrent leur volet. */
describe("splitLinks", () => {
  const index = linkIndex(PROJECTS, [
    { projectId: 3, issueId: 28, key: "WEB-28" },
    { projectId: null, issueId: 99, key: "WEB-99" },
    null,
    undefined,
  ])

  it("links the issues the window knows by their id, the others of a project by their key", () => {
    expect(splitLinks("Moved WEB-28 to Done; WEB-31 waits.", index)).toEqual([
      "Moved ",
      { kind: "issue", text: "WEB-28", projectId: 3, issueId: 28, key: "WEB-28" },
      " to Done; ",
      { kind: "issue", text: "WEB-31", projectId: 3, issueId: null, key: "WEB-31" },
      " waits.",
    ])
  })

  it("links a project by its name, the longest name first", () => {
    expect(splitLinks("The API Platform board and Website.", index)).toEqual([
      "The ",
      { kind: "project", text: "API Platform", projectId: 5 },
      " board and ",
      { kind: "project", text: "Website", projectId: 3 },
      ".",
    ])
  })

  it.each([
    ["a key of no project of the workspace", "Encode in UTF-8 and ISO-8601."],
    ["a key inside a word", "XWEB-28 and WEB-28x"],
    ["a name inside a word", "Websites and websites"],
    ["a name too short to be a link", "the Ux of it"],
  ])("leaves %s as text", (_label, text) => {
    expect(splitLinks(text, index)).toEqual([text])
  })

  it("leaves the text alone when the workspace has no project yet", () => {
    expect(splitLinks("WEB-28", linkIndex([], []))).toEqual(["WEB-28"])
    expect(splitLinks("", index)).toEqual([])
  })
})
