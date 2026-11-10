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
import type { AssistantToolCall } from "@/lib/api/assistant-service"
import type { DeliveryRun } from "@/lib/api/delivery-service"
import type { Project } from "@/lib/api/project-service"
import type { AuthUser } from "@/lib/auth"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useUserStore } from "@/lib/store/user-store"
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

const RUN: DeliveryRun = {
  id: 100, issueId: 28, issueKey: "WEB-28", issueTitle: "Fix the footer", projectId: 3, projectName: "Website",
  providerKey: "claude-code", model: null, status: "RUNNING", summary: null, resultUrl: null, error: null, startedById: 7,
  createdAt: null, updatedAt: null, outcome: null,
}

const DELEGATED: AssistantToolCall = {
  name: "delegate_issue", status: "success", input: null, output: "Handed WEB-28 to Claude Code.", record: "rec",
  target: { issueId: 28, projectId: 3, key: "WEB-28", title: "Fix the footer", runId: 100 },
}

/** La ligne du haut (R119) : la barre de gauche, le titre de la conversation, « Board », « Work view », la zone de droite. */
describe("TitleLine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    widthOf(1440)
    nav.pathname = "/acme"
    useCortexStore.setState({ conversations: [], conversationId: null, turns: [], done: [] })
    useProjectStore.setState({ projects: [{ id: 3, name: "Website" } as Project] })
    useWindowStore.setState({ rightOpen: true, rightDrawer: false })
    useDeliveryStore.setState({ workspaceRuns: [] })
    useUserStore.setState({ user: { id: "7" } as AuthUser })
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

  // « Le dessin » : la vue du travail, à droite, quand une mission lancée depuis la conversation tourne.
  it("opens the work view of the mission this conversation started, while it runs", () => {
    useCortexStore.setState({ done: [DELEGATED] })
    useDeliveryStore.setState({ workspaceRuns: [RUN] })
    const { rerender } = renderLine()

    fireEvent.click(screen.getByRole("button", { name: "Work view" }))
    expect(nav.push).toHaveBeenCalledWith("/acme/missions/100", { scroll: false })

    // Déjà dans le volet, elle n'a plus de bouton ; finie, non plus.
    nav.pathname = "/acme/missions/100"
    rerender(<SidebarProvider><TitleLine /></SidebarProvider>)
    expect(screen.queryByRole("button", { name: "Work view" })).toBeNull()
    nav.pathname = "/acme"
    useDeliveryStore.setState({ workspaceRuns: [{ ...RUN, status: "DONE" }] })
    rerender(<SidebarProvider><TitleLine /></SidebarProvider>)
    expect(screen.queryByRole("button", { name: "Work view" })).toBeNull()
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
