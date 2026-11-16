import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))

import { WorkflowTitleControls } from "./workflow-title-controls"
import { useWorkflowViewStore } from "@/lib/store/workflow-view-store"

/** La ligne du titre du workflow (séance n°25, §3), et ce qu'elle laisse à l'en-tête d'une vue étroite (R161, M9). */
describe("WorkflowTitleControls", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
      })),
    })
    useWorkflowViewStore.setState({ controlsInView: false, live: { projectId: 3, state: "live", readAt: 1 } })
  })

  it("in the tab line: the live state, the density and the filter", () => {
    render(<WorkflowTitleControls projectId={3} />)
    expect(screen.getByRole("radiogroup", { name: "How much to show" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Filter/ })).toBeInTheDocument()
    expect(screen.getByText("Live")).toBeInTheDocument()
    // « Show all links » vit dans l'en-tête de la vue : ici, il poussait « Settings » hors de la ligne à 1440 px (R161, N9).
    expect(screen.queryByRole("button", { name: "Show all links" })).toBeNull()
  })

  it("when the view is narrow, they leave the tab line for the view's header, without the density on a list", () => {
    useWorkflowViewStore.setState({ controlsInView: true })
    const { container, unmount } = render(<WorkflowTitleControls projectId={3} />)
    expect(container).toBeEmptyDOMElement()
    unmount()
    render(<WorkflowTitleControls projectId={3} inHeader densities={false} />)
    expect(screen.queryByRole("radiogroup", { name: "How much to show" })).toBeNull()
    expect(screen.getByRole("button", { name: /^Filter/ })).toBeInTheDocument()
  })
})
