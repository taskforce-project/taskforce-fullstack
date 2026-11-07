import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const nav = vi.hoisted(() => ({ pathname: "/acme", push: vi.fn() }))
const desktop = vi.hoisted(() => ({ setTitleBarTheme: vi.fn(), onNavigate: vi.fn(() => () => {}) }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push: nav.push }),
}))
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }))
// L'app desktop : la ligne du haut est la barre de titre, les boutons du système s'y posent.
vi.mock("@/lib/desktop", () => ({ IS_DESKTOP: true, desktopBridge: () => desktop }))

import { TitleLine } from "./title-line"
import { SidebarProvider } from "@/components/ui/sidebar"
import type { Project } from "@/lib/api/project-service"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useWindowStore } from "@/lib/store/window-store"

const renderLine = () => render(<SidebarProvider><TitleLine /></SidebarProvider>)

/** Une fenêtre de `width` pixels de large : les requêtes `min-width` y répondent. */
function widthOf(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
      media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  })
}

/** La ligne du haut (R119) : la barre de gauche, le titre de la conversation, « Board », la zone de droite. */
describe("TitleLine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    widthOf(1440)
    nav.pathname = "/acme"
    useCortexStore.setState({ conversations: [], conversationId: null })
    useProjectStore.setState({ projects: [{ id: 3, name: "Website" } as Project] })
    useWindowStore.setState({ rightOpen: true, rightDrawer: false })
  })
  afterEach(() => vi.restoreAllMocks())

  it("titles a new conversation, and offers no board without a project in view", () => {
    renderLine()

    expect(screen.getByText("New conversation")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show or hide the sidebar" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Board" })).toBeNull()
  })

  it("opens the board of the conversation's project", () => {
    useCortexStore.setState({
      conversationId: 5,
      conversations: [{ id: 5, title: "Plan the launch", updatedAt: null, messageCount: 2, totalTokens: 0, projectId: 3 }],
    })
    renderLine()

    expect(screen.getByText("Plan the launch")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Board" }))
    expect(nav.push).toHaveBeenCalledWith("/acme/projects/3", { scroll: false })
  })

  it.each([
    ["/acme/projects/3/list", true],
    ["/acme/projects/3", false],
  ])("on %s, offers the board of the project in the pane: %s", (pathname, offered) => {
    nav.pathname = pathname
    renderLine()

    expect(screen.queryByRole("button", { name: "Board" }) !== null).toBe(offered)
  })

  it("folds and unfolds the right panel", () => {
    renderLine()

    const toggle = screen.getByRole("button", { name: "Show or hide what surrounds the conversation" })
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(toggle)
    expect(useWindowStore.getState().rightOpen).toBe(false)
  })

  it("opens the right panel's drawer under lg", () => {
    widthOf(800)
    renderLine()

    const toggle = screen.getByRole("button", { name: "Show or hide what surrounds the conversation" })
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(toggle)
    expect(useWindowStore.getState()).toMatchObject({ rightDrawer: true, rightOpen: true })
  })

  it("is the desktop app's title bar: the system buttons take the theme, on 52 px", () => {
    const { container } = renderLine()

    expect(desktop.setTitleBarTheme).toHaveBeenCalledWith(true, 52)
    expect(container.querySelector("header")).toHaveClass("desktop-titlebar")
    expect(desktop.onNavigate).toHaveBeenCalled()
  })
})
