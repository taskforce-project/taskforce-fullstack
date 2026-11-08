import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const params = vi.hoisted(() => ({ value: { workspace: "acme" } as Record<string, string | undefined> }))
vi.mock("next/navigation", () => ({ useParams: () => params.value }))
// Chaque partie a ses propres tests : ici, le volet les range en onglets, sur l'espace de l'adresse.
vi.mock("@/components/progress/model-capability-table", () => ({
  ModelCapabilityTable: ({ slug }: { slug: string }) => <section aria-label={`models of ${slug}`} />,
}))
vi.mock("@/components/progress/bank-history", () => ({
  BankHistory: ({ slug }: { slug: string }) => <section aria-label={`bank of ${slug}`} />,
}))
vi.mock("@/components/progress/improvements", () => ({ Improvements: () => <section aria-label="improvements" /> }))
vi.mock("@/components/progress/cortex-sources", () => ({
  CortexSources: ({ slug }: { slug: string }) => <section aria-label={`sources of ${slug}`} />,
}))

import { ProgressPane } from "./progress-pane"
import type { AuthUser } from "@/lib/auth"
import { useUserStore } from "@/lib/store/user-store"
import { useWindowStore } from "@/lib/store/window-store"

const regions = () => screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))
const pick = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 })

/** Le volet « Progress » (R125, R130) : une question par onglet ; ni activité, ni classement (R57). */
describe("ProgressPane", () => {
  beforeEach(() => {
    params.value = { workspace: "acme" }
    useUserStore.setState({ user: { id: 7 } as unknown as AuthUser })
    useWindowStore.setState({ progressTabs: {} })
  })

  it("is a segmented control of one word each, on Models by default, for the workspace of the address", () => {
    render(<ProgressPane />)

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Models", "History", "Sources"])
    expect(screen.getByRole("tab", { name: "Models" })).toHaveAttribute("aria-selected", "true")
    expect(regions()).toEqual(["models of acme"])
  })

  it("History holds the bank's curve and what improved it; Sources what Cortex can read", () => {
    render(<ProgressPane />)

    pick("History")
    expect(regions()).toEqual(["bank of acme", "improvements"])
    pick("Sources")
    expect(regions()).toEqual(["sources of acme"])
  })

  it("says what each tab answers, one hover away", () => {
    render(<ProgressPane />)

    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-description", "How Cortex does over time, and what improved it.")
    expect(screen.queryByText(/Nothing here comes from a vendor's benchmark/)).not.toBeInTheDocument()
  })

  it("remembers the tab per person", () => {
    const { unmount } = render(<ProgressPane />)
    pick("Sources")
    expect(useWindowStore.getState().progressTabs).toEqual({ "7": "sources" })
    unmount()

    render(<ProgressPane />)
    expect(screen.getByRole("tab", { name: "Sources" })).toHaveAttribute("aria-selected", "true")
  })

  it("another person starts on Models; a tab that no longer exists falls back on it", () => {
    useWindowStore.setState({ progressTabs: { "8": "sources", "7": "gone" } })
    render(<ProgressPane />)

    expect(screen.getByRole("tab", { name: "Models" })).toHaveAttribute("aria-selected", "true")
  })

  it("shows nothing outside a workspace", () => {
    params.value = {}
    const { container } = render(<ProgressPane />)

    expect(container).toBeEmptyDOMElement()
  })
})
