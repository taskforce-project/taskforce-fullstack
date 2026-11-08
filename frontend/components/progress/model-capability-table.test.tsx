import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

import { ModelCapabilityTable } from "./model-capability-table"
import type { ModelCapabilityTable as Table } from "@/lib/api/model-capability-service"
import { useEvalStore } from "@/lib/store/eval-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
import { useSettingsStore } from "@/lib/store/settings-store"

const score = (capability: string, passed: number, measured: number, total = 2) => ({
  capability, passed, measured, total, capable: passed === total && measured === total, heldWords: null, measuredAt: null,
})

const TABLE: Table = {
  provider: "OLLAMA", instanceModel: "qwen3:8b", choice: null, current: "qwen3:8b", suiteVersion: 1,
  capabilities: [
    { key: "tools", label: "Tools", description: "Calls Cortex's tools", cases: 2 },
    { key: "code", label: "Code", description: "Writes code", cases: 2 },
  ],
  cases: [{ key: "tools-move", capability: "tools", title: "Move an issue" }],
  models: [
    { model: "qwen3:8b", current: true, measuredAt: "2026-11-07T10:04:00", scores: [score("tools", 2, 2), score("code", 1, 2)] },
    {
      model: "qwen3:14b", current: false, measuredAt: null, scores: [score("tools", 0, 0), score("code", 0, 0)],
      card: { parameters: "14.8B", contextWindow: 40960, tools: true },
    },
    { model: "llama3.2", current: false, measuredAt: null, scores: [score("tools", 0, 0), score("code", 0, 0)], card: null },
  ],
  proposals: [{ capability: "tools", model: "qwen3:8b" }],
  proposed: null,
}

/** Ce que sait faire chaque modèle, mesuré ici (R113), dans le volet « Progress » (R125). */
describe("ModelCapabilityTable", () => {
  const fetchTable = vi.fn()
  const measure = vi.fn()
  const measureCortexModel = vi.fn()
  const openSettings = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useModelCapabilityStore.setState({
      table: TABLE, progress: null, results: [], error: null, fetchTable, measure, measureCortexModel,
    })
    useEvalStore.setState({ progress: null })
    useSettingsStore.setState({ openSettings })
  })

  it("reads the table, and measures Cortex's model once without a click", () => {
    render(<ModelCapabilityTable slug="acme" />)

    expect(fetchTable).toHaveBeenCalledWith("acme")
    expect(measureCortexModel).toHaveBeenCalledWith("acme")
    expect(screen.getByRole("region", { name: "What each model can do" })).toBeInTheDocument()
  })

  it("shows the scores of a measured model, and what an unmeasured one's description says, as such", () => {
    render(<ModelCapabilityTable slug="acme" />)

    const measured = screen.getByRole("row", { name: /qwen3:8b/ })
    expect(within(measured).getByText("2/2")).toBeInTheDocument()
    expect(within(measured).getByText("1/2")).toBeInTheDocument()
    expect(within(measured).getByText("Cortex uses it")).toBeInTheDocument()

    const described = screen.getByRole("row", { name: /qwen3:14b/ })
    expect(within(described).getByText("Not measured yet.")).toBeInTheDocument()
    expect(within(described).getByText(
      "Its description says: 14.8B parameters · a context window of 40,960 tokens · takes tools.",
    )).toBeInTheDocument()
    expect(within(described).queryByText("2/2")).not.toBeInTheDocument()

    const silent = screen.getByRole("row", { name: /llama3\.2/ })
    expect(within(silent).getByText("Not measured yet.")).toBeInTheDocument()
    expect(within(silent).queryByText(/Its description says/)).not.toBeInTheDocument()
  })

  it("leaves the choice to Settings > AI: no Use for Cortex here", () => {
    render(<ModelCapabilityTable slug="acme" />)

    expect(screen.queryByRole("button", { name: "Use for Cortex" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Choose Cortex's model in Settings > AI" }))
    expect(openSettings).toHaveBeenCalledWith("ai")
  })

  it("measures a model on demand, never while the test bank is replayed", () => {
    const { rerender } = render(<ModelCapabilityTable slug="acme" />)

    fireEvent.click(within(screen.getByRole("row", { name: /qwen3:14b/ })).getByRole("button", { name: "Measure" }))
    expect(measure).toHaveBeenCalledWith("acme", "qwen3:14b")

    useEvalStore.setState({ progress: { done: 0, total: 3, waitSeconds: null, stopping: false } })
    rerender(<ModelCapabilityTable slug="acme" />)
    expect(within(screen.getByRole("row", { name: /qwen3:8b/ })).getByRole("button", { name: "Measure again" })).toBeDisabled()
  })

  it("says a measure as it runs, and the last one's failures", () => {
    useModelCapabilityStore.setState({
      progress: { model: "qwen3:8b", done: 1, total: 8, waitSeconds: null, stopping: false, auto: true },
    })
    const { rerender } = render(<ModelCapabilityTable slug="acme" />)
    expect(screen.getByRole("status")).toHaveTextContent("Measuring qwen3:8b, the model Cortex uses, once: 1 of 8.")

    useModelCapabilityStore.setState({
      progress: null,
      results: [{ caseKey: "tools-move", capability: "tools", passed: false, checks: [], answer: "", model: "qwen3:8b", promptTokens: 0 }],
      error: "The AI is busy",
    })
    rerender(<ModelCapabilityTable slug="acme" />)
    expect(screen.getByText("Last measure of qwen3:8b: 0 of 1 cases passed.")).toBeInTheDocument()
    expect(screen.getByText("Failed: Move an issue")).toBeInTheDocument()
    expect(screen.getByText("The AI is busy")).toBeInTheDocument()
  })

  it("waits for the table, and says when the instance serves no model", () => {
    useModelCapabilityStore.setState({ table: null })
    const { rerender } = render(<ModelCapabilityTable slug="acme" />)
    expect(screen.getByText("Reading…")).toBeInTheDocument()
    expect(measureCortexModel).not.toHaveBeenCalled()

    useModelCapabilityStore.setState({ table: { ...TABLE, models: [] } })
    rerender(<ModelCapabilityTable slug="acme" />)
    expect(screen.getByText("The AI of this instance serves no model right now.")).toBeInTheDocument()
  })
})
