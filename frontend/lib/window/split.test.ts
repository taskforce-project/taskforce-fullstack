import { describe, expect, it } from "vitest"

import { clampWidth, MIN_CONVERSATION, MIN_PANE, paneSplit } from "./split"

/** La place du volet à côté de la conversation (« Le dessin », séance n°18). */
describe("paneSplit", () => {
  it("gives the pane half of the space by default, 480 px at least", () => {
    expect(paneSplit(1344, null)).toEqual({ narrow: false, width: 672, max: 1344 - MIN_CONVERSATION })
    expect(paneSplit(900, null)).toEqual({ narrow: false, width: MIN_PANE, max: 540 })
  })

  it("keeps the width the person chose, inside what the conversation leaves", () => {
    expect(paneSplit(1344, 700).width).toBe(700)
    expect(paneSplit(1344, 2000).width).toBe(1344 - MIN_CONVERSATION)
    expect(paneSplit(1344, 100).width).toBe(MIN_PANE)
  })

  it("falls to full width when the conversation can't keep 360 px beside 480 px of pane", () => {
    expect(paneSplit(MIN_PANE + MIN_CONVERSATION - 1, 600)).toEqual({ narrow: true, width: null, max: MIN_PANE })
    expect(paneSplit(MIN_PANE + MIN_CONVERSATION, null).narrow).toBe(false)
  })

  it("leaves the pane to its CSS half until the space is measured", () => {
    expect(paneSplit(0, 700)).toEqual({ narrow: false, width: null, max: Number.POSITIVE_INFINITY })
  })

  it("rounds and bounds a width", () => {
    expect(clampWidth(612.6, 900)).toBe(613)
    expect(clampWidth(10, 900)).toBe(MIN_PANE)
    expect(clampWidth(1200, 900)).toBe(900)
  })
})
