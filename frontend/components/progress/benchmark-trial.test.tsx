import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

import { BenchmarkTrial } from "./benchmark-trial"
import type { BenchmarkModelRow, BenchmarkTaskInfo, BlindTrialResult, BlindTrialStarted } from "@/lib/api/model-benchmark-service"
import type { PickOption } from "@/lib/cortex/composer-picker"
import { usePickOptions } from "@/lib/hooks/use-pick-options"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"

vi.mock("@/lib/hooks/use-pick-options", () => ({ usePickOptions: vi.fn() }))

const TASKS: BenchmarkTaskInfo[] = [
  { key: "summarize", label: "Summarize", description: "An issue", cases: 3, trial: true },
  { key: "act", label: "Act", description: "The board", cases: 4, trial: false },
  { key: "plan", label: "Plan", description: "Steps", cases: 3, trial: true },
]
const MODELS = ["qwen3:8b", "qwen3:14b", "qwen3.5:9b", "llama3.2"].map((model) => ({ model })) as BenchmarkModelRow[]

const ISSUE: PickOption = {
  id: "issue:40", group: "issues", label: "OPS-35", detail: "Itération #35", insert: "OPS-35",
  attach: { kind: "issue", projectId: 3, issueId: 40, label: "OPS-35", title: "Itération #35" },
}
const PROJECT: PickOption = {
  id: "project:3", group: "projects", label: "Operations", detail: "OPS", insert: "Operations",
  attach: { kind: "project", projectId: 3, issueId: null, label: "Operations", title: null },
}
const TRIAL: BlindTrialStarted = { trialId: 4, task: "summarize", issueKey: "OPS-35", letters: ["A", "B"] }
const REVEAL: BlindTrialResult = {
  trialId: 4, task: "summarize", issueKey: "OPS-35", chosenLetter: "B", chosenModel: "qwen3:14b", decidedAt: "2026-11-08T10:00:00",
  answers: [{ letter: "A", model: "qwen3:8b", answer: "Answer one", durationMs: 1000 }, { letter: "B", model: "qwen3:14b", answer: "Answer two", durationMs: 2000 }],
}

