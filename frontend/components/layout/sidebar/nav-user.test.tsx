import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const theme = vi.hoisted(() => ({ theme: "system", setTheme: vi.fn() }))
const auth = vi.hoisted(() => ({ logout: vi.fn().mockResolvedValue(undefined) }))
const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/acme", useParams: () => ({ workspace: "acme" }) }))
vi.mock("next-themes", () => ({ useTheme: () => theme }))
vi.mock("@/lib/contexts/auth-context", () => ({
  useAuth: () => ({
    user: { id: "7", email: "ada@acme.dev", firstName: "Ada", lastName: "Lovelace", displayName: "Ada Lovelace" },
    logout: auth.logout,
  }),
}))
vi.mock("@/lib/analytics/consent", () => ({ analyticsConfigured: () => false, openConsentPreferences: vi.fn() }))

import { NavUser } from "./nav-user"
import { SidebarProvider } from "@/components/ui/sidebar"
import type { Workspace } from "@/lib/api/workspace-service"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

const ACME = { uuid: "u1", slug: "acme", name: "Acme", personal: true, logoUrl: null } as unknown as Workspace
const SHARED = { uuid: "u2", slug: "partner", name: "Partner", personal: false, logoUrl: null } as unknown as Workspace

async function openMenu() {
  const user = userEvent.setup()
  render(<SidebarProvider><NavUser /></SidebarProvider>)
  await user.click(screen.getByRole("button", { name: /Ada Lovelace/ }))
  return user
}

/** La personne, en bas de la barre de gauche (R121) : ce que la barre du haut et le menu du compte tenaient. */
describe("NavUser", () => {
  const openSettings = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ openSettings })
    useWorkspaceStore.setState({ workspaces: [ACME, SHARED], activeWorkspace: ACME, workspacesLoaded: true })
  })

  it("shows the person and the workspace they are in", () => {
    render(<SidebarProvider><NavUser /></SidebarProvider>)
    expect(screen.getByRole("button", { name: /Ada Lovelace/ })).toHaveTextContent("Acme")
  })

  it("opens the settings, the profile and the notifications", async () => {
    const user = await openMenu()
    await user.click(screen.getByRole("menuitem", { name: "Settings" }))
    expect(openSettings).toHaveBeenCalledWith()
  })

  it("holds the help, the version and the legal texts", async () => {
    await openMenu()

    expect(screen.getByRole("menuitem", { name: "Help" })).toHaveAttribute("href", "https://docs.taskforce-project.fr")
    expect(screen.getByRole("menuitem", { name: "Privacy" })).toHaveAttribute("href", "/privacy-policy")
    expect(screen.getByText(/^TaskForce /)).toBeInTheDocument()
  })

  // Les sous-menus s'ouvrent au clic ; sans mise en page (happy-dom), on y clique sans déplacer le pointeur.
  it("changes the workspace from its submenu", async () => {
    await openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Acme" }))
    expect(await screen.findByText("Your workspaces")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("menuitem", { name: /Partner/ }))
    // Son accueil, où la fenêtre reprend là où la personne a laissé cet espace (R123).
    expect(push).toHaveBeenCalledWith("/partner")
  })

  it("chooses the theme: light, dark, or the system's", async () => {
    await openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Theme" }))
    expect(await screen.findByRole("menuitemradio", { name: "System" })).toHaveAttribute("aria-checked", "true")
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Dark" }))
    expect(theme.setTheme).toHaveBeenCalledWith("dark")
  })

  it("signs out", async () => {
    const user = await openMenu()
    await user.click(screen.getByRole("menuitem", { name: "Log out" }))
    expect(auth.logout).toHaveBeenCalled()
  })
})
