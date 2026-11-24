import { afterEach, describe, expect, it } from "vitest"

import { lowestContrast } from "./contrast"

/** Un texte dans ses parents, du plus haut au plus proche : `nest("bg-muted", "text-foreground")` rend le texte. */
function nest(...classes: readonly string[]): HTMLElement {
  let node: HTMLElement = document.body
  for (const className of classes) {
    const child = document.createElement("span")
    child.className = className
    node.append(child)
    node = child
  }
  node.textContent = "+3"
  return node
}

/** Le mètre des tests de contraste : il doit retrouver ce que la revue axe-core a mesuré sur la vue de travail. */
describe("lowestContrast", () => {
  afterEach(() => document.body.replaceChildren())

  it("finds the ratios axe-core reported on the mission work view, in the light theme", () => {
    expect(lowestContrast(nest("text-muted-foreground/70"), "light", ["background"])).toBeCloseTo(3.58, 1)
    expect(lowestContrast(nest("text-chart-3"), "light", ["background"])).toBeCloseTo(4.14, 1)
    expect(lowestContrast(nest("text-chart-2"), "light", ["background"])).toBeCloseTo(4.17, 1)
  })

  it("reads the dark theme's own tokens, on the page and on a card", () => {
    expect(lowestContrast(nest("text-muted-foreground/70"), "dark", ["background"])).toBeCloseTo(4.48, 1)
    expect(lowestContrast(nest("text-muted-foreground/70"), "dark")).toBeCloseTo(4.33, 1)
  })

  it("lays the parents' backgrounds under the text, and the hover one when the row is hovered", () => {
    expect(lowestContrast(nest("text-subtle"), "light", ["background"])).toBeCloseTo(5.05, 1)
    expect(lowestContrast(nest("hover:bg-muted/60", "text-subtle"), "light", ["background"])).toBeCloseTo(4.75, 1)
    expect(lowestContrast(nest("bg-chart-2/10", "text-subtle"), "light", ["background"])).toBeLessThan(4.5)
  })

  it("takes the color of the closest parent when the text has none of its own", () => {
    expect(lowestContrast(nest("text-chart-3", "font-mono text-xs"), "light", ["background"])).toBeCloseTo(4.14, 1)
  })

  it("refuses to measure a text without a color", () => {
    expect(() => lowestContrast(nest("text-xs"), "light")).toThrow(/no text color/)
  })
})