/** L'essai à l'aveugle (R131) : l'issue, la tâche, les modèles ; les réponses sous des lettres ; le choix ; les noms. */
describe("BenchmarkTrial", () => {
  const startTrial = vi.fn()
  const chooseTrial = vi.fn()
  const closeTrial = vi.fn()
  const onClose = vi.fn()

  const show = () => render(<BenchmarkTrial slug="acme" model="qwen3:8b" tasks={TASKS} models={MODELS} onClose={onClose} />)

  beforeEach(() => {
    vi.clearAllMocks()
    useModelBenchmarkStore.setState({ blind: null, error: null, startTrial, chooseTrial, closeTrial })
    vi.mocked(usePickOptions).mockReturnValue({ options: [ISSUE, PROJECT], searching: false })
  })

  it("offers the issues of the composer's search, the tasks that can be tried, and the models", () => {
    show()
    expect(usePickOptions).toHaveBeenCalledWith("acme", "attach", "")
    expect(screen.getByRole("option", { name: /OPS-35/ })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /Operations/ })).not.toBeInTheDocument()

    expect(screen.getByRole("radio", { name: "Summarize" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("radio", { name: "Plan" })).toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: "Act" })).not.toBeInTheDocument()

    expect(screen.getByRole("checkbox", { name: "qwen3:8b" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "qwen3:14b" })).toBeChecked()
    expect(screen.getByRole("button", { name: "Try" })).toBeDisabled()
  })

  it("starts a trial on the chosen issue, with the chosen task and models", () => {
    show()
    fireEvent.click(screen.getByRole("option", { name: /OPS-35/ }))
    fireEvent.click(screen.getByRole("radio", { name: "Plan" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "qwen3:14b" }))
    expect(screen.getByRole("button", { name: "Try" })).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox", { name: "qwen3.5:9b" }))

    fireEvent.click(screen.getByRole("button", { name: "Try" }))

    expect(startTrial).toHaveBeenCalledWith("acme", { projectId: 3, issueId: 40, task: "plan", models: ["qwen3:8b", "qwen3.5:9b"] })
  })

  it("picks the issue with the keyboard, and lets it change", () => {
    show()
    const search = screen.getByRole("combobox", { name: "Find one of your issues" })
    fireEvent.change(search, { target: { value: "ops" } })
    expect(usePickOptions).toHaveBeenLastCalledWith("acme", "attach", "ops")
    fireEvent.keyDown(search, { key: "ArrowDown" })
    fireEvent.keyDown(search, { key: "ArrowUp" })
    fireEvent.keyDown(search, { key: "x" })
    fireEvent.keyDown(search, { key: "Enter" })

    expect(screen.getByText("OPS-35")).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Change the issue" }))
    expect(screen.getByRole("combobox")).toBeInTheDocument()
  })

  it("takes three models at most", () => {
    show()
    fireEvent.click(screen.getByRole("checkbox", { name: "qwen3.5:9b" }))
    expect(screen.getByRole("checkbox", { name: "llama3.2" })).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox", { name: "llama3.2" }))
    expect(screen.getByRole("checkbox", { name: "llama3.2" })).not.toBeChecked()
  })

  it("says a failure to start", () => {
    useModelBenchmarkStore.setState({ error: "This issue was not found." })
    show()
    expect(screen.getByText("This issue was not found.")).toBeInTheDocument()
  })

  it("closes", () => {
    show()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(closeTrial).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("shows the answers as they come, under their letters, no name, no choice yet", () => {
    useModelBenchmarkStore.setState({ blind: { phase: "answering", trial: TRIAL, answers: { A: { letter: "A", answer: "Answer one", durationMs: 1000 } }, result: null, waitSeconds: null } })
    const { rerender } = show()

    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 answers")
    expect(within(screen.getByRole("article", { name: "Answer A" })).getByText("Answer one")).toBeInTheDocument()
    expect(within(screen.getByRole("article", { name: "Answer B" })).getByText("…")).toBeInTheDocument()
    expect(screen.queryByText(/qwen3/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Choose" })).not.toBeInTheDocument()

    useModelBenchmarkStore.setState({ blind: { phase: "answering", trial: TRIAL, answers: {}, result: null, waitSeconds: 20 } })
    rerender(<BenchmarkTrial slug="acme" model="qwen3:8b" tasks={TASKS} models={MODELS} onClose={onClose} />)
    expect(screen.getByRole("status")).toHaveTextContent("Next case in 20 s")
  })

  it("lets the person choose a letter, or none, with one gesture", () => {
    useModelBenchmarkStore.setState({
      blind: {
        phase: "choosing", trial: TRIAL, result: null, waitSeconds: null,
        answers: { A: { letter: "A", answer: "Answer one", durationMs: 1000 }, B: { letter: "B", answer: "", durationMs: 2000 } },
      },
    })
    show()

    expect(within(screen.getByRole("article", { name: "Answer B" })).getByText("The model wrote nothing.")).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole("article", { name: "Answer B" })).getByRole("button", { name: "Choose" }))
    expect(chooseTrial).toHaveBeenLastCalledWith("acme", "B")
    fireEvent.click(screen.getByRole("button", { name: "None of them" }))
    expect(chooseTrial).toHaveBeenLastCalledWith("acme", null)
  })

  it("then shows the names, the chosen one, and closes when done", () => {
    useModelBenchmarkStore.setState({
      blind: {
        phase: "revealed", trial: TRIAL, result: REVEAL, waitSeconds: null,
        answers: { A: { letter: "A", answer: "Answer one", durationMs: 1000 }, B: { letter: "B", answer: "Answer two", durationMs: 2000 } },
      },
    })
    show()

    const b = screen.getByRole("article", { name: "Answer B" })
    expect(within(b).getByText("qwen3:14b")).toBeInTheDocument()
    expect(within(b).getByText("Chosen")).toBeInTheDocument()
    expect(within(screen.getByRole("article", { name: "Answer A" })).queryByText("Chosen")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Choose" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(closeTrial).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
