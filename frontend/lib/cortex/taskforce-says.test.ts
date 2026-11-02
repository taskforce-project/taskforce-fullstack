import { describe, expect, it } from "vitest"

import { splitAnswer } from "./taskforce-says"

describe("splitAnswer : ce que Cortex écrit, ce que TaskForce dit (R116)", () => {
  it("keeps an answer without a correction as Cortex's", () => {
    expect(splitAnswer("TESTTA-2 is in **In review by AI**.")).toEqual([
      { by: "cortex", text: "TESTTA-2 is in **In review by AI**." },
    ])
  })

  it("reads the 02/11/2026 deletion that never happened as TaskForce's words only", () => {
    expect(splitAnswer("> [!taskforce] TaskForce\n> Nothing was deleted in this turn.")).toEqual([
      { by: "taskforce", lines: ["Nothing was deleted in this turn."] },
    ])
  })

  it("keeps the order of the answer around the correction, with every line of the truth", () => {
    const answer = [
      "Here are the issues of the project.",
      "",
      "> [!taskforce] TaskForce",
      "> Nothing was deleted in this turn.",
      ">",
      "> Nothing is created yet: check the issue below, then create it.",
      "",
      "Anything else?",
    ].join("\r\n")

    expect(splitAnswer(answer)).toEqual([
      { by: "cortex", text: "Here are the issues of the project." },
      { by: "taskforce", lines: ["Nothing was deleted in this turn.", "Nothing is created yet: check the issue below, then create it."] },
      { by: "cortex", text: "Anything else?" },
    ])
  })

  it("leaves a quote that Cortex writes to Cortex", () => {
    expect(splitAnswer("> TaskForce\n> TESTTA-2 was deleted.")).toEqual([
      { by: "cortex", text: "> TaskForce\n> TESTTA-2 was deleted." },
    ])
  })

  it("reads the mark whatever its case, and drops a block that says nothing", () => {
    expect(splitAnswer("> [!TaskForce] TaskForce\n> Nothing was moved in this turn.")).toEqual([
      { by: "taskforce", lines: ["Nothing was moved in this turn."] },
    ])
    expect(splitAnswer("> [!taskforce] TaskForce\nDone.")).toEqual([{ by: "cortex", text: "Done." }])
  })

  it("gives nothing for an empty answer", () => {
    expect(splitAnswer("")).toEqual([])
  })
})
