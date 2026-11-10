import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

import { BankHistory } from "./bank-history"
import type { EvalHistory, EvalHistoryRun } from "@/lib/api/eval-service"
import type { ModelCapabilityTable } from "@/lib/api/model-capability-service"
import { useEvalStore } from "@/lib/store/eval-store"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"

const run = (patch: Partial<EvalHistoryRun>): EvalHistoryRun => ({
  id: 1, model: "qwen3:8b", answeredBy: "qwen3:8b", startedAt: "2026-11-02T15:08:00", finishedAt: "2026-11-02T15:12:00",
  total: 11, graded: 11, passed: 5, ...patch,
})

const CASES: EvalHistory["cases"] = [1, 2].map((id) => ({
  id, title: `Case ${id}`, question: "suprime testta 2", askedOn: "2026-11-02", addedAt: "2026-11-02T15:00:00", mine: true,
  origin: { kind: "unknown" as const, said: [], shown: null }, grades: [],
}))

const TABLE = { current: "qwen3:8b" } as ModelCapabilityTable

/** Comment Cortex fait dans le temps (R61, R118, R125) : la banque par modèle et par date, et sa courbe. */
describe("BankHistory", () => {
  it("does not replay a case that waits for its criteria (R61, R137)", () => {
    useEvalStore.setState({
      history: { runs: [], cases: [{ ...CASES[0], waiting: true, expected: "Ask first." }] },
      progress: null, error: null, fetchHistory: vi.fn(), runBank: vi.fn(), stopRun: vi.fn(),
    })
    useModelCapabilityStore.setState({ table: TABLE, fetchTable: vi.fn(), progress: null })

    render(<BankHistory slug="acme" />)

    expect(screen.getByRole("button", { name: /Replay 0 cases/ })).toBeDisabled()
  })

  const fetchHistory = vi.fn()
  const fetchTable = vi.fn()
  const runBank = vi.fn()
  const stopRun = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    runBank.mockResolvedValue(null)
    useEvalStore.setState({ history: { runs: [], cases: CASES }, progress: null, error: null, fetchHistory, runBank, stopRun })
    useModelCapabilityStore.setState({ table: TABLE, fetchTable })
    useModelBenchmarkStore.setState({ progress: null })
  })

  it("reads the history and the model of Cortex, and replays the bank on it in a click", () => {
    render(<BankHistory slug="acme" />)

    expect(fetchHistory).toHaveBeenCalledWith("acme")
    // L'onglet peut s'ouvrir le premier : il lit lui-même le modèle sur lequel rejouer.
    expect(fetchTable).toHaveBeenCalledWith("acme")
    expect(screen.getByText("Not replayed yet.")).toBeInTheDocument()
    // Un mot sur le geste, le reste au survol et pour les lecteurs d'écran.
    const replay = screen.getByRole("button", { name: "Replay 2 cases on qwen3:8b" })
    expect(replay).toHaveTextContent(/^Replay$/)
    expect(screen.queryByText(/A replay never touches your workspace/)).not.toBeInTheDocument()
    fireEvent.click(replay)
    expect(runBank).toHaveBeenCalledWith("acme", "qwen3:8b")
  })

  it("replays on the instance's default model when it doesn't know Cortex's yet, and waits for the queue of models", () => {
    useEvalStore.setState({ history: { runs: [], cases: CASES.slice(0, 1) } })
    useModelCapabilityStore.setState({ table: null })
    const { rerender } = render(<BankHistory slug="acme" />)

    fireEvent.click(screen.getByRole("button", { name: "Replay 1 case on Cortex's model" }))
    expect(runBank).toHaveBeenCalledWith("acme", "")

    useModelCapabilityStore.setState({ table: TABLE })
    useModelBenchmarkStore.setState({ progress: { model: "qwen3:8b", phase: "running", done: 0, total: 8, waitSeconds: null, stopping: false, auto: true } })
    rerender(<BankHistory slug="acme" />)
    expect(screen.getByRole("button", { name: "Replay 1 case on qwen3:8b" })).toBeDisabled()
  })

  it("lists the runs newest first, by model and date, a partial one as such, and draws the curve", () => {
    useEvalStore.setState({
      history: {
        cases: CASES,
        runs: [
          run({ id: 1 }),
          run({ id: 2, model: "default", answeredBy: null, startedAt: "2026-11-05T10:00:00", passed: 8 }),
          run({ id: 3, startedAt: "2026-11-07T10:00:00", finishedAt: null, graded: 3, passed: 2 }),
        ],
      },
    })
    render(<BankHistory slug="acme" />)

    const items = within(screen.getByRole("list", { name: "Over time" })).getAllByRole("listitem")
    expect(items.map((item) => item.textContent)).toEqual([
      "qwen3:8b7 Nov3/11",
      "Default model5 Nov8/11",
      "qwen3:8b2 Nov5/11",
    ])
    // En mots au survol et pour les lecteurs d'écran : réussis, ou notés pour un rejeu partiel.
    expect(screen.getByLabelText("3 of 11 graded")).toBeInTheDocument()
    expect(screen.getByLabelText("8 of 11 passed")).toBeInTheDocument()
    const curve = screen.getByRole("figure", { name: "Share of the test bank passed, by model" })
    expect(within(curve).getByText("Default model")).toBeInTheDocument()
  })

  it("draws no curve before two finished runs", () => {
    useEvalStore.setState({ history: { cases: CASES, runs: [run({ id: 1 })] } })
    render(<BankHistory slug="acme" />)

    expect(screen.queryByRole("figure")).not.toBeInTheDocument()
  })

  it("says a replay as it runs, and stops it", () => {
    useEvalStore.setState({ progress: { done: 1, total: 11, waitSeconds: null, stopping: false } })
    const { rerender } = render(<BankHistory slug="acme" />)

    expect(screen.getByRole("status")).toHaveTextContent("Replaying case 2 of 11…")
    expect(screen.getByText("2/11")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(stopRun).toHaveBeenCalled()

    useEvalStore.setState({ progress: { done: 1, total: 11, waitSeconds: 42, stopping: true }, error: "The AI is busy" })
    rerender(<BankHistory slug="acme" />)
    expect(screen.getByRole("status")).toHaveTextContent("next case in 42 s")
    expect(screen.getByText("42 s")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Stopping…" })).toBeDisabled()
    expect(screen.getByText("The AI is busy")).toBeInTheDocument()

    useEvalStore.setState({ progress: { done: 0, total: 0, waitSeconds: null, stopping: false }, error: null })
    rerender(<BankHistory slug="acme" />)
    expect(screen.getByRole("status")).toHaveTextContent("Starting the replay…")
  })

  it("waits for the history, says a read that failed, and says when the bank has no case", () => {
    useEvalStore.setState({ history: null, historyFailed: false })
    const { rerender } = render(<BankHistory slug="acme" />)
    expect(screen.getByText("Reading…")).toBeInTheDocument()

    useEvalStore.setState({ historyFailed: true })
    rerender(<BankHistory slug="acme" />)
    expect(screen.getByText(/TaskForce couldn't read this part/)).toBeInTheDocument()

    useEvalStore.setState({ history: { runs: [], cases: [] }, historyFailed: false })
    rerender(<BankHistory slug="acme" />)
    expect(screen.getByText("No test case yet: under an answer of Cortex, choose good or bad.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Replay/ })).not.toBeInTheDocument()
  })
})
