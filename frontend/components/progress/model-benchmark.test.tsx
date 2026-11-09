import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ModelBenchmark } from "./model-benchmark"
import type { BenchmarkCell, BenchmarkMatrix, BenchmarkModelDetail, BenchmarkModelFacts } from "@/lib/api/model-benchmark-service"
import { useEvalStore } from "@/lib/store/eval-store"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"

const TASKS = ["summarize", "triage", "act", "answer", "write", "plan", "code"].map((key) => ({
  key, label: key.charAt(0).toUpperCase() + key.slice(1), description: `What ${key} measures`, cases: 3, trial: ["summarize", "triage", "plan", "write"].includes(key),
}))

const cell = (task: string, verdict: BenchmarkCell["verdict"], judge: BenchmarkCell["judge"] = null, tooSlow = 0): BenchmarkCell => ({
  task, verdict, passed: verdict === "give_it" ? 3 : 2, measured: verdict ? 3 : 0, total: 3, judge, tooSlow,
})

const FACTS: BenchmarkModelFacts = {
  family: "qwen3", parameters: "8.2B", diskBytes: 5_225_388_164, contextWindow: 40960, tools: true, chat: true,
  memoryBytes: 6.74e9, gpuBytes: 6.17e9, loadProblem: null,
}

const MATRIX: BenchmarkMatrix = {
  provider: "OLLAMA", current: "qwen3:8b", suiteVersion: 1, cases: 21, tasks: TASKS,
  models: [
    {
      model: "qwen3:8b", current: true, lastRunAt: "2026-11-08T10:04:00", estimateSeconds: 660, facts: FACTS,
      cells: [cell("summarize", "give_it"), cell("triage", "with_review", "you"), cell("act", "not_yet"), cell("answer", null), cell("write", null), cell("plan", null), cell("code", null)],
    },
    { model: "qwen3:14b", current: false, lastRunAt: null, estimateSeconds: 1200, cells: TASKS.map((task) => cell(task.key, null)), facts: { ...FACTS, memoryBytes: null, gpuBytes: null } },
  ],
}

const DETAIL: BenchmarkModelDetail = { model: "qwen3:8b", current: true, lastRunAt: "2026-11-08T10:04:00", cases: 21, tasks: [], trials: [] }

