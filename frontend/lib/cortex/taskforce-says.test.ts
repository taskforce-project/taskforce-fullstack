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

  it("reads a block about the model that answers apart from a correction (R118)", () => {
    const answer = "Moved.\n\n> [!taskforce] TaskForce · models\n> Answered by qwen3:8b, as you asked."
    expect(splitAnswer(answer)).toEqual([
      { by: "cortex", text: "Moved." },
      { by: "taskforce", lines: ["Answered by qwen3:8b, as you asked."], kind: "models" },
    ])
  })

  it("reads TaskForce's questions before a gesture apart from a correction, one per line (R115)", () => {
    const answer = "> [!taskforce] TaskForce · asks\n> What should the project be called?\n> Where does its code live?\n"
    expect(splitAnswer(answer)).toEqual([
      { by: "taskforce", lines: ["What should the project be called?", "Where does its code live?"], kind: "asks" },
    ])
  })

  it("reads what was done in the conversation apart from a correction of an action never done (R204)", () => {
    const answer = "> [!taskforce] TaskForce · done\n> This was created in this conversation, in TaskForce: Project created: TESTTASKFO \"Test Taskforce\".\n\nQuel nom ?"
    expect(splitAnswer(answer)).toEqual([
      { by: "taskforce", lines: ["This was created in this conversation, in TaskForce: Project created: TESTTASKFO \"Test Taskforce\"."], kind: "done" },
      { by: "cortex", text: "Quel nom ?" },
    ])
  })

  it("reads what TaskForce says of the tool the request named apart from a correction (R204)", () => {
    const answer = "Je peux le faire dès qu'Asana est là.\n\n> [!taskforce] TaskForce · connections\n> Cortex isn't connected to Asana for you yet."
    expect(splitAnswer(answer)).toEqual([
      { by: "cortex", text: "Je peux le faire dès qu'Asana est là." },
      { by: "taskforce", lines: ["Cortex isn't connected to Asana for you yet."], kind: "connections" },
    ])
  })

  it("gives nothing for an empty answer", () => {
    expect(splitAnswer("")).toEqual([])
  })
})
