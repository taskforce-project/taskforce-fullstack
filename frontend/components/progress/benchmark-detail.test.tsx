import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

import { BenchmarkDetail } from "./benchmark-detail"
import type { BenchmarkCaseDetail, BenchmarkModelDetail, BenchmarkModelFacts, BenchmarkModelRow, BenchmarkTaskInfo } from "@/lib/api/model-benchmark-service"
import type { ModelCapabilityTable } from "@/lib/api/model-capability-service"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"

const TASKS: BenchmarkTaskInfo[] = [{ key: "summarize", label: "Summarize", description: "An issue with its comments", cases: 3, trial: true }]
const FACTS: BenchmarkModelFacts = {
  family: "qwen3", parameters: "8.2B", diskBytes: 5_225_388_164, contextWindow: 40960, tools: true, chat: true,
  memoryBytes: 5.03e9, gpuBytes: 5.03e9, loadProblem: null,
}
const ROW: BenchmarkModelRow = { model: "qwen3:8b", current: true, lastRunAt: "2026-11-08T10:04:00", estimateSeconds: 600, cells: [], facts: FACTS }
const MODELS = [ROW, { ...ROW, model: "qwen3:14b", current: false }]

const CASE: BenchmarkCaseDetail = {
  resultId: 55, caseKey: "summarize-thread-fr", title: "A French thread", passed: false, gradedPassed: false, personPassed: null, judge: null,
  checks: [
    { criterion: "says it ships in 4.3", passed: true, detail: "seen" },
    { criterion: "invents no person, date, number or name", passed: false, detail: "invented: Sophie" },
  ],
  calls: [{ tool: "update_issue", arguments: "{\"issue\":\"BILL-214\"}", effect: "allow", status: "success" }],
  answer: "Une réponse.", durationMs: 12_000, at: "2026-11-08T10:04:00", tooSlow: false,
}

const DETAIL: BenchmarkModelDetail = {
  model: "qwen3:8b", current: true, lastRunAt: "2026-11-08T10:04:00", cases: 21,
  tasks: [{
    task: "summarize", verdict: "with_review", passed: 2, measured: 3, total: 3, judge: null, tooSlow: 0,
    cases: [CASE, { ...CASE, resultId: null, caseKey: "summarize-thin-fr", title: "Not played yet", answer: "", checks: [], calls: [], durationMs: null, at: null }],
  }],
  trials: [
    {
      trialId: 4, task: "summarize", issueKey: "OPS-35", chosenLetter: "A", chosenModel: "qwen3:8b", decidedAt: "2026-11-08T10:04:00",
      answers: [{ letter: "A", model: "qwen3:8b", answer: "Answer one", durationMs: 1000, tooSlow: false }, { letter: "B", model: "qwen3:14b", answer: "Answer two", durationMs: 2000, tooSlow: true }],
    },
    {
      trialId: 5, task: "summarize", issueKey: "OPS-36", chosenLetter: "B", chosenModel: "qwen3:14b", decidedAt: "2026-11-08T10:04:00",
      answers: [{ letter: "A", model: "qwen3:8b", answer: "x", durationMs: 1000, tooSlow: false }, { letter: "B", model: "qwen3:14b", answer: "y", durationMs: 1000, tooSlow: false }],
    },
    { trialId: 6, task: "summarize", issueKey: "OPS-37", chosenLetter: null, chosenModel: null, decidedAt: "2026-11-08T10:04:00", answers: [] },
    {
      trialId: 7, task: "summarize", issueKey: "OPS-38", chosenLetter: null, chosenModel: null, decidedAt: "2026-11-08T10:04:00",
      answers: [{ letter: "A", model: "qwen3:8b", answer: "Alone", durationMs: 1000, tooSlow: false }],
    },
  ],
}

