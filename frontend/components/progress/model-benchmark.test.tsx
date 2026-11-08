import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { ModelBenchmark } from "./model-benchmark"
import type { BenchmarkCell, BenchmarkMatrix, BenchmarkModelDetail } from "@/lib/api/model-benchmark-service"
import { useEvalStore } from "@/lib/store/eval-store"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"

const TASKS = ["summarize", "triage", "act", "answer", "write", "plan", "code"].map((key) => ({
  key, label: key.charAt(0).toUpperCase() + key.slice(1), description: `What ${key} measures`, cases: 3, trial: ["summarize", "triage", "plan", "write"].includes(key),
}))

const cell = (task: string, verdict: BenchmarkCell["verdict"], judge: BenchmarkCell["judge"] = null): BenchmarkCell => ({
  task, verdict, passed: verdict === "give_it" ? 3 : 2, measured: verdict ? 3 : 0, total: 3, judge,
})

const MATRIX: BenchmarkMatrix = {
  provider: "OLLAMA", current: "qwen3:8b", suiteVersion: 1, cases: 21, tasks: TASKS,
  models: [
    {
      model: "qwen3:8b", current: true, lastRunAt: "2026-11-08T10:04:00", estimateSeconds: 660,
      cells: [cell("summarize", "give_it"), cell("triage", "with_review", "you"), cell("act", "not_yet"), cell("answer", null), cell("write", null), cell("plan", null), cell("code", null)],
    },
    { model: "qwen3:14b", current: false, lastRunAt: null, estimateSeconds: 1200, cells: TASKS.map((task) => cell(task.key, null)) },
  ],
}

const DETAIL: BenchmarkModelDetail = { model: "qwen3:8b", current: true, lastRunAt: "2026-11-08T10:04:00", cases: 21, tasks: [], trials: [] }

