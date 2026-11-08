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
    { key: "french", label: "French", description: "Answers in French", cases: 2 },
  ],
  cases: [{ key: "tools-move", capability: "tools", title: "Move an issue" }, { key: "french-read", capability: "french", title: "Read French" }],
  models: [
    {
      model: "qwen3:14b", current: false, measuredAt: null, scores: [score("tools", 0, 0), score("french", 0, 0)],
      card: { parameters: "14.8B", contextWindow: 40960, tools: true },
    },
    {
      model: "qwen3:8b", current: true, measuredAt: "2026-11-07T10:04:00", scores: [score("tools", 2, 2), score("french", 1, 2)],
      failedCases: ["french-read"],
    },
    { model: "llama3.2", current: false, measuredAt: "2026-11-06T10:04:00", scores: [score("tools", 0, 2), score("french", 0, 0)], card: null },
  ],
  proposals: [{ capability: "tools", model: "qwen3:8b" }],
  proposed: null,
}

/** La ligne d'un modèle : son `li`, trouvé par son nom. */
const line = (model: string) => screen.getByText(model).closest("li") as HTMLElement
const openLine = (model: string) => fireEvent.click(within(line(model)).getAllByRole("button")[0])

/** Ce que sait faire chaque modèle, mesuré ici (R113), une ligne par modèle (R130). */
describe("ModelCapabilityTable", () => {
  const fetchTable = vi.fn()
  const measure = vi.fn()
  const measureCortexModel = vi.fn()
  const stop = vi.fn()
  const choose = vi.fn().mockResolvedValue(true)
  const openSettings = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useModelCapabilityStore.setState({
      table: TABLE, progress: null, results: [], error: null, fetchTable, measure, measureCortexModel, stop, choose,
    })
    useEvalStore.setState({ progress: null })
    useSettingsStore.setState({ openSettings })
  })

  it("reads the table, and measures Cortex's model once without a click", () => {
    render(<ModelCapabilityTable slug="acme" />)

    expect(fetchTable).toHaveBeenCalledWith("acme")
    expect(measureCortexModel).toHaveBeenCalledWith("acme")
  })

  it("puts the model in use first, the others in the order of the table: never a ranking", () => {
    render(<ModelCapabilityTable slug="acme" />)

    expect(screen.getAllByRole("listitem").map((item) => item.querySelector(".font-mono")?.textContent))
      .toEqual(["qwen3:8b", "qwen3:14b", "llama3.2"])
  })

  it("a line says its name, the dot of the model in use, one sign per capability with its name and score, and no sentence", () => {
    render(<ModelCapabilityTable slug="acme" />)

    const inUse = line("qwen3:8b")
    expect(within(inUse).getByRole("img", { name: "Cortex uses it" })).toBeInTheDocument()
    expect(within(inUse).getByRole("img", { name: "Tools: 2/2" })).toBeInTheDocument()
    expect(within(inUse).getByRole("img", { name: "French: 1/2" })).toBeInTheDocument()

    const other = line("llama3.2")
    expect(within(other).queryByRole("img", { name: "Cortex uses it" })).not.toBeInTheDocument()
    expect(within(other).getByRole("img", { name: "Tools: 0/2" })).toBeInTheDocument()
    expect(within(other).getByRole("img", { name: "French: Not measured" })).toBeInTheDocument()

    // Les phrases d'avant ont quitté le premier regard.
    expect(screen.queryByText(/TaskForce proposes/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Measured here by/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Not measured yet/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Its description says/)).not.toBeInTheDocument()
  })

  it("names each capability at the head of its column, in a sign or two letters", () => {
    render(<ModelCapabilityTable slug="acme" />)

    expect(screen.getByRole("img", { name: "Tools: Calls Cortex's tools" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "French: Answers in French" })).toHaveTextContent("Fr")
  })

  it("opens the detail in the line: the failed cases, the scores, the date, what TaskForce proposes, what a measure is", () => {
    render(<ModelCapabilityTable slug="acme" />)

    openLine("qwen3:8b")
    const detail = line("qwen3:8b")
    expect(within(detail).getByText("Failed: Read French")).toBeInTheDocument()
    expect(within(detail).getByText("Tools 2/2 · French 1/2")).toBeInTheDocument()
    expect(within(detail).getByText("Measured 7 Nov")).toBeInTheDocument()
    expect(within(detail).getByText("TaskForce proposes it for Tools.")).toBeInTheDocument()
    expect(within(detail).getByText(/Measured here by TaskForce's test cases/)).toBeInTheDocument()
    // Le modèle en service ne se reprend pas : il le dit.
    expect(within(detail).getByText("Cortex uses it")).toBeInTheDocument()
    expect(within(detail).queryByRole("button", { name: "Use for Cortex" })).not.toBeInTheDocument()

    // Un autre s'ouvre, celui-là se referme.
    openLine("qwen3:14b")
    expect(screen.queryByText("Failed: Read French")).not.toBeInTheDocument()
    const described = line("qwen3:14b")
    expect(within(described).getByText("Not measured yet.")).toBeInTheDocument()
    expect(within(described).getByText(
      "Its description says: 14.8B parameters · a context window of 40,960 tokens · takes tools.",
    )).toBeInTheDocument()

    openLine("qwen3:14b")
    expect(screen.queryByText("Not measured yet.")).not.toBeInTheDocument()
  })

  it("Use for Cortex chooses the model; the instance's model clears the choice", () => {
    useModelCapabilityStore.setState({
      table: {
        ...TABLE, current: "qwen3:14b", choice: "qwen3:14b",
        models: TABLE.models.map((row) => ({ ...row, current: row.model === "qwen3:14b" })),
      },
    })
    render(<ModelCapabilityTable slug="acme" />)

    openLine("llama3.2")
    fireEvent.click(screen.getByRole("button", { name: "Use for Cortex" }))
    expect(choose).toHaveBeenCalledWith("acme", "llama3.2")

    openLine("qwen3:8b")
    fireEvent.click(screen.getByRole("button", { name: "Use for Cortex" }))
    expect(choose).toHaveBeenLastCalledWith("acme", null)
  })

  it("measures a model on demand, an icon named on hover, never while the test bank is replayed", () => {
    const { rerender } = render(<ModelCapabilityTable slug="acme" />)

    fireEvent.click(within(line("qwen3:14b")).getByRole("button", { name: "Measure" }))
    expect(measure).toHaveBeenCalledWith("acme", "qwen3:14b")

    useEvalStore.setState({ progress: { done: 0, total: 3, waitSeconds: null, stopping: false } })
    rerender(<ModelCapabilityTable slug="acme" />)
    expect(within(line("qwen3:8b")).getByRole("button", { name: "Measure again" })).toBeDisabled()
  })

  it("says a measure in its line as it runs, stops it, and the other lines wait", () => {
    useModelCapabilityStore.setState({
      progress: { model: "qwen3:8b", done: 1, total: 8, waitSeconds: null, stopping: false, auto: true },
    })
    const { rerender } = render(<ModelCapabilityTable slug="acme" />)
    expect(screen.getByRole("status")).toHaveTextContent("Measuring qwen3:8b, the model Cortex uses, once: 1 of 8.")
    expect(within(line("qwen3:8b")).getByText("1/8")).toBeInTheDocument()
    fireEvent.click(within(line("qwen3:8b")).getByRole("button", { name: "Stop" }))
    expect(stop).toHaveBeenCalled()
    expect(within(line("qwen3:14b")).getByRole("button", { name: "Measure" })).toBeDisabled()

    useModelCapabilityStore.setState({
      progress: { model: "qwen3:8b", done: 1, total: 8, waitSeconds: 40, stopping: true, auto: false },
      error: "The AI is busy",
    })
    rerender(<ModelCapabilityTable slug="acme" />)
    expect(screen.getByRole("status")).toHaveTextContent("next case in 40 s")
    expect(within(line("qwen3:8b")).getByText("40 s")).toBeInTheDocument()
    expect(within(line("qwen3:8b")).getByRole("button", { name: "Stop" })).toBeDisabled()
    expect(screen.getByText("The AI is busy")).toBeInTheDocument()
  })

  it("moves between lines with the arrows", () => {
    render(<ModelCapabilityTable slug="acme" />)
    const buttons = screen.getAllByRole("listitem").map((item) => within(item).getAllByRole("button")[0])

    buttons[0].focus()
    fireEvent.keyDown(buttons[0], { key: "ArrowDown" })
    expect(document.activeElement).toBe(buttons[1])
    fireEvent.keyDown(buttons[1], { key: "ArrowUp" })
    expect(document.activeElement).toBe(buttons[0])
    fireEvent.keyDown(buttons[0], { key: "ArrowUp" })
    expect(document.activeElement).toBe(buttons[0])
    // Une autre touche laisse la ligne où elle est.
    fireEvent.keyDown(buttons[0], { key: "x" })
    expect(document.activeElement).toBe(buttons[0])
  })

  it("waits for the table; an instance that serves no model: one line and the next action", () => {
    useModelCapabilityStore.setState({ table: null })
    const { rerender } = render(<ModelCapabilityTable slug="acme" />)
    expect(screen.getByText("Reading…")).toBeInTheDocument()
    expect(measureCortexModel).not.toHaveBeenCalled()

    useModelCapabilityStore.setState({ table: { ...TABLE, models: [] } })
    rerender(<ModelCapabilityTable slug="acme" />)
    expect(screen.getByText("The AI of this instance serves no model right now.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Set up AI" }))
    expect(openSettings).toHaveBeenCalledWith("ai")
  })

  it("never needs a horizontal scrollbar: no table, no minimum width", () => {
    const { container } = render(<ModelCapabilityTable slug="acme" />)

    expect(container.querySelector("table")).toBeNull()
    expect(container.innerHTML).not.toMatch(/min-w-\[|overflow-x/)
  })
})
