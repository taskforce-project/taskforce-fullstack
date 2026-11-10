import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { CortexSources } from "./cortex-sources"
import { useCortexSourcesStore } from "@/lib/store/cortex-sources-store"
import { useCreateProjectStore } from "@/lib/store/create-project-store"

/** Ce que Cortex sait de l'espace (R125, R129) : ses sources, comptées et datées ; des contenus, jamais des gestes (R57). */
describe("CortexSources", () => {
  const fetchSources = vi.fn()
  const openCreateProject = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useCortexSourcesStore.setState({ sources: null, failed: false, fetchSources })
    useCreateProjectStore.setState({ openCreateProject })
  })

  it("reads the sources of the workspace, waits for them, and says a read that failed", () => {
    const { rerender } = render(<CortexSources slug="acme" />)

    expect(fetchSources).toHaveBeenCalledWith("acme")
    expect(screen.getByText("Reading…")).toBeInTheDocument()

    useCortexSourcesStore.setState({ failed: true })
    rerender(<CortexSources slug="acme" />)
    expect(screen.getByText(/TaskForce couldn't read this part/)).toBeInTheDocument()
  })

  it("gives one line per source: its name, its count and its day; the sentence is on hover", () => {
    useCortexSourcesStore.setState({
      sources: [
        { key: "projects", count: 4, changedAt: "2026-11-07T18:02:00" },
        { key: "notes", count: 0, changedAt: null },
      ],
    })
    render(<CortexSources slug="acme" />)

    expect(screen.getByText("Projects")).toBeInTheDocument()
    expect(screen.getByText("4")).toBeInTheDocument()
    expect(screen.getByText("7 Nov")).toBeInTheDocument()
    expect(screen.getByLabelText("changed 7 Nov")).toBeInTheDocument()
    expect(screen.getByText("Notes")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
  })

  it("an empty space is one line and the next action", () => {
    useCortexSourcesStore.setState({
      sources: [{ key: "projects", count: 0, changedAt: null }, { key: "issues", count: 0, changedAt: null }],
    })
    render(<CortexSources slug="acme" />)

    expect(screen.getByText("Nothing to read here yet.")).toBeInTheDocument()
    expect(screen.queryByText("Projects")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Create a project" }))
    expect(openCreateProject).toHaveBeenCalled()
  })
})
