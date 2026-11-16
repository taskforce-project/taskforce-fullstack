import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useSyncExternalStore } from "react"

const address = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  return { listeners, notify: () => listeners.forEach((listener) => listener()) }
})
vi.mock("next/navigation", () => ({
  useSearchParams: () => {
    const search = useSyncExternalStore(
      (listener) => { address.listeners.add(listener); return () => address.listeners.delete(listener) },
      () => globalThis.location.search,
      () => "",
    )
    return new URLSearchParams(search)
  },
}))

import { DensitySwitch, FilterMenu, LegendDialog, LinksSwitch, LiveIndicator } from "./workflow-controls"
import { WorkflowTitleControls } from "./workflow-title-controls"
import type { AuthUser } from "@/lib/auth"
import { useUserStore } from "@/lib/store/user-store"
import { useWorkflowViewStore } from "@/lib/store/workflow-view-store"

/** Ce que la ligne du titre du workflow porte (séance n°25, §3, §10). */
describe("the workflow's title line", () => {
  beforeEach(() => {
    const real = History.prototype.replaceState
    globalThis.history.replaceState = function (...args: Parameters<History["replaceState"]>) {
      real.apply(globalThis.history, args)
      address.notify()
    }
    globalThis.history.replaceState(null, "", "/acme/projects/3/workflow")
    useUserStore.setState({ user: { id: "7" } as AuthUser })
    useWorkflowViewStore.setState({ densities: {}, inspectorWidths: {}, legendOpen: false, live: null })
    Object.defineProperty(globalThis.window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true, media: query, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
      })),
    })
  })

  it("says the live state in a dot and a word, and nothing before the first connection", () => {
    const { rerender, container } = render(<LiveIndicator state="connecting" readAt={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<LiveIndicator state="live" readAt={null} />)
    expect(screen.getByRole("status")).toHaveTextContent("Live")
    rerender(<LiveIndicator state="reconnecting" readAt={null} />)
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting…")
    rerender(<LiveIndicator state="offline" readAt={new Date(2026, 10, 13, 9, 5).getTime()} />)
    expect(screen.getByRole("status")).toHaveTextContent("Offline. Showing 09:05.")
    rerender(<LiveIndicator state="offline" readAt={null} />)
    expect(screen.getByRole("status")).toHaveTextContent("Offline. Showing --:--.")
  })

  it("chooses the density in a segmented control", () => {
    const onChange = vi.fn()
    render(<DensitySwitch value="plan" onChange={onChange} />)
    expect(screen.getByRole("radiogroup", { name: "How much to show" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Plan" })).toHaveAttribute("aria-checked", "true")
    fireEvent.click(screen.getByRole("radio", { name: "Summary" }))
    expect(onChange).toHaveBeenCalledWith("summary")
  })

  it("filters on one state at a time, and shows everything again", async () => {
    const onChange = vi.fn()
    const { rerender } = render(<FilterMenu value={null} onChange={onChange} />)
    await userEvent.click(screen.getByRole("button", { name: "Filter" }))
    // Missing vient avec les processus (W5) : le filtre ne l'offre pas encore (R161, L5).
    expect(screen.queryByRole("menuitem", { name: /Missing/ })).toBeNull()
    await userEvent.click(screen.getByRole("menuitem", { name: /Blocked/ }))
    expect(onChange).toHaveBeenCalledWith("blocked")
    rerender(<FilterMenu value="blocked" onChange={onChange} />)
    await userEvent.click(screen.getByRole("button", { name: "Filter: Blocked" }))
    await userEvent.click(screen.getByRole("menuitem", { name: "Show everything" }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it("Show all links is a switch, off by default", () => {
    const onChange = vi.fn()
    const { rerender } = render(<LinksSwitch value={false} onChange={onChange} />)
    const button = screen.getByRole("button", { name: "Show all links" })
    expect(button).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(button)
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(<LinksSwitch value onChange={onChange} />)
    expect(screen.getByRole("button", { name: "Show all links" })).toHaveAttribute("aria-pressed", "true")
  })

  it("the legend shows the states the view produces today, each with its mark, its word and its meaning", () => {
    useWorkflowViewStore.setState({ legendOpen: true })
    render(<LegendDialog />)
    const dialog = screen.getByRole("dialog", { name: "Legend" })
    // Neuf des dix : Missing vient avec les processus (W5), et ne s'offre pas encore.
    expect(dialog.querySelectorAll("li")).toHaveLength(9)
    expect(screen.queryByText("A document or an answer is expected from someone.")).toBeNull()
    // Les liens et « Show all links » (décision du CEO, 16/11/2026) ; les touches ne se disent qu'au pied de Ctrl+K (R134),
    // et « Stuck » n'existe pas encore : la légende n'en parle pas (R161, N10).
    expect(screen.getByText("Links")).toBeInTheDocument()
    expect(screen.getByText(/Show all links draws every link between the cards on screen, 200 at most/)).toBeInTheDocument()
    expect(screen.getByText("The last try failed and nobody tried again.")).toBeInTheDocument()
    expect(dialog.textContent).not.toMatch(/\([A-Z?]\)|Stuck/)
    expect(screen.getByText("Waits for you: a request to decide, or a result to review.")).toBeInTheDocument()
    expect(screen.getAllByRole("img").map((mark) => mark.getAttribute("aria-label"))).toContain("Stopped")
  })

  it("in the title line: the live state of this project, the density remembered for the person, the filter in the address", () => {
    useWorkflowViewStore.setState({ live: { projectId: 3, state: "live", readAt: 1 } })
    render(<WorkflowTitleControls projectId={3} />)
    expect(screen.getByRole("status")).toHaveTextContent("Live")
    fireEvent.click(screen.getByRole("radio", { name: "Detail" }))
    expect(useWorkflowViewStore.getState().densities["7"]).toBe("detail")
    expect(globalThis.location.search).toBe("?view=detail")
    fireEvent.click(screen.getByRole("radio", { name: "Plan" }))
    expect(globalThis.location.search).toBe("")
  })

  it("says nothing of another project's live state", () => {
    useWorkflowViewStore.setState({ live: { projectId: 4, state: "live", readAt: 1 } })
    render(<WorkflowTitleControls projectId={3} />)
    expect(screen.queryByRole("status")).toBeNull()
  })
})
