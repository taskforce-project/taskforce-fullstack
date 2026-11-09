import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { toast } from "sonner"

import { useEvalStore } from "@/lib/store/eval-store"
import { useUserStore } from "@/lib/store/user-store"
import { useWindowStore } from "@/lib/store/window-store"
import { AnswerActions } from "./answer-actions"

const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("./eval-case-dialog", () => ({
  EvalCaseDialog: ({ expected, onSaved }: { expected?: string; onSaved?: () => void }) => (
    <button type="button" onClick={onSaved}>advanced form: {expected}</button>
  ),
}))

const keepGood = vi.fn()
const keepBad = vi.fn()
const CASE = { id: 1, title: "t", question: "q", tool: "", createdAt: "", criteriaAt: "", mine: true }

const show = (record: string | null = "r-1") => render(<AnswerActions slug="acme" text="The answer." record={record} />)
const good = () => screen.getByRole("button", { name: "Good: keep this answer as a test case" })
const bad = () => screen.getByRole("button", { name: "Bad: say what it should have done" })

/** Sous une réponse, au survol (R137) : copier, bien, pas bien. */
describe("AnswerActions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEvalStore.setState({ bank: null, error: null, keepGood, keepBad })
  })

  it("copie la réponse", () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    show()

    fireEvent.click(screen.getByRole("button", { name: "Copy" }))

    expect(writeText).toHaveBeenCalledWith("The answer.")
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument()
  })

  it.each([
    ["sans dossier : rien à garder", null, true],
    ["la banque coupée", "r-1", false],
  ])("%s : copier seul (R15)", (_, record, enabled) => {
    useEvalStore.setState({ bank: { enabled, canManage: false, cases: [], runs: [] } })
    show(record)

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Good/ })).not.toBeInTheDocument()
  })

  it("bien : un clic, et c'est gardé", async () => {
    keepGood.mockResolvedValue(CASE)
    show()

    fireEvent.click(good())

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Kept in your test bank" })[0]).toHaveAttribute("aria-pressed", "true"))
    expect(keepGood).toHaveBeenCalledWith("acme", "r-1")
  })

  it("le toast ouvre l'histoire de la banque, là où le cas se lit", async () => {
    keepGood.mockResolvedValue(CASE)
    useUserStore.setState({ user: { id: 7 } as never })
    show()

    fireEvent.click(good())
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const options = vi.mocked(toast.success).mock.calls[0][1] as { action: { onClick: () => void } }
    options.action.onClick()

    expect(useWindowStore.getState().progressTabs["7"]).toBe("history")
    expect(push).toHaveBeenCalledWith("/acme/progress", { scroll: false })
  })

  it("bien qui échoue le dit", async () => {
    keepGood.mockImplementation(async () => {
      useEvalStore.setState({ error: "The test bank holds 200 cases: archive one before adding another." })
      return null
    })
    show()

    fireEvent.click(good())

    expect(await screen.findByRole("alert")).toHaveTextContent("The test bank holds 200 cases")
  })

  it("pas bien demande une phrase, et garde le cas", async () => {
    keepBad.mockResolvedValue({ ...CASE, waiting: true })
    show()

    fireEvent.click(bad())
    const field = screen.getByLabelText("What should Cortex have done?")
    expect(screen.getByRole("button", { name: "Keep" })).toBeDisabled()
    fireEvent.change(field, { target: { value: "  It should have asked which project. " } })
    fireEvent.click(screen.getByRole("button", { name: "Keep" }))

    await waitFor(() => expect(keepBad).toHaveBeenCalledWith("acme", "r-1", "It should have asked which project."))
    await waitFor(() => expect(screen.queryByLabelText("What should Cortex have done?")).not.toBeInTheDocument())
  })

  it("pas bien qui échoue le dit, et garde la phrase", async () => {
    keepBad.mockImplementation(async () => {
      useEvalStore.setState({ error: "Refused." })
      return null
    })
    show()

    fireEvent.click(bad())
    fireEvent.change(screen.getByLabelText("What should Cortex have done?"), { target: { value: "Ask." } })
    fireEvent.click(screen.getByRole("button", { name: "Keep" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Refused.")
    expect(screen.getByLabelText("What should Cortex have done?")).toHaveValue("Ask.")
  })

  it("le formulaire reste sous Advanced, avec la phrase déjà écrite", () => {
    show()

    fireEvent.click(bad())
    fireEvent.change(screen.getByLabelText("What should Cortex have done?"), { target: { value: "Ask first." } })
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))

    expect(screen.getByRole("button", { name: "advanced form: Ask first." })).toBeInTheDocument()
  })

  it("Advanced gardé marque la réponse", () => {
    show()

    fireEvent.click(bad())
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    fireEvent.click(screen.getByRole("button", { name: /advanced form/ }))

    expect(screen.getAllByRole("button", { name: "Kept in your test bank" })[0]).toBeDisabled()
  })

  it("Échap et Cancel referment la question", () => {
    show()

    fireEvent.click(bad())
    fireEvent.keyDown(screen.getByLabelText("What should Cortex have done?"), { key: "Escape" })
    expect(screen.queryByLabelText("What should Cortex have done?")).not.toBeInTheDocument()

    fireEvent.click(bad())
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByLabelText("What should Cortex have done?")).not.toBeInTheDocument()
  })
})