const TABLE: ModelCapabilityTable = {
  provider: "OLLAMA", instanceModel: "qwen3:8b", choice: null, current: "qwen3:8b", suiteVersion: 1,
  capabilities: [
    { key: "tools", label: "Tools", description: "Calls TaskForce's tools with the right issue and fields", cases: 2 },
    { key: "context", label: "Long context", description: "Finds a fact at the start of a long document", cases: 2 },
  ],
  cases: [{ key: "context-long", capability: "context", title: "Finds the code name at the start of a 3000-word log" }],
  models: [
    {
      model: "qwen3:8b", current: true, measuredAt: "2026-11-08T10:04:00", failedCases: ["context-long"],
      scores: [
        { capability: "tools", passed: 2, measured: 2, total: 2, capable: true, heldWords: null, measuredAt: "2026-11-08T10:04:00", tooSlow: 0 },
        { capability: "context", passed: 1, measured: 2, total: 2, capable: false, heldWords: 500, measuredAt: "2026-11-08T10:04:00", tooSlow: 0 },
      ],
    },
    { model: "qwen3:14b", current: false, measuredAt: null, scores: [] },
  ],
  proposals: [{ capability: "tools", model: "qwen3:8b" }],
  proposed: null,
}

/** Ce qu'une ligne ouvre (R131, R142) : ce qu'est le modèle, ce qu'il sait faire, les tâches, les cas, les essais. */
describe("BenchmarkDetail", () => {
  const fetchDetail = vi.fn()
  const overturn = vi.fn()
  const choose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useModelBenchmarkStore.setState({ details: { "qwen3:8b": DETAIL }, blind: null, error: null, fetchDetail, overturn })
    useModelCapabilityStore.setState({ table: TABLE, choose })
  })

  const show = (row: BenchmarkModelRow = ROW) => render(<BenchmarkDetail slug="acme" row={row} tasks={TASKS} models={MODELS} />)

  it("says what the model is, from what Ollama reports and the glossary of its name", () => {
    show({ ...ROW, model: "qwen2.5:7b-instruct", current: false })
    const about = screen.getByRole("region", { name: "About this model" })

    expect(within(about).getByText("qwen3 family, 8.2 billion parameters. 5.2 GB on disk.")).toBeInTheDocument()
    expect(within(about).getByText("7b")).toBeInTheDocument()
    expect(within(about).getByText(/about 7 billion parameters/)).toBeInTheDocument()
    expect(within(about).getByText("instruct")).toBeInTheDocument()
    expect(within(about).getByText(/trained to follow instructions/)).toBeInTheDocument()
    expect(within(about).getByText("Can use Cortex's tools.")).toBeInTheDocument()
    expect(within(about).getByText("Fits on your graphics card (5.0 GB).")).toBeInTheDocument()
  })

  it("says what is not known yet, and what it can't do, without inventing", () => {
    show({ ...ROW, current: false, facts: { ...FACTS, memoryBytes: null, gpuBytes: null, tools: false } })
    const about = screen.getByRole("region", { name: "About this model" })
    expect(within(about).getByText("Whether it fits your graphics card shows after a first run.")).toBeInTheDocument()
    expect(within(about).getByText("Can't use Cortex's tools.")).toBeInTheDocument()
  })

  it("a model with nothing reported says only what its name says", () => {
    show({ ...ROW, current: false, facts: { family: null, parameters: null, diskBytes: null, contextWindow: null, tools: null, chat: null, memoryBytes: null, gpuBytes: null, loadProblem: null } })
    const about = screen.getByRole("region", { name: "About this model" })
    expect(within(about).queryByText(/family/)).not.toBeInTheDocument()
    expect(within(about).queryByText(/tools/)).not.toBeInTheDocument()
    expect(within(about).queryByText(/graphics card/)).not.toBeInTheDocument()
  })

  it("gives Use for Cortex, in the detail, and says when Cortex already uses it", () => {
    const { unmount } = show({ ...ROW, current: false })
    fireEvent.click(screen.getByRole("button", { name: "Use for Cortex" }))
    expect(choose).toHaveBeenCalledWith("acme", null)
    unmount()

    show({ ...ROW, model: "qwen3:14b", current: false })
    fireEvent.click(screen.getByRole("button", { name: "Use for Cortex" }))
    expect(choose).toHaveBeenLastCalledWith("acme", "qwen3:14b")
  })

  it("says Cortex uses it", () => {
    show()
    expect(within(screen.getByRole("region", { name: "About this model" })).getByText("Cortex uses it")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Use for Cortex" })).not.toBeInTheDocument()
  })

  it("says what each capability measures, in words, with its score and what failed", () => {
    show()
    const measures = screen.getByRole("region", { name: "What it can do" })

    expect(within(measures).getByText("Calls TaskForce's tools with the right issue and fields")).toBeInTheDocument()
    expect(within(measures).getByText("2/2")).toBeInTheDocument()
    expect(within(measures).getByText("1/2 · holds 500 words")).toBeInTheDocument()
    expect(within(measures).getByText("Failed: Finds the code name at the start of a 3000-word log")).toBeInTheDocument()
    expect(within(measures).getByText(/Measured here by TaskForce's test cases/)).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "About this model" })).getByText("TaskForce proposes it for Tools.")).toBeInTheDocument()
  })

  it("a model not measured yet says so", () => {
    useModelCapabilityStore.setState({
      table: { ...TABLE, models: [{ model: "qwen3:8b", current: true, measuredAt: null, scores: [] }] },
    })
    show()
    expect(within(screen.getByRole("region", { name: "What it can do" })).getByText("Not measured yet.")).toBeInTheDocument()
  })

  it("a model that can't chat shows its description and its reason, and nothing to run or to try", () => {
    show({ ...ROW, model: "qwen2.5-coder:7b-base", current: false, facts: { ...FACTS, chat: false, tools: false } })
    const about = screen.getByRole("region", { name: "About this model" })

    expect(within(about).getByText(/it was not trained to hold a conversation/)).toBeInTheDocument()
    expect(within(about).getByText("base")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "What it can do" })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "What you can give it" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Try on my work" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Use for Cortex" })).not.toBeInTheDocument()
  })

  it("reads the detail, says it is indicative and on how many cases, and what the task measures", () => {
    show()
    expect(fetchDetail).toHaveBeenCalledWith("acme", "qwen3:8b")
    expect(screen.getByText("Indicative, on 21 cases.")).toBeInTheDocument()
    const summarize = screen.getByRole("region", { name: "Summarize" })
    expect(within(summarize).getByText("An issue with its comments")).toBeInTheDocument()
    expect(within(summarize).getByText("With review")).toBeInTheDocument()
    expect(within(summarize).getByText("2/3")).toBeInTheDocument()
  })

  it("adds a line for the person's own test cases, when the bank has been replayed on it", () => {
    show({ ...ROW, cells: [{ task: "bank", verdict: "with_review", passed: 2, measured: 3, total: 3, judge: null, tooSlow: 0 }] })
    expect(screen.getByText("Your tests: 2 of 3 passed. Each case is in History.")).toBeInTheDocument()
  })

  it("waits for the detail, and says a task only part run", () => {
    useModelBenchmarkStore.setState({ details: {} })
    const { rerender } = show()
    expect(screen.getByText("Reading…")).toBeInTheDocument()

    useModelBenchmarkStore.setState({
      details: { "qwen3:8b": { ...DETAIL, tasks: [{ ...DETAIL.tasks[0], verdict: null, measured: 1 }], trials: [] } },
    })
    rerender(<BenchmarkDetail slug="acme" row={ROW} tasks={TASKS} models={MODELS} />)
    expect(screen.getByText("1 of 3 run")).toBeInTheDocument()
    expect(screen.getAllByText("Not run").length).toBeGreaterThan(0)
  })

  it("opens a case: the answer, the time, what it called, the checks, and what was invented", () => {
    show()
    expect(screen.queryByText("Une réponse.")).not.toBeInTheDocument()
    expect(screen.getByText("12 s")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /A French thread/ }))

    expect(screen.getByText("Une réponse.")).toBeInTheDocument()
    expect(screen.getByText(/update_issue/)).toBeInTheDocument()
    const checks = screen.getByRole("list", { name: "What was checked" })
    expect(within(checks).getByText("says it ships in 4.3")).toBeInTheDocument()
    expect(within(checks).getByText("invents no person, date, number or name: invented: Sophie")).toBeInTheDocument()
    // Le critère réussi garde son détail au survol seulement.
    expect(within(checks).queryByText(/seen/)).not.toBeInTheDocument()
  })

  it("a case not played cannot be opened", () => {
    show()
    expect(screen.getByRole("button", { name: /Not played yet/ })).toBeDisabled()
    expect(screen.getByRole("img", { name: "Not run" })).toBeInTheDocument()
  })

  it("a case too slow says so, with nothing to judge", () => {
    useModelBenchmarkStore.setState({
      details: { "qwen3:8b": { ...DETAIL, tasks: [{ ...DETAIL.tasks[0], verdict: "too_slow", tooSlow: 1, cases: [{ ...CASE, tooSlow: true, durationMs: 300_000 }] }], trials: [] } },
    })
    show()

    expect(screen.getAllByRole("img", { name: "Too slow here" })).toHaveLength(2)
    expect(screen.getByText("Too slow here")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /A French thread/ }))
    expect(screen.getByText("No answer in the 5 minutes a case gets on this machine. There is nothing to judge.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Pass" })).not.toBeInTheDocument()
  })

  it("overturns a case with its two buttons, and a second click gives the note back to the code", () => {
    const { rerender } = show()
    fireEvent.click(screen.getByRole("button", { name: /A French thread/ }))

    fireEvent.click(screen.getByRole("button", { name: "Pass" }))
    expect(overturn).toHaveBeenLastCalledWith("acme", "qwen3:8b", 55, true)
    fireEvent.click(screen.getByRole("button", { name: "Fail" }))
    expect(overturn).toHaveBeenLastCalledWith("acme", "qwen3:8b", 55, false)

    useModelBenchmarkStore.setState({
      details: { "qwen3:8b": { ...DETAIL, tasks: [{ ...DETAIL.tasks[0], judge: "you", cases: [{ ...CASE, passed: true, personPassed: true, judge: "you" }] }], trials: [] } },
    })
    rerender(<BenchmarkDetail slug="acme" row={ROW} tasks={TASKS} models={MODELS} />)
    expect(screen.getAllByText("Your verdict").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Pass" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(screen.getByRole("button", { name: "Pass" }))
    expect(overturn).toHaveBeenLastCalledWith("acme", "qwen3:8b", 55, null)
  })

  it("says that a model wrote nothing", () => {
    useModelBenchmarkStore.setState({
      details: { "qwen3:8b": { ...DETAIL, tasks: [{ ...DETAIL.tasks[0], cases: [{ ...CASE, answer: "" }] }], trials: [] } },
    })
    show()
    fireEvent.click(screen.getByRole("button", { name: /A French thread/ }))
    expect(screen.getByText("The model wrote nothing.")).toBeInTheDocument()
  })

  it("shows the person's trials: who was chosen, and the answers at a click", () => {
    show()
    const trials = screen.getByRole("region", { name: "Your trials" })
    expect(within(trials).getByText("You chose this model")).toBeInTheDocument()
    expect(within(trials).getByText("You chose qwen3:14b")).toBeInTheDocument()
    expect(within(trials).getByText("You chose none")).toBeInTheDocument()
    expect(within(trials).getByText("Tried on its own")).toBeInTheDocument()

    expect(screen.queryByText("Answer one")).not.toBeInTheDocument()
    fireEvent.click(within(trials).getByRole("button", { name: /OPS-35/ }))
    expect(screen.getByText("Answer one")).toBeInTheDocument()
    expect(screen.getByText("B · qwen3:14b")).toBeInTheDocument()
    expect(screen.getByText("Too slow here: no answer in 5 minutes.")).toBeInTheDocument()

    fireEvent.click(within(trials).getByRole("button", { name: /OPS-38/ }))
    expect(screen.getByText("Alone")).toBeInTheDocument()
    expect(screen.getByText("qwen3:8b")).toBeInTheDocument()
  })

  it("opens Try on my work, and keeps it open while a trial runs", () => {
    const { rerender } = show()
    fireEvent.click(screen.getByRole("button", { name: "Try on my work" }))
    expect(screen.getByRole("region", { name: "Try on my work" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Try on my work" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.getByRole("button", { name: "Try on my work" })).toBeInTheDocument()

    useModelBenchmarkStore.setState({
      blind: { phase: "answering", trial: { trialId: 4, task: "summarize", issueKey: "OPS-35", letters: ["A"] }, answers: {}, result: null, model: null, waitSeconds: null },
    })
    rerender(<BenchmarkDetail slug="acme" row={ROW} tasks={TASKS} models={MODELS} />)
    expect(screen.getByRole("region", { name: "Try on my work" })).toBeInTheDocument()
  })
})
