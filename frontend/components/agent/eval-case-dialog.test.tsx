import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import type { EvalDraft } from "@/lib/api/eval-service"
import { useEvalStore } from "@/lib/store/eval-store"
import { EvalCaseDialog } from "./eval-case-dialog"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

const DRAFT: EvalDraft = {
  record: "r-1", title: "Create an issue", question: "Crée une issue Test", askedOn: "2026-11-09", notes: [], calls: [],
  criteria: { tool: "none", args: {}, effect: "", forbid: [], contains: [], notContains: [] },
}

const draftCase = vi.fn()
const addCase = vi.fn()
const giveCriteria = vi.fn()
const CASE = { id: 42, title: "t", question: "q", tool: "", createdAt: "", criteriaAt: "", mine: true }

/** Le formulaire d'un cas, sous « Advanced » (R137) : il crée un cas, ou écrit les critères d'un cas qui les attend. */
describe("EvalCaseDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    draftCase.mockResolvedValue(DRAFT)
    addCase.mockResolvedValue(CASE)
    giveCriteria.mockResolvedValue(CASE)
    useEvalStore.setState({ draftCase, addCase, giveCriteria, error: null })
  })

  const save = async () => {
    await screen.findByLabelText("Title")
    fireEvent.click(screen.getByRole("button", { name: "Add case" }))
  }

  it("crée le cas, avec la phrase déjà écrite sous la réponse", async () => {
    const onSaved = vi.fn()
    const onOpenChange = vi.fn()
    render(<EvalCaseDialog slug="acme" record="r-1" expected="Ask first." open onOpenChange={onOpenChange} onSaved={onSaved} />)

    await save()

    await waitFor(() => expect(addCase).toHaveBeenCalledWith("acme", "r-1", "Create an issue", expect.objectContaining({ tool: "none", expected: "Ask first." })))
    expect(giveCriteria).not.toHaveBeenCalled()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("écrit les critères d'un cas qui les attend", async () => {
    render(<EvalCaseDialog slug="acme" record="r-1" caseId={42} open onOpenChange={vi.fn()} />)

    await save()

    await waitFor(() => expect(giveCriteria).toHaveBeenCalledWith("acme", 42, "Create an issue", expect.not.objectContaining({ expected: expect.anything() })))
    expect(addCase).not.toHaveBeenCalled()
  })

  it("reste ouvert et ne dit rien de fait quand l'écriture échoue", async () => {
    giveCriteria.mockResolvedValue(null)
    const onOpenChange = vi.fn()
    render(<EvalCaseDialog slug="acme" record="r-1" caseId={42} open onOpenChange={onOpenChange} />)

    await save()

    await waitFor(() => expect(giveCriteria).toHaveBeenCalled())
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("une colonne, 560 px : les champs l'un sous l'autre", async () => {
    render(<EvalCaseDialog slug="acme" record="r-1" open onOpenChange={vi.fn()} />)
    await screen.findByLabelText("Title")

    expect(screen.getByRole("dialog").className).toContain("sm:max-w-[560px]")
    expect(screen.getByRole("dialog").querySelector(".sm\\:grid-cols-2")).toBeNull()
  })
})
