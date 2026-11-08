import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }))

import { ProgressLink } from "./progress-link"
import type { Workspace } from "@/lib/api/workspace-service"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

/** Le lien de Settings > AI vers « Progress » (R125) : les réglages se ferment, la conversation reste. */
describe("ProgressLink", () => {
  const closeSettings = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ closeSettings })
    useWorkspaceStore.setState({ activeWorkspace: { name: "Acme", slug: "acme" } as Workspace })
    window.history.pushState({}, "", "/acme/dashboard?c=12")
  })
  afterEach(() => window.history.pushState({}, "", "/"))

  it("opens Progress in the pane, keeps the conversation and closes the settings", () => {
    render(<ProgressLink />)

    const link = screen.getByRole("link", { name: "See what each model can do in Progress" })
    expect(link).toHaveAttribute("href", "/acme/progress")
    fireEvent.click(link)
    expect(closeSettings).toHaveBeenCalled()
    expect(nav.push).toHaveBeenCalledWith("/acme/progress?c=12", { scroll: false })
  })

  it("shows nothing outside a workspace", () => {
    useWorkspaceStore.setState({ activeWorkspace: null })
    const { container } = render(<ProgressLink />)

    expect(container).toBeEmptyDOMElement()
  })
})
