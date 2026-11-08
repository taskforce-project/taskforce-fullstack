import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
// La liste de Radix ne s'ouvre pas sous happy-dom : une liste native dit la même chose, la valeur et son changement.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) => (
    <select aria-label="Cortex's model" value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}))

import { CortexModelChoice, ModelProposal } from "./cortex-model-choice"
import type { ModelCapabilityTable } from "@/lib/api/model-capability-service"
import type { Workspace } from "@/lib/api/workspace-service"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

const row = (model: string, current = false) => ({ model, current, measuredAt: null, scores: [] })

const TABLE: ModelCapabilityTable = {
  provider: "OLLAMA", instanceModel: "qwen3:8b", choice: null, current: "qwen3:8b", suiteVersion: 1,
  capabilities: [], cases: [], models: [row("qwen3:8b", true), row("qwen3:14b")], proposals: [], proposed: "qwen3:8b",
}

/** Settings > AI garde le choix du modèle de Cortex (R113) et mène à « Progress » (R125). */
describe("CortexModelChoice", () => {
  const fetchTable = vi.fn()
  const choose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useModelCapabilityStore.setState({ table: TABLE, error: null, fetchTable, choose })
    useAiStatusStore.setState({ status: null, fetchStatus: vi.fn() })
    useWorkspaceStore.setState({ activeWorkspace: { name: "Acme", slug: "acme" } as Workspace })
  })

  it("keeps the instance's model by default, and lets the person choose another", () => {
    render(<CortexModelChoice slug="acme" />)

    expect(fetchTable).toHaveBeenCalledWith("acme")
    const list = screen.getByRole("combobox", { name: "Cortex's model" })
    expect(list).toHaveValue("__instance")
    expect(screen.getByRole("option", { name: "qwen3:8b (this instance's model)" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "qwen3:8b" })).not.toBeInTheDocument()
    expect(screen.getByText("This instance's model for Cortex: qwen3:8b.")).toBeInTheDocument()

    fireEvent.change(list, { target: { value: "qwen3:14b" } })
    expect(choose).toHaveBeenCalledWith("acme", "qwen3:14b")
  })

  it("shows the person's choice, and goes back to the instance's model", () => {
    useModelCapabilityStore.setState({ table: { ...TABLE, choice: "qwen3:14b", current: "qwen3:14b" } })
    render(<CortexModelChoice slug="acme" />)

    const list = screen.getByRole("combobox", { name: "Cortex's model" })
    expect(list).toHaveValue("qwen3:14b")
    expect(screen.getByText("You chose qwen3:14b for Cortex.")).toBeInTheDocument()
    fireEvent.change(list, { target: { value: "__instance" } })
    expect(choose).toHaveBeenCalledWith("acme", null)
  })

  it("says the context window when the AI status knows it, and what TaskForce proposes, then links to Progress", () => {
    useAiStatusStore.setState({
      status: {
        configured: true, chatAvailable: true, chatModel: "qwen3:8b", fastModel: "qwen3:8b", embeddingsAvailable: true,
        embeddingModel: "bge-m3", contextWindow: 16384, fastContextWindow: 16384,
      },
    })
    render(<CortexModelChoice slug="acme" />)

    expect(screen.getByText("This instance's model for Cortex: qwen3:8b, with a context window of up to 16,384 tokens."))
      .toBeInTheDocument()
    expect(screen.getByText("For everything measured: qwen3:8b.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "See what each model can do in Progress" })).toHaveAttribute("href", "/acme/progress")
  })

  it("waits for the table, says when no model is served, and says an error", () => {
    useModelCapabilityStore.setState({ table: null })
    const { rerender } = render(<CortexModelChoice slug="acme" />)
    expect(screen.getByText("Reading…")).toBeInTheDocument()

    useModelCapabilityStore.setState({ table: { ...TABLE, models: [] }, error: "Couldn't choose" })
    rerender(<CortexModelChoice slug="acme" />)
    expect(screen.getByText("The AI of this instance serves no model right now.")).toBeInTheDocument()
    expect(screen.getByText("Couldn't choose")).toBeInTheDocument()
  })
})

describe("ModelProposal", () => {
  it("says nothing it doesn't know, and still links to Progress", () => {
    useModelCapabilityStore.setState({ table: null })
    useWorkspaceStore.setState({ activeWorkspace: { name: "Acme", slug: "acme" } as Workspace })
    render(<ModelProposal />)

    expect(screen.queryByText("TaskForce proposes")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "See what each model can do in Progress" })).toBeInTheDocument()
  })
})
