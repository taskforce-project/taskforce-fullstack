import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"

import { cardLine } from "./model-card"

const T = CONSTANTS_EN.progress

/** Un modèle pas encore mesuré : ce que dit sa fiche, comme telle, jamais une note (R113, R125). */
describe("cardLine", () => {
  it.each([
    [{ parameters: "8.2B", contextWindow: 40960, tools: true },
      "Its description says: 8.2B parameters · a context window of 40,960 tokens · takes tools."],
    [{ parameters: "567.75M", contextWindow: null, tools: false }, "Its description says: 567.75M parameters · takes no tools."],
    [{ parameters: null, contextWindow: 131072, tools: null }, "Its description says: a context window of 131,072 tokens."],
  ])("says only what the description says: %o", (card, line) => {
    expect(cardLine(card, T)).toBe(line)
  })

  it.each([[null], [undefined], [{ parameters: null, contextWindow: null, tools: null }]])(
    "says nothing without a description: %o",
    (card) => {
      expect(cardLine(card, T)).toBeNull()
    },
  )
})
