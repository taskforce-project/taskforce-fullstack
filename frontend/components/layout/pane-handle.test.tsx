import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { PaneHandle } from "./pane-handle"

/** La poignée entre la conversation et le volet (« Le dessin », séance n°18) : à la souris, au clavier, au double-clic. */
describe("PaneHandle", () => {
  const onDrag = vi.fn()
  const onCommit = vi.fn()
  const onReset = vi.fn()

  const show = (width: number | null = 600, max = 900) =>
    render(<PaneHandle width={width} max={max} onDrag={onDrag} onCommit={onCommit} onReset={onReset} />)

  beforeEach(() => vi.clearAllMocks())

  it("is a focusable separator that says the pane's width and its bounds", () => {
    show()

    const handle = screen.getByRole("separator", { name: "Resize the pane" })
    expect(handle).toHaveAttribute("tabindex", "0")
    expect(handle).toHaveAttribute("aria-orientation", "vertical")
    expect(handle).toHaveAttribute("aria-valuenow", "600")
    expect(handle).toHaveAttribute("aria-valuemin", "480")
    expect(handle).toHaveAttribute("aria-valuemax", "900")
  })

  it.each([
    [{ key: "ArrowLeft" }, 616],
    [{ key: "ArrowRight" }, 584],
    [{ key: "ArrowLeft", shiftKey: true }, 664],
    [{ key: "ArrowRight", shiftKey: true }, 536],
    [{ key: "Home" }, 480],
    [{ key: "End" }, 900],
  ])("moves with the keyboard: %o gives %s px", (key, width) => {
    show()
    fireEvent.keyDown(screen.getByRole("separator"), key)
    expect(onCommit).toHaveBeenCalledWith(width)
  })

  it("stays inside its bounds, and ignores the other keys", () => {
    show(890)
    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowLeft", shiftKey: true })
    expect(onCommit).toHaveBeenCalledWith(900)
    fireEvent.keyDown(screen.getByRole("separator"), { key: "a" })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it("follows the pointer, the pane growing to the left, and keeps the width at the end", () => {
    show()
    const handle = screen.getByRole("separator")

    fireEvent.pointerDown(handle, { button: 0, clientX: 500, pointerId: 1 })
    expect(handle).toHaveAttribute("data-dragging", "true")
    fireEvent.pointerMove(handle, { clientX: 450, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 450, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 100, pointerId: 1 })

    expect(onDrag.mock.calls).toEqual([[650], [900]])
    expect(onCommit).toHaveBeenCalledWith(900)
    expect(handle).not.toHaveAttribute("data-dragging")
  })

  it("keeps nothing from a click without a move: half of the place stays half", () => {
    show()
    const handle = screen.getByRole("separator")

    fireEvent.pointerDown(handle, { button: 0, clientX: 500, pointerId: 1 })
    expect(handle).toHaveFocus()
    fireEvent.pointerUp(handle, { clientX: 500, pointerId: 1 })

    expect(onCommit).not.toHaveBeenCalled()
    expect(onDrag).toHaveBeenCalledWith(null)
  })

  it("ignores a move without a press, another button, and every gesture before the width is measured", () => {
    const { unmount } = show()
    const handle = screen.getByRole("separator")
    fireEvent.pointerMove(handle, { clientX: 300 })
    fireEvent.pointerUp(handle, { clientX: 300 })
    fireEvent.pointerDown(handle, { button: 2, clientX: 300 })
    fireEvent.pointerMove(handle, { clientX: 200 })
    unmount()

    show(null)
    const unmeasured = screen.getByRole("separator")
    expect(unmeasured).toHaveAttribute("aria-valuenow", "480")
    fireEvent.pointerDown(unmeasured, { button: 0, clientX: 300 })
    fireEvent.keyDown(unmeasured, { key: "ArrowLeft" })
    expect(onDrag).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("gives the pane half of the place again on a double-click", () => {
    show()
    fireEvent.doubleClick(screen.getByRole("separator"))
    expect(onReset).toHaveBeenCalled()
  })

  it("leaves the maximum unsaid before the place is measured", () => {
    show(null, Number.POSITIVE_INFINITY)
    expect(screen.getByRole("separator")).not.toHaveAttribute("aria-valuemax")
  })
})
