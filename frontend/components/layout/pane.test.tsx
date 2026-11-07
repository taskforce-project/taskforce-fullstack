import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const nav = vi.hoisted(() => ({ pathname: "/acme/projects/3", push: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push: nav.push }),
}))

import { Pane } from "./pane"
import type { Project } from "@/lib/api/project-service"
import { useProjectStore } from "@/lib/store/project-store"
import { useWindowStore } from "@/lib/store/window-store"

/** Le volet (R120) : la page de la route, son titre, la pleine largeur et la fermeture vers l'accueil de l'espace. */
describe("Pane", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nav.pathname = "/acme/projects/3"
    useProjectStore.setState({ projects: [{ id: 3, name: "Website" } as Project] })
    useWindowStore.setState({ paneFull: false })
  })
  afterEach(() => vi.restoreAllMocks())

  it("titles the pane with the project of the route, and holds its page", () => {
    render(<Pane route={{ section: "projects", projectId: 3 }} full={false} wide><p>the board</p></Pane>)

    const pane = screen.getByRole("region", { name: "Website" })
    expect(pane).toHaveTextContent("the board")
    expect(screen.getByRole("heading", { name: "Website" })).toBeInTheDocument()
  })

  it("puts the pane in full width and back, beside the conversation", () => {
    render(<Pane route={{ section: "dashboard", projectId: null }} full={false} wide><p /></Pane>)

    fireEvent.click(screen.getByRole("button", { name: "Full width" }))
    expect(useWindowStore.getState().paneFull).toBe(true)
    expect(screen.getByRole("button", { name: "Beside the conversation" })).toHaveAttribute("aria-pressed", "true")
  })

  it("has no full width toggle when the window is too narrow for the conversation beside it", () => {
    render(<Pane route={{ section: "dashboard", projectId: null }} full wide={false} composer={<p>composer</p>}><p /></Pane>)

    expect(screen.queryByRole("button", { name: "Full width" })).toBeNull()
    expect(screen.getByRole("region", { name: "Dashboard" })).toHaveTextContent("composer")
  })

  it("closes to the workspace home, where only the conversation shows", () => {
    render(<Pane route={{ section: "inbox", projectId: null }} full={false} wide><p /></Pane>)

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(nav.push).toHaveBeenCalledWith("/acme")
  })

  it("opens another screen at its top, without animation", () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo })
    const { rerender } = render(<Pane route={{ section: "dashboard", projectId: null }} full={false} wide><p /></Pane>)
    scrollTo.mockClear()

    nav.pathname = "/acme/my-work"
    rerender(<Pane route={{ section: "my-work", projectId: null }} full={false} wide><p /></Pane>)

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
  })
})
