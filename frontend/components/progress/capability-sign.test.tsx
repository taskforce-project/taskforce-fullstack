import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { CapabilitySign } from "./capability-sign"

/** Un signe par capacité (R130) : la forme dit l'état ; le nom et la note au survol et pour les lecteurs d'écran. */
describe("CapabilitySign", () => {
  it.each([
    ["passed", "circle", "currentColor"],
    ["failed", "circle", "none"],
  ] as const)("%s draws its circle", (sign, shape, fill) => {
    const { container } = render(<CapabilitySign sign={sign} name="Tools: 2/2" />)

    expect(container.querySelector(shape)).toHaveAttribute("fill", fill)
    expect(screen.getByRole("img", { name: "Tools: 2/2" })).toBeInTheDocument()
  })

  it("partly draws a ring and its half", () => {
    const { container } = render(<CapabilitySign sign="partly" name="Code: 1/2" />)

    expect(container.querySelector("circle")).toHaveAttribute("fill", "none")
    expect(container.querySelector("path")).toHaveAttribute("fill", "currentColor")
  })

  it("not measured is a dash", () => {
    const { container } = render(<CapabilitySign sign="none" name="Code: Not measured" />)

    expect(container.querySelector("circle")).toBeNull()
    expect(container.querySelector("path")).toHaveAttribute("stroke", "currentColor")
  })

  it("is 16 px wide", () => {
    const { container } = render(<CapabilitySign sign="passed" name="Tools: 2/2" />)

    expect(container.querySelector("[role=img]")?.className).toContain("size-4")
  })
})
