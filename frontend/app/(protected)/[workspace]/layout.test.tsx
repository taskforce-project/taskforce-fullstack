import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

const route = vi.hoisted(() => ({ pathname: "/other/missions/42/verification" }))
// Le routeur de Next.js est le même d'un rendu à l'autre : le double aussi.
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock("next/navigation", () => ({
  useParams: () => ({ workspace: "other" }),
  usePathname: () => route.pathname,
  useRouter: () => nav,
}))

import WorkspaceLayout from "./layout"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

/**
 * L'espace dont la personne n'est pas membre (R161 M4 de #552) : sur la page de vérification d'un dossier, où mène un lien
 * reçu, le message neutre du dossier ; ailleurs, le retour à l'accueil, comme avant.
 */
const t = CONSTANTS_EN.verification

describe("WorkspaceLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWorkspaceStore.setState({ activeWorkspace: null, isLoading: false, setActiveBySlug: vi.fn(async () => null) })
  })

  it("la page de vérification d'un espace dont on n'est pas membre dit le message neutre, sans renvoi muet", async () => {
    route.pathname = "/other/missions/42/verification"
    render(<WorkspaceLayout><p>the page</p></WorkspaceLayout>)

    expect(await screen.findByText(t.denied)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: t.title })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.home })).toHaveAttribute("href", "/")
    expect(screen.queryByText("the page")).not.toBeInTheDocument()
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it("ailleurs, un espace introuvable ramène à l'accueil", async () => {
    route.pathname = "/other/projects"
    render(<WorkspaceLayout><p>the page</p></WorkspaceLayout>)

    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"))
    expect(screen.queryByText(t.denied)).not.toBeInTheDocument()
  })
})
