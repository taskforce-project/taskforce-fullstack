import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { Dialog, DialogContent, DialogDescription, DialogTitle, type DialogSize } from "./dialog"

function open(size?: DialogSize) {
  render(
    <Dialog open>
      <DialogContent size={size}>
        <DialogTitle>Title</DialogTitle>
        <DialogDescription>Text</DialogDescription>
      </DialogContent>
    </Dialog>,
  )
  return screen.getByRole("dialog")
}

/** Les trois largeurs d'un dialogue (R133) : 420, 560 et 720 px. */
describe("DialogContent", () => {
  it.each([
    ["sm", "sm:max-w-[420px]"],
    ["md", "sm:max-w-[560px]"],
    ["lg", "sm:max-w-[720px]"],
  ] as const)("%s is %s wide", (size, width) => {
    expect(open(size).className).toContain(width)
  })

  it("is 560 px by default", () => {
    expect(open().className).toContain("sm:max-w-[560px]")
  })

  it("stays still under reduced motion", () => {
    expect(open().className).toContain("motion-reduce:animate-none")
  })
})
