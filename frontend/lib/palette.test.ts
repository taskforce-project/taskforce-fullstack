import { describe, expect, it } from "vitest"

import { inkOnShape, PRIORITY_DOT, SHAPE_FILLS, seriesColor, shapeFill } from "./palette"

describe("palette", () => {
  it.each([
    ["URGENT", "bg-shape-red"],
    ["HIGH", "bg-shape-yellow"],
    ["MEDIUM", "bg-primary"],
    ["LOW", "bg-subtle"],
    ["NONE", "bg-muted-foreground/30"],
  ] as const)("pastille de priorité %s → %s", (priority, cls) => {
    expect(PRIORITY_DOT[priority]).toBe(cls)
  })

  it.each([
    [0, "bg-chart-1"],
    [4, "bg-chart-5"],
    [5, "bg-chart-1"],
    [-7, "bg-chart-3"],
  ])("série %i → %s (stable, graine négative comprise)", (id, cls) => {
    expect(seriesColor(id)).toBe(cls)
  })

  it.each([
    [0, "bg-shape-blue"],
    [3, "bg-shape-yellow"],
    [7, "bg-shape-blue"],
    [-2, "bg-shape-red"],
  ])("forme pleine pour la graine %i → %s", (seed, bg) => {
    expect(shapeFill(seed).bg).toBe(bg)
  })

  it.each([
    ["bg-shape-blue", "text-white"],
    ["bg-shape-green", "text-night"],
    ["bg-shape-yellow", "text-night"],
    ["bg-shape-lime", "text-night"],
    ["bg-primary", "text-white"],
  ])("encre sur %s → %s", (bg, fg) => {
    expect(inkOnShape(bg)).toBe(fg)
  })

  it("chaque forme pleine a une encre", () => {
    for (const f of SHAPE_FILLS) expect(f.fg).toMatch(/^text-(white|night)$/)
  })
})
