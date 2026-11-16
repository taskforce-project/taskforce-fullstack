import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { ScrollableTabs } from "./scrollable-tabs"

/** Une boîte posée à la main : happy-dom ne met rien en page. */
const rect = (left: number, right: number) =>
  ({ left, right, top: 0, bottom: 40, width: right - left, height: 40, x: left, y: 0, toJSON: () => null }) as DOMRect

function tabs(active: string) {
  return ["Board", "Workflow", "List", "Settings"].map((name) => (
    <button key={name} type="button" aria-current={name === active ? "page" : undefined}>{name}</button>
  ))
}

/** La bande d'onglets d'un projet (R161, M9) : l'onglet de la page se lit en entier, jamais sous un chevron. */
describe("ScrollableTabs", () => {
  it("brings the page's tab out from under the right chevron, whole", () => {
    const realRect = HTMLElement.prototype.getBoundingClientRect
    // La bande fait 200 px ; « Workflow » finit à 230 px, sous le chevron de droite et au-delà.
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.getAttribute("aria-current") === "page") return rect(150, 230)
      if (this.classList.contains("overflow-x-auto")) return rect(0, 200)
      return realRect.call(this)
    }
    try {
      render(<ScrollableTabs activeKey="/workflow">{tabs("Workflow")}</ScrollableTabs>)
      const strip = screen.getByRole("button", { name: "Workflow" }).parentElement as HTMLElement
      // 230 - (200 - 40) : la fin de l'onglet passe le fondu du chevron.
      expect(strip.scrollLeft).toBe(70)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = realRect
    }
  })

  it("leaves the strip where it is when the page's tab already reads whole, or when nothing is laid out", () => {
    render(<ScrollableTabs activeKey="/">{tabs("Board")}</ScrollableTabs>)
    const strip = screen.getByRole("button", { name: "Board" }).parentElement as HTMLElement
    expect(strip.scrollLeft).toBe(0)
  })
})
