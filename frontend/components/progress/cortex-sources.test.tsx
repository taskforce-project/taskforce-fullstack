import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { CortexSources } from "./cortex-sources"
import { useCortexSourcesStore } from "@/lib/store/cortex-sources-store"

/** Ce que Cortex sait de l'espace (R125) : ses sources, comptées et datées ; des contenus, jamais des gestes (R57). */
describe("CortexSources", () => {
  const fetchSources = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useCortexSourcesStore.setState({ sources: null, fetchSources })
  })

  it("reads the sources of the workspace, and waits for them", () => {
    render(<CortexSources slug="acme" />)

    expect(fetchSources).toHaveBeenCalledWith("acme")
    expect(screen.getByText("Reading…")).toBeInTheDocument()
  })

  it("counts and dates each source, and says one that is empty", () => {
    useCortexSourcesStore.setState({
      sources: [
        { key: "projects", count: 4, changedAt: "2026-11-07T18:02:00" },
        { key: "notes", count: 0, changedAt: null },
      ],
    })
    render(<CortexSources slug="acme" />)

    expect(screen.getByRole("region", { name: "What it knows of this workspace" })).toBeInTheDocument()
    expect(screen.getByText("Projects")).toBeInTheDocument()
    expect(screen.getByText("4")).toBeInTheDocument()
    expect(screen.getByText("changed 7 Nov")).toBeInTheDocument()
    expect(screen.getByText("Notes")).toBeInTheDocument()
    expect(screen.getByText("None yet")).toBeInTheDocument()
  })
})
