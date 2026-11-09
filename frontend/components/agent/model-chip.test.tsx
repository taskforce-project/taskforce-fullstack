import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

import { ModelChip } from "./model-chip"
import type { AiStatus } from "@/lib/api/ai-status-service"
import type { ModelCapabilityTable } from "@/lib/api/model-capability-service"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"

const table = {
  instanceModel: "qwen3:8b", choice: "qwen3.5:9b", current: "qwen3.5:9b",
  models: [{ model: "qwen3:8b" }, { model: "qwen3.5:9b" }, { model: "qwen3:14b" }],
} as unknown as ModelCapabilityTable

function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: /Model that answers/ }), { button: 0, ctrlKey: false })
}

/** « il m affiche tjr le 8b mm si il a peut etre change comment je le sais » : le modèle qui répond, et le changer d'un clic. */
describe("ModelChip", () => {
  const fetchTable = vi.fn().mockResolvedValue(null)
  const choose = vi.fn().mockResolvedValue(true)

  beforeEach(() => {
    vi.clearAllMocks()
    useAiStatusStore.setState({ status: { configured: true, fastModel: "qwen3:8b", chatModel: "qwen3:14b" } as AiStatus })
    useModelCapabilityStore.setState({ table, error: null, fetchTable, choose })
    useCortexStore.setState({ notice: null })
  })

  it("shows the model that will answer: the person's choice, not the instance's", () => {
    render(<ModelChip slug="acme" />)

    expect(fetchTable).toHaveBeenCalledWith("acme")
    expect(screen.getByRole("button", { name: "Model that answers: qwen3.5:9b" })).toHaveTextContent("qwen3.5:9b")
  })

  it("before the table is read, shows the instance's model", () => {
    useModelCapabilityStore.setState({ table: null })
    render(<ModelChip slug="acme" />)
    expect(screen.getByRole("button", { name: "Model that answers: qwen3:8b" })).toBeInTheDocument()
  })

  it("shows nothing where no model exists", () => {
    useModelCapabilityStore.setState({ table: null })
    useAiStatusStore.setState({ status: null })
    render(<ModelChip slug="acme" />)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("lists the models that can chat, one line each, a check on the current one", () => {
    render(<ModelChip slug="acme" />)
    openMenu()

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "qwen3:8b", "qwen3.5:9b", "qwen3:14b", "What each model can do",
    ])
    expect(screen.getByRole("menuitem", { name: "qwen3.5:9b" }).querySelector("svg")).not.toBeNull()
    expect(screen.getByRole("menuitem", { name: "qwen3:14b" }).querySelector("svg")).toBeNull()
  })

  it("changes at once, with the same state as Progress", async () => {
    let done: (ok: boolean) => void = () => undefined
    choose.mockReturnValueOnce(new Promise((resolve) => { done = resolve }))
    render(<ModelChip slug="acme" />)
    openMenu()

    fireEvent.click(screen.getByRole("menuitem", { name: "qwen3:14b" }))

    expect(choose).toHaveBeenCalledWith("acme", "qwen3:14b")
    expect(screen.getByRole("button", { name: "Model that answers: qwen3:14b" })).toBeInTheDocument()
    await act(async () => { done(true); await Promise.resolve() })
  })

  it("the instance's model takes the person's choice away", async () => {
    render(<ModelChip slug="acme" />)
    openMenu()

    fireEvent.click(screen.getByRole("menuitem", { name: "qwen3:8b" }))
    await act(async () => { await Promise.resolve() })

    expect(choose).toHaveBeenCalledWith("acme", null)
  })

  it("picking the current one does nothing", async () => {
    render(<ModelChip slug="acme" />)
    openMenu()

    fireEvent.click(screen.getByRole("menuitem", { name: "qwen3.5:9b" }))
    await act(async () => { await Promise.resolve() })

    expect(choose).not.toHaveBeenCalled()
  })

  it.each([
    ["the server's reason", "The AI of this instance doesn't serve qwen3:14b.", "The model did not change: The AI of this instance doesn't serve qwen3:14b."],
    ["what to do when it gave none", null, "The model did not change: check your connection, then try again."],
  ])("says it when the change fails, with %s", async (_label, error, line) => {
    choose.mockImplementationOnce(async () => {
      useModelCapabilityStore.setState({ error })
      return false
    })
    render(<ModelChip slug="acme" />)
    openMenu()

    fireEvent.click(screen.getByRole("menuitem", { name: "qwen3:14b" }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    expect(useCortexStore.getState().notice).toBe(line)
    expect(screen.getByRole("button", { name: "Model that answers: qwen3.5:9b" })).toBeInTheDocument()
  })

  it("at the foot of the list, what each model can do opens Progress in the pane", () => {
    render(<ModelChip slug="acme" />)
    openMenu()

    fireEvent.click(screen.getByRole("menuitem", { name: "What each model can do" }))

    expect(push).toHaveBeenCalledWith("/acme/progress", { scroll: false })
  })
})
