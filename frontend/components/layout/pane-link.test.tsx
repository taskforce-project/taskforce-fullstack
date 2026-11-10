import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { PaneLink } from "./pane-link"

/** Un lien qui ouvre un volet (R120) : un clic simple par la fenêtre, un autre onglet comme tout lien. */
describe("PaneLink", () => {
  it("opens its pane through the window on a plain click, its address kept for sharing", () => {
    const open = vi.fn()
    render(<PaneLink href="/acme/projects/3?issue=34" open={open} title="Open WEB-34" aria-label="WEB-34">WEB-34</PaneLink>)

    const link = screen.getByRole("link", { name: "WEB-34" })
    expect(link).toHaveAttribute("href", "/acme/projects/3?issue=34")
    expect(link).toHaveAttribute("title", "Open WEB-34")
    fireEvent.click(link)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ ctrlKey: true }],
    [{ metaKey: true }],
    [{ shiftKey: true }],
    [{ altKey: true }],
    [{ button: 1 }],
  ])("leaves %o to the browser: another tab or window", (modifier) => {
    const open = vi.fn()
    render(<PaneLink href="/acme/missions/1" open={open}>mission</PaneLink>)

    fireEvent.click(screen.getByRole("link", { name: "mission" }), modifier)
    expect(open).not.toHaveBeenCalled()
  })
})
