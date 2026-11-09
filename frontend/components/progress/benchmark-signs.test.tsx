import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { TASK_ICONS, VerdictMark } from "./benchmark-signs"
import type { BenchmarkVerdict } from "@/lib/api/model-benchmark-service"

/** Le signe d'un verdict (Le dessin) : un point plein, un demi-point, un cercle, un tiret, celui des capacités (R130). */
describe("VerdictMark", () => {
  it.each([
    ["give_it", 1, 0],
    ["with_review", 1, 1],
    ["not_yet", 1, 0],
    ["too_slow", 1, 1],
    [null, 0, 1],
  ] as const)("draws %s and names it for screen readers", (verdict: BenchmarkVerdict | null, circles, paths) => {
    const { container } = render(<VerdictMark verdict={verdict} name="Summarize: Give it" />)
    expect(screen.getByRole("img", { name: "Summarize: Give it" })).toBeInTheDocument()
    expect(container.querySelectorAll("circle")).toHaveLength(circles)
    expect(container.querySelectorAll("path")).toHaveLength(paths)
  })

  it("never draws too slow in the colour of a failure", () => {
    const { container } = render(<VerdictMark verdict="too_slow" name="x" />)
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-muted-foreground")
    expect(container.querySelector("svg")?.getAttribute("class")).not.toContain("ink-red")
  })

  it("rings the sign when the verdict is a person's", () => {
    const { container, rerender } = render(<VerdictMark verdict="give_it" judge="you" name="x" />)
    expect(container.firstElementChild?.className).toContain("outline")
    rerender(<VerdictMark verdict="give_it" judge={null} name="x" />)
    expect(container.firstElementChild?.className).not.toContain("outline")
  })

  it("has an icon per task, and one for the person's own tests", () => {
    expect(Object.keys(TASK_ICONS)).toEqual(["summarize", "triage", "act", "answer", "write", "plan", "code", "bank"])
  })
})