/** Le banc des modèles (R131) : la matrice, le geste principal, le fil d'avancement, l'ouverture d'une ligne. */
describe("ModelBenchmark", () => {
  const fetchMatrix = vi.fn()
  const fetchDetail = vi.fn()
  const run = vi.fn()
  const stop = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useModelBenchmarkStore.setState({
      matrix: MATRIX, details: { "qwen3:8b": DETAIL }, progress: null, blind: null, openModel: null, error: null, fetchMatrix, fetchDetail, run, stop,
    })
    useEvalStore.setState({ progress: null })
    useModelCapabilityStore.setState({ progress: null })
  })

  it("reads the matrix, the signs named on hover, the model in use first", () => {
    render(<ModelBenchmark slug="acme" />)

    expect(fetchMatrix).toHaveBeenCalledWith("acme")
    expect(screen.getByRole("columnheader", { name: "Summarize" })).toHaveAttribute("title", "Summarize")
    const rows = screen.getAllByRole("row")
    expect(within(rows[1]).getByRole("button", { name: /qwen3:8b/ })).toHaveAttribute("aria-expanded", "false")
    expect(within(rows[1]).getByLabelText("Cortex uses it")).toBeInTheDocument()
    expect(within(rows[1]).getByTitle("Summarize: Give it, 3 of 3 cases")).toBeInTheDocument()
    expect(within(rows[1]).getByTitle("Triage: With review, 2 of 3 cases · Your verdict")).toBeInTheDocument()
    expect(within(rows[1]).getByTitle("Answer: Not run")).toBeInTheDocument()
    expect(within(rows[2]).getByText("qwen3:14b")).toBeInTheDocument()
  })

  it("reads, says when there is no matrix yet or no model, and starts from one line and Run", () => {
    useModelBenchmarkStore.setState({ matrix: null })
    const { rerender } = render(<ModelBenchmark slug="acme" />)
    expect(screen.getByText("Reading…")).toBeInTheDocument()

    useModelBenchmarkStore.setState({ matrix: { ...MATRIX, models: [] } })
    rerender(<ModelBenchmark slug="acme" />)
    expect(screen.getByText("The AI of this instance serves no model right now.")).toBeInTheDocument()

    useModelBenchmarkStore.setState({
      matrix: { ...MATRIX, models: MATRIX.models.map((row) => ({ ...row, lastRunAt: null })) },
    })
    rerender(<ModelBenchmark slug="acme" />)
    expect(screen.getByText("No model has been through the benchmark yet.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("asks which models to run, with their last run and roughly how long, then runs them in the matrix's order", async () => {
    render(<ModelBenchmark slug="acme" />)

    fireEvent.click(screen.getByRole("button", { name: "Run" }))
    const picker = await screen.findByRole("list", { name: "Models to run" })
    expect(within(picker).getByText("Never")).toBeInTheDocument()
    expect(screen.getByText("About 11 min")).toBeInTheDocument()

    fireEvent.click(within(picker).getByRole("checkbox", { name: "qwen3:14b" }))
    expect(screen.getByText("About 31 min")).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole("button", { name: "Run" }).at(-1)!)

    expect(run).toHaveBeenCalledWith("acme", ["qwen3:8b", "qwen3:14b"])
  })

  it("does not start without a model", async () => {
    render(<ModelBenchmark slug="acme" />)
    fireEvent.click(screen.getByRole("button", { name: "Run" }))
    const picker = await screen.findByRole("list", { name: "Models to run" })
    fireEvent.click(within(picker).getByRole("checkbox", { name: "qwen3:8b" }))

    expect(screen.getAllByRole("button", { name: "Run" }).at(-1)).toBeDisabled()
  })

  it("waits for a measure or a replay that already holds the model", () => {
    useEvalStore.setState({ progress: { done: 0, total: 3, waitSeconds: null, stopping: false } })
    const { rerender } = render(<ModelBenchmark slug="acme" />)
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled()

    useEvalStore.setState({ progress: null })
    useModelCapabilityStore.setState({ progress: { model: "qwen3:8b", done: 0, total: 3, waitSeconds: null, stopping: false, auto: false } })
    rerender(<ModelBenchmark slug="acme" />)
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled()
  })

  it("shows a thin progress line, stops at a click, and says the wait", () => {
    useModelBenchmarkStore.setState({ progress: { model: "qwen3:8b", done: 3, total: 21, waitSeconds: null, stopping: false } })
    const { rerender } = render(<ModelBenchmark slug="acme" />)

    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "qwen3:8b: 3 of 21")
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3")
    expect(screen.getByText("3/21")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(stop).toHaveBeenCalled()

    useModelBenchmarkStore.setState({ progress: { model: "qwen3:8b", done: 3, total: 21, waitSeconds: 40, stopping: true } })
    rerender(<ModelBenchmark slug="acme" />)
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Next case in 40 s")
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled()
  })

  it("opens and closes a row's detail with a click, on the row or its name", async () => {
    render(<ModelBenchmark slug="acme" />)

    fireEvent.click(screen.getAllByRole("row")[1])
    await waitFor(() => expect(fetchDetail).toHaveBeenCalledWith("acme", "qwen3:8b"))
    expect(screen.getByText("Indicative, on 21 cases.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /qwen3:8b/ }))
    expect(screen.queryByText("Indicative, on 21 cases.")).not.toBeInTheDocument()
  })

  it("moves between rows with the arrows", () => {
    render(<ModelBenchmark slug="acme" />)
    const first = screen.getByRole("button", { name: /qwen3:8b/ })
    const second = screen.getByRole("button", { name: /qwen3:14b/ })

    first.focus()
    fireEvent.keyDown(first, { key: "ArrowDown" })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second, { key: "ArrowDown" })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: "ArrowUp" })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second, { key: "a" })
    expect(document.activeElement).toBe(second)
  })

  it("says an error", () => {
    useModelBenchmarkStore.setState({ error: "The AI is busy" })
    render(<ModelBenchmark slug="acme" />)
    expect(screen.getByText("The AI is busy")).toBeInTheDocument()
  })
})
