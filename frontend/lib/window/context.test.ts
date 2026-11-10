import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"
import { contextRaw, contextRead, contextRoom, contextSees, windowShare } from "./context"

const t = CONSTANTS_EN.rail.context

/** La carte « Context » (R122, R141) : ce que Cortex voit, puis la place et ce qu'il a lu, sans jargon (R133). */
describe("le contexte de la conversation", () => {
  it.each([
    [{ tokens: 4096, window: 32_768 }, 13],
    [{ tokens: 0, window: 32_768 }, 0],
    [{ tokens: 40_000, window: 32_768 }, 100],
    [{ tokens: -5, window: 32_768 }, 0],
    [{ tokens: 4096, window: null }, null],
    [{ tokens: 4096, window: 0 }, null],
    [null, null],
  ])("la dernière demande %o prend %s de la fenêtre", (context, share) => {
    expect(windowShare(context)).toBe(share)
  })

  it.each([
    [{ project: "Website", issue: null }, "Cortex sees the board of Website"],
    [{ project: "Website", issue: "TF-12" }, "Cortex sees TF-12 on the board of Website"],
    [{ project: null, issue: null }, "Cortex sees your workspace"],
  ])("dit d'un regard ce que Cortex voit : %o", (input, sentence) => {
    expect(contextSees(input, t)).toBe(sentence)
  })

  it.each([
    [null, "qwen3:8b", "It hasn't answered in this conversation yet."],
    [{ tokens: 4096, window: 32_768 }, "qwen3:8b", "Its last answer used 13% of what qwen3:8b can hold."],
    [{ tokens: 4096, window: 32_768 }, null, "Its last answer used 13% of what the model can hold."],
    [{ tokens: 4096, window: 16_384, estimated: true }, "qwen3:8b", "Its last answer used about 25% of what qwen3:8b can hold."],
    [{ tokens: 12_400, window: null }, "qwen3:8b", "Its last answer read about 9,300 words."],
  ])("dit la place prise en mots de tous les jours : %o", (context, model, sentence) => {
    expect(contextRoom(context, model, t)).toBe(sentence)
  })

  it("garde la taille brute au survol", () => {
    expect(contextRaw({ tokens: 4096, window: null })).toBe("4.1k tokens")
    expect(contextRaw(null)).toBeUndefined()
  })

  it.each([
    [null, null],
    [{ issues: [], boards: [], tools: [], notes: 0 }, null],
    [{ issues: [{ key: "A", comments: 0 }], boards: [], tools: [], notes: 0 }, "It read 1 issue."],
    [{ issues: [], boards: [], tools: [{ name: "x", calls: 1 }], notes: 3 }, "It read 3 notes."],
    [
      { issues: [{ key: "A", comments: 0 }, { key: "B", comments: 2 }], boards: [{ project: "W", issues: 3, open: null }], tools: [], notes: 1 },
      "It read 2 issues, 1 board and 1 note.",
    ],
    [
      { issues: [], boards: [{ project: "W", issues: 3, open: null }, { project: "X", issues: 2, open: null }], tools: [], notes: 2 },
      "It read 2 boards and 2 notes.",
    ],
  ])("dit ce que la dernière réponse a lu, sans nom d'outil : %o", (read, sentence) => {
    expect(contextRead(read, t)).toBe(sentence)
  })
})
