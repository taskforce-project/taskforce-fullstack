import { describe, expect, it } from "vitest"

import { insertDictation } from "./dictation"

describe("insertDictation", () => {
  it.each([
    ["", 0, "Create an issue", "Create an issue", 15],
    ["Move ", 5, "the login issue", "Move the login issue", 20],
    ["Move", 4, "the login issue", "Move the login issue", 20],
    ["Assign  to Marie", 7, "the bug", "Assign the bug to Marie", 14],
    ["Assign to Marie", 6, "the bug", "Assign the bug to Marie", 14],
    ["Done", 0, "Mark it", "Mark it Done", 8],
    ["Create an issue.", 15, "for pricing", "Create an issue for pricing.", 27],
  ])("writes at the caret in %j", (draft, at, said, text, caret) => {
    expect(insertDictation(draft, at, said)).toEqual({ text, caret })
  })

  it("trims what was said", () => {
    expect(insertDictation("", 0, "  Hello.  ")).toEqual({ text: "Hello.", caret: 6 })
  })

  it("keeps the text when nothing was said", () => {
    expect(insertDictation("Draft", 2, "  ")).toEqual({ text: "Draft", caret: 2 })
  })

  it("keeps a caret beyond the text within it", () => {
    expect(insertDictation("Hi", 99, "there")).toEqual({ text: "Hi there", caret: 8 })
    expect(insertDictation("Hi", -3, "Oh")).toEqual({ text: "Oh Hi", caret: 3 })
  })
})
