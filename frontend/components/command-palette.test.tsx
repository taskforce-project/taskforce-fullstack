import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspace: "acme" }),
}))
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme: vi.fn() }) }))
vi.mock("@/lib/api/assistant-service", () => ({ sendAssistantMessage: vi.fn() }))

import { CommandPalette } from "./command-palette"
import { useSettingsStore } from "@/lib/store/settings-store"

// cmdk fait défiler l'élément actif ; happy-dom n'implémente pas scrollIntoView.
Element.prototype.scrollIntoView ??= vi.fn()

/**
 * Réglages et profil s'ouvrent en place. Passer par les routes `/settings` ou `/profile` démontait la
 * page courante (le <main> de l'AppShell est indexé sur le chemin) et relançait tous ses chargements :
 * ouvrir les réglages depuis le dashboard en rejouait la rafale de requêtes.
 */
describe("CommandPalette - réglages", () => {
  beforeEach(() => {
    push.mockClear()
    useSettingsStore.setState({ open: false, section: "agents" })
  })

  it.each([
    // Sans section, le modal rouvre la dernière consultée (comportement du store).
    ["Go to Settings", "agents"],
    ["View my profile", "profile"],
  ])("« %s » ouvre le modal sur « %s » sans changer de page", async (label, section) => {
    const onOpenChange = vi.fn()
    render(<CommandPalette open onOpenChange={onOpenChange} />)

    await userEvent.click(screen.getByText(label))

    expect(useSettingsStore.getState()).toMatchObject({ open: true, section })
    expect(push).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("les autres entrées de navigation changent toujours de page", async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />)

    await userEvent.click(screen.getByText("Go to Projects"))

    expect(push).toHaveBeenCalledWith("/acme/projects")
    expect(useSettingsStore.getState().open).toBe(false)
  })
})
