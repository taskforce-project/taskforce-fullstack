import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

import { BenchmarkDetail } from "./benchmark-detail"
import type { BenchmarkCaseDetail, BenchmarkModelDetail, BenchmarkModelRow, BenchmarkTaskInfo } from "@/lib/api/model-benchmark-service"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"

const TASKS: BenchmarkTaskInfo[] = [{ key: "summarize", label: "Summarize", description: "An issue with its comments", cases: 3, trial: true }]
const MODELS = [{ model: "qwen3:8b" }, { model: "qwen3:14b" }] as BenchmarkModelRow[]

const CASE: BenchmarkCaseDetail = {
  resultId: 55, caseKey: "summarize-thread-fr", title: "A French thread", passed: false, gradedPassed: false, personPassed: null, judge: null,
  checks: [
    { criterion: "says it ships in 4.3", passed: true, detail: "seen" },
    { criterion: "invents no person, date, number or name", passed: false, detail: "invented: Sophie" },
  ],
  calls: [{ tool: "update_issue", arguments: "{\"issue\":\"BILL-214\"}", effect: "allow", status: "success" }],
  answer: "Une réponse.", durationMs: 12_000, at: "2026-11-08T10:04:00",
}

const DETAIL: BenchmarkModelDetail = {
  model: "qwen3:8b", current: true, lastRunAt: "2026-11-08T10:04:00", cases: 21,
  tasks: [{
    task: "summarize", verdict: "with_review", passed: 2, measured: 3, total: 3, judge: null,
    cases: [CASE, { ...CASE, resultId: null, caseKey: "summarize-thin-fr", title: "Not played yet", answer: "", checks: [], calls: [], durationMs: null, at: null }],
  }],
  trials: [
    {
      trialId: 4, task: "summarize", issueKey: "OPS-35", chosenLetter: "A", chosenModel: "qwen3:8b", decidedAt: "2026-11-08T10:04:00",
      answers: [{ letter: "A", model: "qwen3:8b", answer: "Answer one", durationMs: 1000 }, { letter: "B", model: "qwen3:14b", answer: "Answer two", durationMs: 2000 }],
    },
    {
      trialId: 5, task: "summarize", issueKey: "OPS-36", chosenLetter: "B", chosenModel: "qwen3:14b", decidedAt: "2026-11-08T10:04:00",
      answers: [{ letter: "B", model: "qwen3:14b", answer: "x", durationMs: 1000 }],
    },
    { trialId: 6, task: "summarize", issueKey: "OPS-37", chosenLetter: null, chosenModel: null, decidedAt: "2026-11-08T10:04:00", answers: [] },
  ],
}

/** Ce qu'une ligne ouvre (R131) : les tâches, les cas, la réponse, le temps, les critères, les boutons, les essais. */
describe("BenchmarkDetail", () => {
  const fetchDetail = vi.fn()
  const overturn = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useModelBenchmarkStore.setState({ details: { "qwen3:8b": DETAIL }, blind: null, error: null, fetchDetail, overturn })
  })

  const show = () => render(<BenchmarkDetail slug="acme" model="qwen3:8b" tasks={TASKS} models={MODELS} />)

  it("reads the detail, says it is indicative and on how many cases", () => {
    show()
    expect(fetchDetail).toHaveBeenCalledWith("acme", "qwen3:8b")
    expect(screen.getByText("Indicative, on 21 cases.")).toBeInTheDocument()
    const summarize = screen.getByRole("region", { name: "Summarize" })
    expect(within(summarize).getByText("With review")).toBeInTheDocument()
    expect(within(summarize).getByText("2/3")).toBeInTheDocument()
  })

  it("waits for the detail, and says a task only part run", () => {
    useModelBenchmarkStore.setState({ details: {} })
    const { rerender } = show()
    expect(screen.getByText("Reading…")).toBeInTheDocument()

    useModelBenchmarkStore.setState({
      details: { "qwen3:8b": { ...DETAIL, tasks: [{ ...DETAIL.tasks[0], verdict: null, measured: 1 }], trials: [] } },
    })
    rerender(<BenchmarkDetail slug="acme" model="qwen3:8b" tasks={TASKS} models={MODELS} />)
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
    rerender(<BenchmarkDetail slug="acme" model="qwen3:8b" tasks={TASKS} models={MODELS} />)
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

    expect(screen.queryByText("Answer one")).not.toBeInTheDocument()
    fireEvent.click(within(trials).getByRole("button", { name: /OPS-35/ }))
    expect(screen.getByText("Answer one")).toBeInTheDocument()
    expect(screen.getByText("B · qwen3:14b")).toBeInTheDocument()
  })

  it("opens Try on my work, and keeps it open while a trial runs", () => {
    const { rerender } = show()
    fireEvent.click(screen.getByRole("button", { name: "Try on my work" }))
    expect(screen.getByRole("region", { name: "Try on my work" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Try on my work" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.getByRole("button", { name: "Try on my work" })).toBeInTheDocument()

    useModelBenchmarkStore.setState({
      blind: { phase: "answering", trial: { trialId: 4, task: "summarize", issueKey: "OPS-35", letters: ["A"] }, answers: {}, result: null, waitSeconds: null },
    })
    rerender(<BenchmarkDetail slug="acme" model="qwen3:8b" tasks={TASKS} models={MODELS} />)
    expect(screen.getByRole("region", { name: "Try on my work" })).toBeInTheDocument()
  })
})
