import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

// La fenêtre seule : ses zones sont remplacées par leur nom, l'espace et ses listes ne partent pas sur le réseau.
const nav = vi.hoisted(() => ({ pathname: "/acme", search: "", push: vi.fn(), replace: vi.fn(), back: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useParams: () => ({ workspace: "acme" }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: nav.back }),
}))
vi.mock("@/components/layout/sidebar/app-sidebar", () => ({ AppSidebar: () => <nav aria-label="left bar" /> }))
vi.mock("@/components/layout/title-line", () => ({ TitleLine: () => <header aria-label="title line" /> }))
vi.mock("@/components/layout/conversation", () => ({ Conversation: () => <section aria-label="conversation" /> }))
vi.mock("@/components/layout/right-panel", () => ({ RightPanel: () => <aside aria-label="right panel" /> }))
vi.mock("@/components/layout/issue-pane", () => ({
  IssuePane: ({ target }: { target: { issueId: number } }) => <div role="article" aria-label={`issue ${target.issueId}`} />,
}))
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

/** La place de la conversation et du volet, telle que la mesure le `ResizeObserver`, après le rendu comme dans un navigateur. */
function spaceOf(width: number) {
  const Observer = globalThis.ResizeObserver
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe() {
      setTimeout(() => this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver), 0)
    }
    disconnect() {}
    unobserve() {}
  })
  return () => vi.stubGlobal("ResizeObserver", Observer)
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
  const openConversation = vi.fn().mockResolvedValue(true)

  beforeEach(() => {
    vi.clearAllMocks()
    nav.pathname = "/acme"
    nav.search = ""
    globalThis.history.replaceState(null, "", "/acme")
    useCortexStore.setState({ ...cortex, open: false, conversationId: null, enterWorkspace, loadConversations, openConversation })
    useProjectStore.setState({ ...projects, fetchProjects })
    useAiStatusStore.setState({ ...ai, fetchStatus })
    useWindowStore.setState({ paneFull: false, paneWidth: null, rightOpen: true, rightDrawer: false, rows: {}, searchOpen: false })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("shows only the conversation on the workspace home, the page kept out of sight", () => {
    widthOf(1440)
    render(<AppShell><p>home page</p></AppShell>)

    expect(screen.getByRole("navigation", { name: "left bar" })).toBeInTheDocument()
    expect(screen.getByLabelText("title line")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "conversation" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Dashboard" })).toBeNull()
    expect(screen.queryByRole("separator")).toBeNull()
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

  it("opens the route's page in the pane, beside the conversation, a handle between them", () => {
    widthOf(1920)
    nav.pathname = "/acme/dashboard"
    render(<AppShell><p>dashboard page</p></AppShell>)

    const pane = screen.getByRole("region", { name: "Dashboard" })
    expect(pane).toHaveTextContent("dashboard page")
    expect(pane).toHaveAttribute("data-width", "beside")
    expect(screen.getByRole("region", { name: "conversation" })).toBeInTheDocument()
    expect(screen.getByRole("separator", { name: "Resize the pane" })).toBeInTheDocument()
    expect(screen.queryByLabelText("folded composer")).toBeNull()
    expect(screen.getByLabelText("right panel")).toBeInTheDocument()
    expect(useWindowStore.getState().rightOpen).toBe(true)
  })

  it("gives the pane half of the measured place, or the width the person chose", async () => {
    widthOf(1920)
    const restore = spaceOf(1344)
    nav.pathname = "/acme/dashboard"
    const { unmount } = render(<AppShell><p /></AppShell>)

    await waitFor(() => expect(screen.getByRole("region", { name: "Dashboard" }).style.flexBasis).toBe("672px"))
    unmount()

    useWindowStore.setState({ paneWidth: 800 })
    render(<AppShell><p /></AppShell>)
    await waitFor(() => expect(screen.getByRole("region", { name: "Dashboard" }).style.flexBasis).toBe("800px"))
    restore()
  })

  it("falls to full width when the conversation can't keep 360 px beside the pane's 480", async () => {
    widthOf(1920)
    const restore = spaceOf(800)
    nav.pathname = "/acme/dashboard"
    render(<AppShell><p /></AppShell>)

    await waitFor(() => expect(screen.getByRole("region", { name: "Dashboard" })).toHaveAttribute("data-width", "full"))
    expect(screen.queryByRole("region", { name: "conversation" })).toBeNull()
    expect(screen.queryByRole("separator")).toBeNull()
    expect(screen.getByLabelText("folded composer")).toBeInTheDocument()
    restore()
  })

  it("remembers the width given with the handle, and half of the place again on a double-click", async () => {
    widthOf(1920)
    const restore = spaceOf(1344)
    nav.pathname = "/acme/dashboard"
    render(<AppShell><p /></AppShell>)
    const handle = screen.getByRole("separator", { name: "Resize the pane" })
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "672"))

    fireEvent.keyDown(handle, { key: "ArrowLeft" })
    expect(useWindowStore.getState().paneWidth).toBe(688)
    fireEvent.doubleClick(handle)
    expect(useWindowStore.getState().paneWidth).toBeNull()
    restore()
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

  it("keeps the narrow webapp as before: the pane full width, the composer at the bottom", () => {
    widthOf(390)
    nav.pathname = "/acme/my-work"
    render(<AppShell><p>my work</p></AppShell>)

    expect(screen.queryByRole("region", { name: "conversation" })).toBeNull()
    expect(screen.getByLabelText("folded composer")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Full width" })).toBeNull()
    expect(screen.getByRole("button", { name: "Back to the conversation" })).toBeInTheDocument()
  })

  // R120 : l'issue de l'adresse s'ouvre dans le volet, par-dessus l'écran qui la liste.
  it("opens the issue of the address in the pane, over its board", () => {
    widthOf(1920)
    nav.pathname = "/acme/projects/3"
    nav.search = "issue=34"
    render(<AppShell><p>the board</p></AppShell>)

    expect(screen.getByRole("article", { name: "issue 34" })).toBeInTheDocument()
    expect(screen.getByText("the board").parentElement).toHaveAttribute("aria-hidden", "true")
  })

  // « Le dessin » : Échap referme ce qui vient de s'ouvrir, une chose à la fois.
  it("closes with Escape the answer unfolded in full width, then the issue, back to its board", () => {
    widthOf(1920)
    nav.pathname = "/acme/projects/3"
    nav.search = "c=9&issue=34"
    globalThis.history.replaceState(null, "", "/acme/projects/3?c=9&issue=34")
    useWindowStore.setState({ paneFull: true })
    render(<AppShell><p /></AppShell>)
    act(() => { useCortexStore.setState({ open: true }) })

    act(() => { fireEvent.keyDown(window, { key: "Escape" }) })
    expect(useCortexStore.getState().open).toBe(false)
    expect(nav.push).not.toHaveBeenCalled()

    act(() => { fireEvent.keyDown(window, { key: "Escape" }) })
    expect(nav.push).toHaveBeenCalledWith("/acme/projects/3?c=9", { scroll: false })
  })

  it("never closes the issue under a typing cursor, nor after a dialog took the key", () => {
    widthOf(1920)
    nav.pathname = "/acme/projects/3"
    nav.search = "issue=34"
    render(<AppShell><input aria-label="comment" /></AppShell>)

    fireEvent.keyDown(screen.getByRole("textbox", { name: "comment", hidden: true }), { key: "Escape" })
    const taken = new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    taken.preventDefault()
    act(() => { window.dispatchEvent(taken) })

    expect(nav.push).not.toHaveBeenCalled()
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
