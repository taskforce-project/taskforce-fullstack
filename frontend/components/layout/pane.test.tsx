import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const nav = vi.hoisted(() => ({ pathname: "/acme/projects/3", push: vi.fn(), back: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push: nav.push, back: nav.back }),
}))
// L'issue a ses propres tests (issue-pane.test.tsx) : ici, ce que le volet lui donne.
vi.mock("@/components/layout/issue-pane", () => ({
  IssuePane: ({ target, under, actions, onBack }: {
    target: { issueId: number | null; key: string | null }
    under: string
    actions: React.ReactNode
    onBack: () => void
  }) => (
    <div role="article" aria-label={`issue ${target.issueId ?? target.key} over ${under}`}>
      <button type="button" onClick={onBack}>back</button>
      {actions}
    </div>
  ),
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
    globalThis.history.replaceState(null, "", "/acme/projects/3?c=9")
  })
  afterEach(() => vi.restoreAllMocks())

  it("titles the pane with the project of the route, and holds its page", () => {
    render(<Pane route={{ section: "projects", projectId: 3 }} full={false} wide><p>the board</p></Pane>)

    const pane = screen.getByRole("region", { name: "Website" })
    expect(pane).toHaveTextContent("the board")
    expect(screen.getByRole("heading", { name: "Website" })).toBeInTheDocument()
  })

  it("takes the width the handle gave it beside the conversation, half of the place before any measure", () => {
    const { unmount } = render(<Pane route={{ section: "dashboard", projectId: null }} full={false} wide width={640}><p /></Pane>)
    expect(screen.getByRole("region", { name: "Dashboard" }).style.flexBasis).toBe("640px")

    unmount()
    render(<Pane route={{ section: "dashboard", projectId: null }} full={false} wide width={null}><p /></Pane>)
    expect(screen.getByRole("region", { name: "Dashboard" }).style.flexBasis).not.toBe("640px")
  })

  it("puts the pane in full width and back, beside the conversation", () => {
    render(<Pane route={{ section: "dashboard", projectId: null }} full={false} wide><p /></Pane>)

    fireEvent.click(screen.getByRole("button", { name: "Full width" }))
    expect(useWindowStore.getState().paneFull).toBe(true)
    expect(screen.getByRole("button", { name: "Beside the conversation" })).toHaveAttribute("aria-pressed", "true")
  })

  it("covers the conversation on a narrow screen, with a back arrow to it", () => {
    render(<Pane route={{ section: "dashboard", projectId: null }} full wide={false} composer={<p>composer</p>}><p /></Pane>)

    expect(screen.queryByRole("button", { name: "Full width" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull()
    expect(screen.getByRole("region", { name: "Dashboard" })).toHaveTextContent("composer")
    fireEvent.click(screen.getByRole("button", { name: "Back to the conversation" }))
    expect(nav.push).toHaveBeenCalledWith("/acme?c=9", { scroll: false })
  })

  it("closes to the workspace home, where only the conversation shows, the conversation kept", () => {
    render(<Pane route={{ section: "inbox", projectId: null }} full={false} wide><p /></Pane>)

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(nav.push).toHaveBeenCalledWith("/acme?c=9", { scroll: false })
  })

  // R120 : l'issue s'ouvre par-dessus le tableau, dans le même volet ; le tableau reste monté dessous, caché.
  it("opens the issue over the board, the board kept below out of reach, and goes back to it", () => {
    globalThis.history.replaceState(null, "", "/acme/projects/3?c=9&issue=34")
    render(
      <Pane route={{ section: "projects", projectId: 3 }} full={false} wide issue={{ projectId: 3, issueId: 34, key: null }}>
        <p>the board</p>
      </Pane>,
    )

    const issue = screen.getByRole("article", { name: "issue 34 over Board" })
    expect(issue).toContainElement(screen.getByRole("button", { name: "Full width" }))
    expect(screen.getByText("the board").parentElement).toHaveAttribute("aria-hidden", "true")
    expect(screen.queryByRole("heading", { name: "Website" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "back" }))
    expect(nav.push).toHaveBeenCalledWith("/acme/projects/3?c=9", { scroll: false })
  })

  it("names the screen under the issue: the list of a project, the screen of the workspace", () => {
    nav.pathname = "/acme/projects/3/list"
    const { rerender } = render(
      <Pane route={{ section: "projects", projectId: 3 }} full={false} wide issue={{ projectId: 3, issueId: null, key: "WEB-4" }}>
        <p />
      </Pane>,
    )
    expect(screen.getByRole("article", { name: "issue WEB-4 over List" })).toBeInTheDocument()

    nav.pathname = "/acme/inbox"
    rerender(
      <Pane route={{ section: "inbox", projectId: null }} full={false} wide issue={{ projectId: 3, issueId: 34, key: null }}>
        <p />
      </Pane>,
    )
    expect(screen.getByRole("article", { name: "issue 34 over Waiting for you" })).toBeInTheDocument()
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
