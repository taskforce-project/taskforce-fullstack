import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"

import { TASK_ICONS, VerdictMark } from "./benchmark-signs"
import type { BenchmarkVerdict } from "@/lib/api/model-benchmark-service"

/** Le signe d'un verdict (Le dessin) : un point plein, un demi-point, un cercle, un tiret. */
describe("VerdictMark", () => {
  it.each([
    ["give_it", "full"],
    ["with_review", "half"],
    ["not_yet", "empty"],
  ] as const)("draws %s as %s", (verdict: BenchmarkVerdict, sign) => {
    const { container } = render(<VerdictMark verdict={verdict} />)
    expect(container.querySelector("[data-sign]")).toHaveAttribute("data-sign", sign)
  })

  it("draws a dash when the task has not been run", () => {
    const { container } = render(<VerdictMark verdict={null} />)
    expect(container.querySelector("[data-sign]")).toBeNull()
    expect(container.querySelector(".h-px")).not.toBeNull()
  })

  it("rings the sign when the verdict is a person's", () => {
    const { container, rerender } = render(<VerdictMark verdict="give_it" judge="you" />)
    expect(container.querySelector("[data-sign]")?.className).toContain("outline")
    rerender(<VerdictMark verdict="give_it" judge={null} />)
    expect(container.querySelector("[data-sign]")?.className).not.toContain("outline")
  })

  it("has an icon per task", () => {
    expect(Object.keys(TASK_ICONS)).toEqual(["summarize", "triage", "act", "answer", "write", "plan", "code"])
  })
})
