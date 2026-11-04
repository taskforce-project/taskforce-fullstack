import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { QuestionCard } from "./question-card"
import type { AssistantQuestion, AssistantToolCall } from "@/lib/api/assistant-service"
import { useCortexStore } from "@/lib/store/cortex-store"

const QUESTION: AssistantQuestion = {
  field: "issue",
  text: "Which issue should be deleted?",
  choices: [
    { value: "TESTTA-2", label: "TESTTA-2 Ajouter la version LTS (In review by AI)", recommended: true },
    { value: "TESTTA-3", label: "TESTTA-3 Corriger le login (Todo)", recommended: false },
  ],
}
const CALL: AssistantToolCall & { question: AssistantQuestion } = {
  name: "delete_issue", status: "question", input: "{}", output: "", record: "r", ref: "q", question: QUESTION,
}
const NEXT: AssistantToolCall = { name: "delete_issue", status: "pending", input: "{\"issue\":\"TESTTA-2\"}", output: "", record: "r" }

function show(showText = false) {
  render(<QuestionCard slug="acme" call={CALL} showText={showText} then={(next) => <p>next: {next.status}</p>} />)
}

/** « Supprime ça » (R115) : TaskForce demande laquelle, en choix, le défaut d'abord, et la réponse tapée reste possible. */
describe("QuestionCard : la question de TaskForce avant un geste", () => {
  const answerQuestion = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useCortexStore.setState({ answerQuestion, questionProblem: null })
  })

  it("shows the choices, the default first and marked, and asks nothing before a click", () => {
    show()

    const buttons = screen.getAllByRole("button")
    expect(buttons[0]).toHaveTextContent("TESTTA-2 Ajouter la version LTS (In review by AI)")
    expect(buttons[0]).toHaveTextContent("Default")
    expect(buttons[1]).not.toHaveTextContent("Default")
    // La question est déjà dans la réponse, signée par TaskForce : la carte ne la répète pas.
    expect(screen.queryByText("Which issue should be deleted?")).not.toBeInTheDocument()
    expect(answerQuestion).not.toHaveBeenCalled()
  })

  it("sends the clicked choice's value, then shows how the gesture goes on", async () => {
    answerQuestion.mockResolvedValue(NEXT)
    show()

    fireEvent.click(screen.getByRole("button", { name: /TESTTA-3/ }))

    await waitFor(() => expect(screen.getByText("next: pending")).toBeInTheDocument())
    expect(answerQuestion).toHaveBeenCalledWith("acme", CALL, "TESTTA-3")
    expect(screen.getByText("Your answer: TESTTA-3 Corriger le login (Todo)")).toBeInTheDocument()
  })

  it("sends a typed answer", async () => {
    answerQuestion.mockResolvedValue(NEXT)
    show()

    fireEvent.change(screen.getByLabelText("Or type your answer"), { target: { value: "the login one" } })
    fireEvent.click(screen.getByRole("button", { name: /Answer/ }))

    await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith("acme", CALL, "the login one"))
  })

  it("says why an answer didn't go through, and keeps the question", async () => {
    answerQuestion.mockImplementation(async () => {
      useCortexStore.setState({ questionProblem: "This question is already answered." })
      return null
    })
    show(true)

    expect(screen.getByText("Which issue should be deleted?")).toBeInTheDocument() // la question qui suit une réponse
    fireEvent.click(screen.getByRole("button", { name: /TESTTA-2/ }))

    await waitFor(() => expect(screen.getByText("Your answer didn't go through: This question is already answered."))
      .toBeInTheDocument())
    expect(screen.getByRole("button", { name: /TESTTA-2/ })).toBeEnabled()
  })
})
