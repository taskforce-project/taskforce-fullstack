import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"
import { contextSentence, windowShare, type ContextInput } from "./context"

const t = CONSTANTS_EN.window.context

const input = (patch: Partial<ContextInput>): ContextInput => ({
  project: "Website", issue: null, context: null, model: "qwen3:8b", ...patch,
})

/** « Context » (R122) : ce que Cortex voit et la place de sa dernière réponse dans la fenêtre du modèle, en une phrase. */
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
    [input({}), "Cortex sees the board of Website."],
    [input({ issue: "TF-12" }), "Cortex sees TF-12 on the board of Website."],
    [input({ project: null }), "Cortex sees no board, only your workspace's knowledge."],
    [
      input({ context: { tokens: 4096, window: 32_768 } }),
      "Cortex sees the board of Website, and its last answer took 13% of qwen3:8b's window (4.1k tokens).",
    ],
    [
      input({ context: { tokens: 4096, window: 32_768 }, model: null }),
      "Cortex sees the board of Website, and its last answer took 13% of the model's window (4.1k tokens).",
    ],
    [input({ context: { tokens: 12_400, window: null } }), "Cortex sees the board of Website, and its last answer read 12k tokens."],
    [input({ context: { tokens: 800, window: null } }), "Cortex sees the board of Website, and its last answer read 800 tokens."],
  ])("dit en une phrase : %o", (context, sentence) => {
    expect(contextSentence(context, t)).toBe(sentence)
  })
})
