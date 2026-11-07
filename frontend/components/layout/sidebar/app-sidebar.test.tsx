import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

const nav = vi.hoisted(() => ({ pathname: "/acme/projects/3", push: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push: nav.push }),
}))
vi.mock("next/image", () => ({ default: () => null }))
// La personne, en bas, a son propre test (nav-user.test.tsx).
vi.mock("@/components/layout/sidebar/nav-user", () => ({ NavUser: () => <div>the person</div> }))

import { AppSidebar } from "./app-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import type { ConversationSummary } from "@/lib/api/ai-conversation-service"
import type { DeliveryRun } from "@/lib/api/delivery-service"
import type { Project } from "@/lib/api/project-service"
import type { AuthUser } from "@/lib/auth"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useCreateProjectStore } from "@/lib/store/create-project-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useNotificationStore, type Signal } from "@/lib/store/notification-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useUserStore } from "@/lib/store/user-store"
import { useWindowStore } from "@/lib/store/window-store"

const project = (id: number, name: string, patch: Partial<Project> = {}) =>
  ({ id, name, status: "ACTIVE", isFavorite: false, iconUrl: null, color: "bg-shape-blue", ...patch }) as Project

const talk = (id: number, title: string, projectId: number | null = null): ConversationSummary => ({
  id, title, updatedAt: null, messageCount: 2, totalTokens: 0, projectId,
})

const mission = (patch: Partial<DeliveryRun>): DeliveryRun => ({
  id: 1, issueId: 28, issueKey: "WEB-28", issueTitle: "Fix the footer", projectId: 3, projectName: "Website",
  providerKey: "claude-code", model: null, status: "RUNNING", summary: null, resultUrl: null, error: null, startedById: 7,
  createdAt: null, updatedAt: null, outcome: null, ...patch,
})

const signal = (type: Signal["type"]) => ({ id: type, type, read: false }) as Signal

const renderBar = () => render(<SidebarProvider><AppSidebar /></SidebarProvider>)

