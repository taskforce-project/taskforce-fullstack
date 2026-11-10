import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"

import { contextFrom, contextGauge, formatTokens, toneOf } from "./context-gauge"

const t = CONSTANTS_EN.cortex

// Test du CEO de la 1.10.0 : « Context window 45k / 33k (100%) » en rouge, le cumul de la conversation contre une
// fenêtre écrite en dur. La jauge montre la dernière demande contre la fenêtre qu'elle a eue, et dit ce que c'est.
describe("the context gauge", () => {
  it.each([
    [950, "950"],
    [3400, "3.4k"],
    [8192, "8.2k"],
    [16_384, "16k"],
    [45_256, "45k"],
  ])("writes %i tokens as %s", (n, text) => {
    expect(formatTokens(n)).toBe(text)
  })

  it.each([
    [0, "blue"],
    [69, "blue"],
    [70, "amber"],
    [89, "amber"],
    [90, "rose"],
  ])("%i%% is %s", (pct, tone) => {
    expect(toneOf(pct)).toBe(tone)
  })

  it.each([
    ["no usage", undefined, null],
    ["a fallback, no model called", { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, null],
    ["an answer before the gauge", { promptTokens: 6200, completionTokens: 40, totalTokens: 6240 }, null],
    ["Ollama, sized by the gateway", { promptTokens: 6200, completionTokens: 40, totalTokens: 6240, lastPromptTokens: 3400, contextWindow: 8192 },
      { tokens: 3400, window: 8192 }],
    ["a hosted provider, window unknown", { promptTokens: 6200, completionTokens: 40, totalTokens: 6240, lastPromptTokens: 3400, contextWindow: null },
      { tokens: 3400, window: null }],
    ["a hosted provider that reports its window", { promptTokens: 6200, completionTokens: 40, totalTokens: 6240, lastPromptTokens: 3400, contextWindow: 131_072 },
      { tokens: 3400, window: 131_072 }],
    ["an estimated window", { promptTokens: 6200, completionTokens: 40, totalTokens: 6240, lastPromptTokens: 3400, contextWindow: 16_384, contextEstimated: true },
      { tokens: 3400, window: 16_384, estimated: true }],
  ])("reads what the last request sent from %s", (_case, usage, context) => {
    expect(contextFrom(usage)).toEqual(context)
  })

  it("before any answer: nothing measured, and a line that says what it will show", () => {
    expect(contextGauge(null, 16_384, t)).toEqual({ value: null, pct: 0, tone: "blue", line: t.contextNone })
  })

  it("the last request against the window it got, and how far the window grows", () => {
    expect(contextGauge({ tokens: 3400, window: 8192 }, 16_384, t)).toEqual({
      value: "3.4k / 8.2k (42%)", pct: 42, tone: "blue", line: t.contextLineUpTo.replace("{max}", "16k"),
    })
    // À son plafond, la fenêtre ne grandit plus : la ligne ne le promet pas.
    expect(contextGauge({ tokens: 9000, window: 16_384 }, 16_384, t)).toMatchObject({ pct: 55, line: t.contextLine })
    expect(contextGauge({ tokens: 9000, window: 16_384 }, null, t)).toMatchObject({ line: t.contextLine })
  })

  it("an estimated window reads as one: a tilde on the number, and the line says so, even nearly full", () => {
    expect(contextGauge({ tokens: 3400, window: 16_384, estimated: true }, null, t)).toEqual({
      value: "3.4k / ~16k (21%)", pct: 21, tone: "blue", line: t.contextEstimated,
    })
    expect(contextGauge({ tokens: 16_000, window: 16_384, estimated: true }, null, t)).toMatchObject({
      pct: 98, tone: "rose", line: t.contextEstimated,
    })
  })

  it("nearly full: red, and the line says what it means", () => {
    expect(contextGauge({ tokens: 16_000, window: 16_384 }, 16_384, t)).toMatchObject({
      pct: 98, tone: "rose", line: t.contextFull,
    })
    expect(contextGauge({ tokens: 20_000, window: 16_384 }, 16_384, t).pct).toBe(100)
  })

  it("a hosted provider: the prompt size, without a window to compare with", () => {
    expect(contextGauge({ tokens: 3400, window: null }, null, t)).toEqual({
      value: "3.4k tokens", pct: 0, tone: "blue", line: t.contextProvider,
    })
  })
})
