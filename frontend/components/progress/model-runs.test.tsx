import { beforeEach, describe, expect, it } from "vitest"
import { render, screen, within } from "@testing-library/react"

import { ModelRuns } from "./model-runs"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"

const RUN = { runId: 2, model: "qwen3:14b", startedAt: "2026-11-09T10:04:00", total: 22, measured: 22, passed: 17, tooSlow: 3 }

/** « History » commence par les passages (R142) : ce que la personne a déjà fait, même sans banque de tests. */
describe("ModelRuns", () => {
  beforeEach(() => useModelBenchmarkStore.setState({ history: null }))

  it("shows nothing before the runs are read, or without a run", () => {
    const { container, rerender } = render(<ModelRuns />)
    expect(container).toBeEmptyDOMElement()

    useModelBenchmarkStore.setState({ history: [] })
    rerender(<ModelRuns />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows one line per run, the model, its score, and what was too slow in words", () => {
    useModelBenchmarkStore.setState({
      history: [RUN, { ...RUN, runId: 1, model: "qwen3:8b", measured: 5, passed: 5, tooSlow: 0 }],
    })
    render(<ModelRuns />)

    const rows = within(screen.getByRole("list", { name: "Runs of the models" })).getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText("qwen3:14b")).toBeInTheDocument()
    expect(within(rows[0]).getByLabelText("17 of 22 passed, 3 too slow")).toHaveTextContent("17/22")
    expect(within(rows[0]).getByText("17/22")).toHaveClass("text-foreground")
    expect(within(rows[1]).getByLabelText("5 of 22 passed")).toHaveClass("text-muted-foreground")
  })
})
