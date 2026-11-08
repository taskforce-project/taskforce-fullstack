import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

const params = vi.hoisted(() => ({ value: { workspace: "acme" } as Record<string, string | undefined> }))
vi.mock("next/navigation", () => ({ useParams: () => params.value }))
// Chaque partie a ses propres tests : ici, le volet les met dans l'ordre de R125, sur l'espace de l'adresse.
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

/** Le volet « Progress » (R125) : ce que l'agent sait, et comment il progresse ; ni activité, ni classement (R57). */
describe("ProgressPane", () => {
  beforeEach(() => {
    params.value = { workspace: "acme" }
  })

  it("shows its four parts in the order of R125, for the workspace of the address", () => {
    render(<ProgressPane />)

    expect(screen.getByText(/Nothing here comes from a vendor's benchmark/)).toBeInTheDocument()
    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "models of acme", "bank of acme", "improvements", "sources of acme",
    ])
  })

  it("shows nothing outside a workspace", () => {
    params.value = {}
    const { container } = render(<ProgressPane />)

    expect(container).toBeEmptyDOMElement()
  })
})
