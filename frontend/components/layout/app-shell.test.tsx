import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

// La fenêtre seule : ses zones sont remplacées par leur nom, l'espace et ses listes ne partent pas sur le réseau.
const nav = vi.hoisted(() => ({ pathname: "/acme" }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock("@/components/layout/sidebar/app-sidebar", () => ({ AppSidebar: () => <nav aria-label="left bar" /> }))
vi.mock("@/components/layout/title-line", () => ({ TitleLine: () => <header aria-label="title line" /> }))
vi.mock("@/components/layout/conversation", () => ({ Conversation: () => <section aria-label="conversation" /> }))
vi.mock("@/components/layout/right-panel", () => ({ RightPanel: () => <aside aria-label="right panel" /> }))
vi.mock("@/components/agent/command-bar", () => ({ CommandBar: () => <div aria-label="folded composer" /> }))
vi.mock("@/components/command-palette", () => ({
  CommandPalette: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="search" /> : null),
}))
vi.mock("@/components/settings/settings-modal", () => ({ SettingsModal: () => null }))
vi.mock("@/components/dialogs/create-project-modal", () => ({ CreateProjectModal: () => null }))
vi.mock("@/components/tour/product-tour", () => ({ ProductTour: () => null }))
vi.mock("@/components/invitations/pending-invitations-banner", () => ({ PendingInvitationsBanner: () => null }))
vi.mock("@/components/account/account-deletion-banner", () => ({ AccountDeletionBanner: () => null }))
vi.mock("@/components/desktop/desktop-update-toast", () => ({ DesktopUpdateToast: () => null }))
vi.mock("@/lib/hooks/use-notifications-sync", () => ({ useNotificationsSync: vi.fn() }))
vi.mock("@/lib/hooks/use-missions-sync", () => ({ useMissionsSync: vi.fn() }))

import { AppShell } from "./app-shell"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useWindowStore } from "@/lib/store/window-store"

/** Une fenêtre de `width` pixels de large : les requêtes `min-width` de la fenêtre y répondent. */
function widthOf(width: number) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as MediaQueryList)
}

const cortex = useCortexStore.getState()
const projects = useProjectStore.getState()
const ai = useAiStatusStore.getState()

/** La fenêtre (R119) : `[barre de gauche] [conversation] [volet] [zone de droite]`, sous la ligne du haut. */
describe("AppShell : la fenêtre", () => {
  const enterWorkspace = vi.fn()
  const loadConversations = vi.fn().mockResolvedValue(true)
  const fetchProjects = vi.fn().mockResolvedValue([])
  const fetchStatus = vi.fn().mockResolvedValue(null)

  beforeEach(() => {
    vi.clearAllMocks()
    nav.pathname = "/acme"
    useCortexStore.setState({ ...cortex, open: false, enterWorkspace, loadConversations })
    useProjectStore.setState({ ...projects, fetchProjects })
    useAiStatusStore.setState({ ...ai, fetchStatus })
    useWindowStore.setState({ paneFull: false, rightOpen: true, rows: {}, searchOpen: false })
  })
  afterEach(() => vi.restoreAllMocks())

  it("shows only the conversation on the workspace home, the page kept out of sight", () => {
    widthOf(1440)
    render(<AppShell><p>home page</p></AppShell>)

    expect(screen.getByRole("navigation", { name: "left bar" })).toBeInTheDocument()
    expect(screen.getByLabelText("title line")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "conversation" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Dashboard" })).toBeNull()
    expect(screen.getByText("home page").parentElement).toHaveAttribute("hidden")
    expect(useCortexStore.getState().open).toBe(true)
  })

  it("loads what the window shows for the workspace", () => {
    widthOf(1440)
    render(<AppShell><p /></AppShell>)

    expect(enterWorkspace).toHaveBeenCalledWith("acme")
    expect(loadConversations).toHaveBeenCalledWith("acme")
    expect(fetchProjects).toHaveBeenCalledWith("acme")
    expect(fetchStatus).toHaveBeenCalled()
  })

  it("opens the route's page in the pane, beside the conversation, at half the width", () => {
    widthOf(1920)
    nav.pathname = "/acme/dashboard"
    render(<AppShell><p>dashboard page</p></AppShell>)

    const pane = screen.getByRole("region", { name: "Dashboard" })
    expect(pane).toHaveTextContent("dashboard page")
    expect(pane).toHaveAttribute("data-width", "beside")
    expect(screen.getByRole("region", { name: "conversation" })).toBeInTheDocument()
    expect(screen.queryByLabelText("folded composer")).toBeNull()
    expect(screen.getByLabelText("right panel")).toBeInTheDocument()
    expect(useWindowStore.getState().rightOpen).toBe(true)
  })

  it("folds the conversation into the composer when the pane takes the whole width", () => {
    widthOf(1920)
    nav.pathname = "/acme/dashboard"
    useWindowStore.setState({ paneFull: true })
    render(<AppShell><p>dashboard page</p></AppShell>)

    expect(screen.queryByRole("region", { name: "conversation" })).toBeNull()
    const pane = screen.getByRole("region", { name: "Dashboard" })
    expect(pane).toHaveAttribute("data-width", "full")
    expect(pane).toContainElement(screen.getByLabelText("folded composer"))
    expect(useCortexStore.getState().open).toBe(false)
  })

  it("keeps the narrow webapp as today: the pane full width, the composer at the bottom", () => {
    widthOf(390)
    nav.pathname = "/acme/my-work"
    render(<AppShell><p>my work</p></AppShell>)

    expect(screen.queryByRole("region", { name: "conversation" })).toBeNull()
    expect(screen.getByLabelText("folded composer")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Full width" })).toBeNull()
  })

  it.each([
    [1440, "/acme/dashboard", false],
    [1920, "/acme/dashboard", true],
    [1440, "/acme", true],
  ])("at %s px on %s, the right panel stays open: %s", (width, pathname, open) => {
    widthOf(width)
    nav.pathname = pathname
    render(<AppShell><p /></AppShell>)

    expect(useWindowStore.getState().rightOpen).toBe(open)
  })

  it("opens and closes the search with Ctrl+K, from anywhere", () => {
    widthOf(1440)
    render(<AppShell><p /></AppShell>)

    act(() => { fireEvent.keyDown(window, { key: "k", ctrlKey: true }) })
    expect(screen.getByRole("dialog", { name: "search" })).toBeInTheDocument()
    act(() => { fireEvent.keyDown(window, { key: "K", metaKey: true }) })
    expect(screen.queryByRole("dialog", { name: "search" })).toBeNull()
    act(() => { fireEvent.keyDown(window, { key: "k" }) })
    expect(useWindowStore.getState().searchOpen).toBe(false)
  })
})