/** Les modèles (R131, R142) : la matrice, le geste principal, la file, l'ouverture d'une ligne, ce qui explique une ligne. */
describe("ModelBenchmark", () => {
  const fetchMatrix = vi.fn()
  const fetchDetail = vi.fn()
  const fetchTable = vi.fn()
  const measureCortexModel = vi.fn()
  const run = vi.fn()
  const stop = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useModelBenchmarkStore.setState({
      matrix: MATRIX, details: { "qwen3:8b": DETAIL }, progress: null, queue: [], notes: {}, blind: null, openModel: null, error: null, pickerOpen: false,
      fetchMatrix, fetchDetail, run, stop, measureCortexModel,
    })
    useEvalStore.setState({ progress: null })
    useModelCapabilityStore.setState({ table: null, fetchTable })
  })

  it("reads the matrix and the capabilities, the signs named on hover, the model in use first", () => {
    render(<ModelBenchmark slug="acme" />)

    expect(fetchMatrix).toHaveBeenCalledWith("acme")
    expect(fetchTable).toHaveBeenCalledWith("acme")
    expect(screen.getByRole("img", { name: "Summarize: What summarize measures" })).toBeInTheDocument()
    const rows = screen.getAllByRole("listitem")
    expect(within(rows[0]).getByRole("button", { name: /qwen3:8b/ })).toHaveAttribute("aria-expanded", "false")
    expect(within(rows[0]).getByRole("img", { name: "Cortex uses it" })).toBeInTheDocument()
    expect(within(rows[0]).getByRole("img", { name: "Summarize: Give it, 3 of 3 cases" })).toBeInTheDocument()
    expect(within(rows[0]).getByRole("img", { name: "Triage: With review, 2 of 3 cases · Your verdict" })).toBeInTheDocument()
    expect(within(rows[0]).getByRole("img", { name: "Answer: Not run" })).toBeInTheDocument()
    expect(within(rows[1]).getByText("qwen3:14b")).toBeInTheDocument()
  })

  it("measures Cortex's model once the matrix and the capabilities are read", () => {
    useModelCapabilityStore.setState({ table: { current: "qwen3:8b", models: [] } as never })
    render(<ModelBenchmark slug="acme" />)
    expect(measureCortexModel).toHaveBeenCalledWith("acme")
  })

  it("names a verdict on hover, with what it rests on", async () => {
    render(<ModelBenchmark slug="acme" />)

    await userEvent.setup().hover(screen.getByRole("img", { name: "Summarize: Give it, 3 of 3 cases" }))
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("Summarize: Give it, 3 of 3 cases"))
  })

  it("reads, says when there is no matrix yet or no model, and starts from one line and Run", () => {
    useModelBenchmarkStore.setState({ matrix: null })
    const { rerender } = render(<ModelBenchmark slug="acme" />)
    expect(screen.getByText("Reading…")).toBeInTheDocument()

    useModelBenchmarkStore.setState({ matrix: { ...MATRIX, models: [] } })
    rerender(<ModelBenchmark slug="acme" />)
    expect(screen.getByText("The AI of this instance serves no model right now.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Set up AI" })).toBeInTheDocument()

    useModelBenchmarkStore.setState({
      matrix: { ...MATRIX, models: MATRIX.models.map((row) => ({ ...row, lastRunAt: null })) },
    })
    rerender(<ModelBenchmark slug="acme" />)
    expect(screen.getByText("No model has been run here yet.")).toBeInTheDocument()
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

  it("All picks every model that can run; one that can't chat says so and can't be picked", async () => {
    useModelBenchmarkStore.setState({
      matrix: { ...MATRIX, models: [...MATRIX.models, { ...MATRIX.models[1], model: "qwen2.5-coder:7b-base", facts: { ...FACTS, chat: false, tools: false } }] },
    })
    render(<ModelBenchmark slug="acme" />)

    fireEvent.click(screen.getByRole("button", { name: "Run" }))
    const picker = await screen.findByRole("list", { name: "Models to run" })
    expect(within(picker).getByRole("checkbox", { name: "qwen2.5-coder:7b-base" })).toBeDisabled()
    expect(within(picker).getByText("Can't chat")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "All" }))
    expect(within(picker).getByRole("checkbox", { name: "qwen3:14b" })).toBeChecked()
    expect(screen.getByRole("button", { name: "All" })).toBeDisabled()
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

  it("waits for a replay that holds the model, and says why on the button", () => {
    useEvalStore.setState({ progress: { done: 0, total: 3, waitSeconds: null, stopping: false } })
    render(<ModelBenchmark slug="acme" />)

    expect(screen.getByRole("button", { name: "A replay of your test bank is running: wait for it to finish." })).toBeDisabled()
  })

  it("shows the run in the row of its model, with no layout shift, and Stop stops it", () => {
    useModelBenchmarkStore.setState({ progress: { model: "qwen3:8b", phase: "running", done: 3, total: 21, waitSeconds: null, stopping: false, auto: false } })
    const { rerender } = render(<ModelBenchmark slug="acme" />)

    expect(screen.getByRole("status")).toHaveTextContent("qwen3:8b: 3 of 21")
    expect(within(screen.getAllByRole("listitem")[0]).getByText("3/21")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(stop).toHaveBeenCalledWith("acme")

    useModelBenchmarkStore.setState({ progress: { model: "qwen3:8b", phase: "running", done: 3, total: 21, waitSeconds: 40, stopping: true, auto: false } })
    rerender(<ModelBenchmark slug="acme" />)
    expect(screen.getByRole("status")).toHaveTextContent("Next case in 40 s")
    expect(screen.getByRole("button", { name: "Stopping…" })).toBeDisabled()

    useModelBenchmarkStore.setState({ progress: { model: "qwen3:8b", phase: "loading", done: 0, total: 0, waitSeconds: null, stopping: false, auto: false } })
    rerender(<ModelBenchmark slug="acme" />)
    expect(screen.getByRole("status")).toHaveTextContent("Loading qwen3:8b into memory. This does not count against it.")
    expect(screen.getByText("Loading")).toBeInTheDocument()

    useModelBenchmarkStore.setState({ progress: { model: "qwen3:8b", phase: "running", done: 1, total: 8, waitSeconds: null, stopping: false, auto: true } })
    rerender(<ModelBenchmark slug="acme" />)
    expect(screen.getByRole("status")).toHaveTextContent("qwen3:8b, the model Cortex uses, is measured once: 1 of 8.")
  })

  it("shows who waits in the queue, and adding to the queue stays possible while a model runs", async () => {
    useModelBenchmarkStore.setState({
      progress: { model: "qwen3:8b", phase: "running", done: 3, total: 21, waitSeconds: null, stopping: false, auto: false },
      queue: [{ model: "qwen3:14b", scope: "everything" }],
    })
    render(<ModelBenchmark slug="acme" />)

    expect(within(screen.getAllByRole("listitem")[1]).getByText("In the queue")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Run" }))
    const picker = await screen.findByRole("list", { name: "Models to run" })
    expect(within(picker).getByRole("checkbox", { name: "qwen3:14b" })).toBeDisabled()
    expect(within(picker).getByRole("checkbox", { name: "qwen3:8b" })).toBeDisabled()
  })

  it("a model too slow here says why on its row, and its signs say so without calling it bad", () => {
    useModelBenchmarkStore.setState({
      matrix: {
        ...MATRIX,
        models: [{
          ...MATRIX.models[1], lastRunAt: "2026-11-08T10:04:00", facts: { ...FACTS, memoryBytes: 10.95e9, gpuBytes: 6.12e9 },
          cells: [cell("summarize", "too_slow", null, 1), ...TASKS.slice(1).map((task) => cell(task.key, null))],
        }],
      },
    })
    render(<ModelBenchmark slug="acme" />)

    expect(screen.getByText("10.9 GB, your graphics card holds 6.1 GB: the rest runs on the processor.")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: /Summarize: Too slow here, 1 of 3 cases got no answer in time/ })).toBeInTheDocument()
  })

  it("an open row leaves the sentence about the graphics card to its detail: said once", () => {
    useModelBenchmarkStore.setState({
      openModel: "qwen3:14b",
      details: { "qwen3:14b": { ...DETAIL, model: "qwen3:14b" } },
      matrix: { ...MATRIX, models: [{ ...MATRIX.models[1], facts: { ...FACTS, memoryBytes: 10.95e9, gpuBytes: 6.12e9 } }] },
    })
    render(<ModelBenchmark slug="acme" />)
    expect(screen.getAllByText("10.9 GB, your graphics card holds 6.1 GB: the rest runs on the processor.")).toHaveLength(1)
  })

  it("too slow without anything measured about the machine (a hosted model): the row still says what happened", () => {
    useModelBenchmarkStore.setState({
      matrix: {
        ...MATRIX,
        models: [{ ...MATRIX.models[1], facts: { ...FACTS, memoryBytes: null, gpuBytes: null }, cells: [cell("summarize", "too_slow", null, 1)] }],
      },
    })
    render(<ModelBenchmark slug="acme" />)
    expect(screen.getByText("Some cases got no answer in the 5 minutes each one gets here.")).toBeInTheDocument()
  })

  it("a model that fits has nothing to explain, a small part on the processor neither", () => {
    render(<ModelBenchmark slug="acme" />)
    expect(screen.queryByText(/graphics card/)).not.toBeInTheDocument()
  })

  it("a model that can't chat comes last, the others keep their order", () => {
    useModelBenchmarkStore.setState({
      matrix: { ...MATRIX, models: [{ ...MATRIX.models[1], model: "qwen2.5-coder:7b-base", facts: { ...FACTS, chat: false, tools: false } }, ...MATRIX.models] },
    })
    render(<ModelBenchmark slug="acme" />)

    const rows = [...document.querySelectorAll("[data-benchmark-line]")]
    expect(rows.map((row) => row.querySelector(".font-mono")?.textContent)).toEqual(["qwen3:8b", "qwen3:14b", "qwen2.5-coder:7b-base"])
  })

  it("a model that can't chat says so in place of its signs", async () => {
    useModelBenchmarkStore.setState({
      matrix: { ...MATRIX, models: [{ ...MATRIX.models[1], model: "qwen2.5-coder:7b-base", facts: { ...FACTS, chat: false, tools: false } }] },
    })
    render(<ModelBenchmark slug="acme" />)

    expect(screen.getByText("Can't chat")).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: /Summarize: Not run/ })).not.toBeInTheDocument()
    await userEvent.setup().hover(screen.getByText("Can't chat"))
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("It completes text"))
  })

  it.each([
    ["too_slow", "Too slow here: it did not load in 5 minutes."],
    ["failed", "It could not load on this machine. Free some memory, then run it again."],
  ] as const)("a model that didn't load (%s) says what happened", (loadProblem, line) => {
    useModelBenchmarkStore.setState({
      matrix: { ...MATRIX, models: [{ ...MATRIX.models[1], facts: { ...FACTS, memoryBytes: null, gpuBytes: null, loadProblem } }] },
    })
    render(<ModelBenchmark slug="acme" />)
    expect(screen.getByText(line)).toBeInTheDocument()
  })

  it("a model that stopped answering during the run says it on its row", () => {
    useModelBenchmarkStore.setState({ notes: { "qwen3:14b": "qwen3:14b stopped answering on this machine." } })
    render(<ModelBenchmark slug="acme" />)
    expect(screen.getByText("qwen3:14b stopped answering on this machine.")).toBeInTheDocument()
  })

  it("opens and closes a row's detail with a click, on the row or its name", async () => {
    render(<ModelBenchmark slug="acme" />)

    fireEvent.click(screen.getByRole("button", { name: /qwen3:8b/ }))
    await waitFor(() => expect(fetchDetail).toHaveBeenCalledWith("acme", "qwen3:8b"))
    expect(screen.getByText("Indicative, on 21 cases.")).toBeInTheDocument()
    expect(useModelBenchmarkStore.getState().openModel).toBe("qwen3:8b")

    fireEvent.click(screen.getByRole("button", { name: /qwen3:8b/ }))
    expect(screen.queryByText("Indicative, on 21 cases.")).not.toBeInTheDocument()
    expect(useModelBenchmarkStore.getState().openModel).toBeNull()
  })

  it("keeps a row open when the person comes back to the tab", () => {
    useModelBenchmarkStore.setState({ openModel: "qwen3:8b" })
    render(<ModelBenchmark slug="acme" />)
    expect(screen.getByText("Indicative, on 21 cases.")).toBeInTheDocument()
  })

  it("moves between rows with the arrows", () => {
    render(<ModelBenchmark slug="acme" />)
    const first = screen.getByRole("button", { name: /qwen3:8b/ })
    const second = screen.getByRole("button", { name: /qwen3:14b/ })

    first.focus()
    fireEvent.keyDown(first, { key: "ArrowDown" })
    expect(document.activeElement).toBe(second)
    // Au bout de la liste, on y reste.
    fireEvent.keyDown(second, { key: "ArrowDown" })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second, { key: "ArrowUp" })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: "a" })
    expect(document.activeElement).toBe(first)
  })

  it("says an error, in the line that doesn't move the list", () => {
    useModelBenchmarkStore.setState({ error: "The AI is busy" })
    render(<ModelBenchmark slug="acme" />)
    expect(screen.getByText("The AI is busy")).toBeInTheDocument()
  })
})
