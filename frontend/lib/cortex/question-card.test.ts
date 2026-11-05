import { describe, expect, it } from "vitest"

import type { AssistantQuestion } from "@/lib/api/assistant-service"
import { OTHER, answered, answersOf, initialPicks, pick, saidOf, toggle, typeIn, type Picked } from "./question-card"

const NAME: AssistantQuestion = {
  field: "name", header: "Name", text: "What should the project be called?", multiple: false,
  choices: [{ value: "Next.js app", label: "Next.js app", description: "Suggested from your request", recommended: false }],
}
const REPOSITORY: AssistantQuestion = {
  field: "repository", header: "Repository", text: "Where does its code live?", multiple: false,
  choices: [
    { value: "new-private", label: "A new private repository", description: "Only the people you add see the code", recommended: true },
    { value: "none", label: "No repository for now", description: "Link one later", recommended: false },
  ],
}
const LABELS: AssistantQuestion = {
  field: "addLabels", header: "Labels", text: "Which labels should TF-12 get?", multiple: true,
  choices: [
    { value: "bug", label: "bug", description: "Something is broken", recommended: true },
    { value: "ui", label: "ui", description: null, recommended: false },
  ],
}
const COMMENT: AssistantQuestion = { field: "content", header: "Comment", text: "What should the comment say?", multiple: false, choices: [] }

const nothing: Picked = { values: [], other: false, typed: "" }

/** La carte de TaskForce comme celle de Claude (R115, décision du CEO du 05/11/2026). */
describe("question card: what the person picks and types", () => {
  it("checks the recommended choice beforehand, and nothing on a question without one", () => {
    expect(initialPicks([NAME, REPOSITORY, LABELS])).toEqual({
      name: nothing,
      repository: { values: ["new-private"], other: false, typed: "" },
      addLabels: { values: ["bug"], other: false, typed: "" },
    })
  })

  it.each([
    ["a choice replaces the previous one", { values: ["none"], other: false, typed: "mine" }, "new-private",
      { values: ["new-private"], other: false, typed: "mine" }],
    ["Other replaces the choice, and keeps what is typed", { values: ["none"], other: false, typed: "mine" }, OTHER,
      { values: [], other: true, typed: "mine" }],
  ])("pick: %s", (_label, before, value, after) => {
    expect(pick(before, value)).toEqual(after)
  })

  it.each([
    ["checks a choice", nothing, "bug", true, { values: ["bug"], other: false, typed: "" }],
    ["unchecks it", { values: ["bug", "ui"], other: false, typed: "" }, "bug", false, { values: ["ui"], other: false, typed: "" }],
    ["checks Other", nothing, OTHER, true, { values: [], other: true, typed: "" }],
    ["unchecks Other", { values: ["bug"], other: true, typed: "x" }, OTHER, false, { values: ["bug"], other: false, typed: "x" }],
  ])("toggle: %s", (_label, before, value, on, after) => {
    expect(toggle(before, value, on)).toEqual(after)
  })

  it.each([
    ["words pick Other alone, on a question of one answer", { values: ["none"], other: false, typed: "" }, "acme/web", false,
      { values: [], other: true, typed: "acme/web" }],
    ["words check Other beside the checked choices", { values: ["bug"], other: false, typed: "" }, "docs", true,
      { values: ["bug"], other: true, typed: "docs" }],
    ["blank words change nothing else", { values: ["none"], other: false, typed: "a" }, "  ", false,
      { values: ["none"], other: false, typed: "  " }],
  ])("typeIn: %s", (_label, before, typed, multiple, after) => {
    expect(typeIn(before, typed, multiple)).toEqual(after)
  })

  it.each([
    ["nothing picked", REPOSITORY, nothing, false],
    ["a choice", REPOSITORY, { values: ["none"], other: false, typed: "" }, true],
    ["Other without words", REPOSITORY, { values: [], other: true, typed: " " }, false],
    ["Other with words", REPOSITORY, { values: [], other: true, typed: "acme/web" }, true],
    ["words typed while a choice is picked", REPOSITORY, { values: [], other: false, typed: "acme/web" }, false],
    ["a question without choices, with words", COMMENT, { values: [], other: false, typed: "Done in #12" }, true],
    ["a question without choices, empty", COMMENT, nothing, false],
    ["no pick at all", REPOSITORY, undefined, false],
  ])("answered: %s -> %s", (_label, question, picked, expected) => {
    expect(answered(question, picked)).toBe(expected)
  })

  it("gives no answers while a question has none, then all of them, as the route takes them", () => {
    const picks = initialPicks([NAME, REPOSITORY])
    expect(answersOf([NAME, REPOSITORY], picks)).toBeNull()

    const named = { ...picks, name: typeIn(picks.name, " Atlas ", false) }
    expect(answersOf([NAME, REPOSITORY], named)).toEqual([
      { field: "name", values: [], other: "Atlas" },
      { field: "repository", values: ["new-private"] },
    ])
  })

  it("sends what is typed only with Other, or for a question without choices", () => {
    const picks: Record<string, Picked> = {
      addLabels: { values: ["bug"], other: false, typed: "docs" },
      content: { values: [], other: false, typed: "Done in #12" },
    }
    expect(answersOf([LABELS, COMMENT], picks)).toEqual([
      { field: "addLabels", values: ["bug"] },
      { field: "content", values: [], other: "Done in #12" },
    ])
    expect(answersOf([LABELS], { addLabels: toggle(picks.addLabels, OTHER, true) })).toEqual([
      { field: "addLabels", values: ["bug"], other: "docs" },
    ])
  })

  it.each([
    ["one question says its answer alone", [REPOSITORY], [{ field: "repository", values: ["new-private"] }],
      "A new private repository"],
    ["two questions say their header", [NAME, REPOSITORY],
      [{ field: "name", values: [], other: "Atlas" }, { field: "repository", values: ["none"] }],
      "Name: Atlas · Repository: No repository for now"],
    ["checked choices and typed words", [LABELS], [{ field: "addLabels", values: ["bug", "ui"], other: "docs" }], "bug, ui, docs"],
    ["a value the card does not show stays as it is", [{ ...REPOSITORY, header: null }, NAME],
      [{ field: "repository", values: ["acme/web"] }, { field: "name", values: ["Next.js app"] }],
      "acme/web · Name: Next.js app"],
  ])("saidOf: %s", (_label, questions, answers, said) => {
    expect(saidOf(questions, answers)).toBe(said)
  })
})