/** La barre de gauche (R121) : le travail et ses conversations, rangés par projet. */
describe("AppSidebar", () => {
  const newConversation = vi.fn()
  const openConversation = vi.fn().mockResolvedValue(true)
  const removeConversation = vi.fn().mockResolvedValue(true)
  const openCreateProject = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    nav.pathname = "/acme/projects/3"
    useProjectStore.setState({
      projects: [project(3, "Website"), project(4, "Mobile", { isFavorite: true }), project(5, "Old", { status: "ARCHIVED" })],
    })
    useCortexStore.setState({
      conversations: [talk(10, "Plan the launch", 3), talk(11, "Ideas"), talk(12, "Old talk", 5)],
      conversationId: null, sentAt: null, unread: false, open: true,
      newConversation, openConversation, removeConversation,
    })
    useDeliveryStore.setState({ workspaceRuns: [mission({}), mission({ id: 2, issueId: 29, startedById: 8 })] })
    useNotificationStore.setState({ signals: [signal("agentApproval"), signal("assigned")] })
    useUserStore.setState({ user: { id: "7" } as AuthUser })
    useWindowStore.setState({ searchOpen: false })
    useCreateProjectStore.setState({ openCreateProject })
  })

  it("starts with a new conversation, the search and what waits for the person", () => {
    renderBar()

    fireEvent.click(screen.getByRole("button", { name: "New conversation" }))
    expect(newConversation).toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    expect(useWindowStore.getState().searchOpen).toBe(true)

    const waiting = screen.getByRole("link", { name: "Waiting for you" })
    expect(waiting).toHaveAttribute("href", "/acme/inbox")
    expect(waiting.parentElement).toHaveTextContent("1")
  })

  it("lists the living projects, favorites first, each opening its board", () => {
    renderBar()

    const projects = screen.getAllByRole("link").filter((link) => /^\/acme\/projects\/\d+$/.test(link.getAttribute("href") ?? ""))
    expect(projects.map((link) => link.textContent)).toEqual(["Mobile", "Website"])
    expect(screen.getByRole("link", { name: "Website" })).toHaveAttribute("data-active", "true")
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/acme/projects")
    fireEvent.click(screen.getByRole("button", { name: "New project" }))
    expect(openCreateProject).toHaveBeenCalled()
  })

  // Une mission ouvre sa vue du travail dans le volet (R95, point 3).
  it("puts under each project its conversations and the person's running missions, each with its state", () => {
    renderBar()

    const website = screen.getByRole("link", { name: "Website" }).closest("li") as HTMLElement
    const footer = within(website).getByRole("link", { name: /WEB-28 Fix the footer/ })
    expect(footer).toHaveAttribute("href", "/acme/missions/1")
    expect(within(footer).getByRole("img", { name: "Working" })).toBeInTheDocument()
    expect(within(website).getByRole("button", { name: /Plan the launch/ })).toBeInTheDocument()
    // La mission d'une autre personne ne s'y montre pas (R57).
    expect(within(website).getAllByRole("link")).toHaveLength(2)

    fireEvent.click(footer)
    expect(nav.push).toHaveBeenCalledWith("/acme/missions/1", { scroll: false })
  })

  it("lists the conversations without a project, and those of a project it doesn't show", () => {
    renderBar()

    const loose = screen.getByText("Conversations").parentElement as HTMLElement
    expect(within(loose).getAllByRole("button").map((b) => b.textContent).filter(Boolean)).toEqual(["Ideas", "Old talk"])
  })

  it("opens a conversation, shows it, and deletes one", () => {
    useCortexStore.setState({ conversationId: 11, sentAt: Date.now(), open: false })
    renderBar()

    const ideas = screen.getByRole("button", { name: /Ideas/ })
    expect(within(ideas).getByRole("img", { name: "Working" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Plan the launch/ }))
    expect(openConversation).toHaveBeenCalledWith("acme", 10)
    expect(useCortexStore.getState().open).toBe(true)

    fireEvent.click(screen.getAllByRole("button", { name: "Delete this conversation" })[0])
    expect(removeConversation).toHaveBeenCalledWith("acme", 10)
  })

  it.each([
    [false, "Waiting for you"],
    [true, "Done"],
  ])("dots the open conversation by what Cortex did (answered while folded: %s)", (read, state) => {
    useCortexStore.setState({ conversationId: 11, unread: !read })
    renderBar()

    expect(within(screen.getByRole("button", { name: /Ideas/ })).getByRole("img", { name: state })).toBeInTheDocument()
  })

  it("shows the rest of a long list on demand", () => {
    useCortexStore.setState({ conversations: Array.from({ length: 12 }, (_, i) => talk(100 + i, `Talk ${i}`)) })
    renderBar()

    expect(screen.queryByRole("button", { name: /Talk 11/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "2 more" }))
    expect(screen.getByRole("button", { name: /Talk 11/ })).toBeInTheDocument()
  })

  it("keeps the other screens under More, folded", () => {
    nav.pathname = "/acme"
    renderBar()

    expect(screen.queryByRole("link", { name: "My work" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "More" }))
    expect(["My work", "Dashboard", "Roadmap", "Cycles", "Members", "Analytics"].map(
      (name) => screen.getByRole("link", { name }).getAttribute("href"),
    )).toEqual(["/acme/my-work", "/acme/dashboard", "/acme/roadmap", "/acme/cycles", "/acme/members", "/acme/analytics"])
  })

  // Sous `lg` dans la webapp, la barre est un tiroir (« Le dessin », séance n°18) : fermé, il s'ouvre par son bouton,
  // et un choix le referme.
  it("is a drawer when the window says so, closed by a choice", () => {
    render(<SidebarProvider mobile><SidebarTrigger aria-label="left bar" /><AppSidebar /></SidebarProvider>)
    expect(screen.queryByRole("button", { name: "New conversation" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "left bar" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("link", { name: "Waiting for you" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("unfolds More when one of its screens is open", () => {
    nav.pathname = "/acme/roadmap"
    renderBar()

    expect(screen.getByRole("link", { name: "Roadmap" })).toHaveAttribute("data-active", "true")
  })
})
