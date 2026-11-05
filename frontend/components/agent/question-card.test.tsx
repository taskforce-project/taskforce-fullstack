import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { QuestionCard } from "./question-card"
import type { AssistantQuestion, AssistantToolCall } from "@/lib/api/assistant-service"
import { useCortexStore } from "@/lib/store/cortex-store"

const NAME: AssistantQuestion = {
  field: "name", header: "Name", text: "What should the project be called?", multiple: false,
  choices: [{ value: "Next.js app", label: "Next.js app", description: "Suggested from your request", recommended: false }],
}
const REPOSITORY: AssistantQuestion = {
  field: "repository", header: "Repository", text: "Where does its code live?", multiple: false,
  choices: [
    { value: "new-private", label: "A new private repository", description: "Only the people you add see the code", recommended: true },
    { value: "new-public", label: "A new public repository", description: "Anyone on the internet sees the code", recommended: false },
    { value: "none", label: "No repository for now", description: "Link one later from the project's page", recommended: false },
  ],
}
const LABELS: AssistantQuestion = {
  field: "addLabels", header: "Labels", text: "Which labels should TF-12 get?", multiple: true,
  choices: [
    { value: "bug", label: "bug", description: "Something is broken", recommended: true },
    { value: "ui", label: "ui", description: null, recommended: false },
  ],
}

function card(questions: AssistantQuestion[]): AssistantToolCall & { questions: AssistantQuestion[] } {
  return { name: "create_project", status: "question", input: "{}", output: "", record: "r", ref: "q", questions }
}
const DONE: AssistantToolCall = { name: "create_project", status: "success", input: "{}", output: "Project created.", record: "r" }

function show(questions: AssistantQuestion[]) {
  const call = card(questions)
  render(<QuestionCard slug="acme" call={call} then={(next) => <p>next: {next.status}</p>} />)
  return call
}

/** « Crée un projet Next.js » (R115) : TaskForce demande le nom et où vit son code, sur une carte, comme Claude. */
describe("QuestionCard: TaskForce's questions, like Claude's", () => {
  const answerQuestion = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useCortexStore.setState({ answerQuestion, questionProblem: null })
  })

  it("shows each question with its header, its choices and what they mean, the recommended one first, marked and checked", () => {
    show([NAME, REPOSITORY])

    const repository = screen.getByRole("radiogroup", { name: "Repository Where does its code live?" })
    const radios = within(repository).getAllByRole("radio")
    expect(radios[0]).toHaveAccessibleName("A new private repository Recommended")
    expect(radios[0]).toHaveAccessibleDescription("Only the people you add see the code")
    expect(radios[0]).toBeChecked()
    expect(radios[1]).toHaveAccessibleName("A new public repository")
    expect(radios[1]).not.toBeChecked()
    expect(within(repository).getByRole("radio", { name: "Other" })).not.toBeChecked()
    // Un nom n'a pas de défaut : rien n'est coché, et rien ne part avant qu'il soit dit.
    const name = screen.getByRole("radiogroup", { name: "Name What should the project be called?" })
    expect(within(name).getAllByRole("radio").filter((radio) => radio.getAttribute("aria-checked") === "true")).toHaveLength(0)
    expect(screen.getByText("Suggested from your request")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled()
    expect(answerQuestion).not.toHaveBeenCalled()
  })

  it("sends the two answers at once with one Send, then shows how the gesture goes on", async () => {
    const user = userEvent.setup()
    answerQuestion.mockResolvedValue(DONE)
    const call = show([NAME, REPOSITORY])

    await user.type(screen.getByRole("textbox", { name: "Your own answer: What should the project be called?" }), "Atlas")
    await user.click(screen.getByRole("button", { name: /Send/ }))

    await waitFor(() => expect(screen.getByText("next: success")).toBeInTheDocument())
    expect(answerQuestion).toHaveBeenCalledTimes(1)
    expect(answerQuestion).toHaveBeenCalledWith("acme", call, [
      { field: "name", values: [], other: "Atlas" },
      { field: "repository", values: ["new-private"] },
    ])
    expect(screen.getByText("Your answers: Name: Atlas · Repository: A new private repository")).toBeInTheDocument()
  })

  it("lets several choices be checked when the answers are not exclusive, with Other beside them", async () => {
    const user = userEvent.setup()
    answerQuestion.mockResolvedValue(DONE)
    const call = show([LABELS])

    const group = screen.getByRole("group", { name: "Labels Which labels should TF-12 get?" })
    expect(group).toHaveAccessibleDescription("Choose one or more.")
    expect(within(group).getByRole("checkbox", { name: "bug Recommended" })).toBeChecked()
    await user.click(within(group).getByRole("checkbox", { name: "ui" }))
    await user.type(within(group).getByRole("textbox"), "docs")
    expect(within(group).getByRole("checkbox", { name: "Other" })).toBeChecked()
    await user.click(screen.getByRole("button", { name: /Send/ }))

    await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith("acme", call, [
      { field: "addLabels", values: ["bug", "ui"], other: "docs" },
    ]))
    expect(screen.getByText("Your answer: bug, ui, docs")).toBeInTheDocument()
  })

  it("takes a typed answer with Other instead of the recommended choice", async () => {
    const user = userEvent.setup()
    answerQuestion.mockResolvedValue(DONE)
    const call = show([REPOSITORY])

    await user.click(screen.getByRole("radio", { name: "Other" }))
    expect(screen.getByRole("radio", { name: "A new private repository Recommended" })).not.toBeChecked()
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled() // Other sans mots n'est pas une réponse
    await user.type(screen.getByRole("textbox"), "acme/web")
    await user.click(screen.getByRole("button", { name: /Send/ }))

    await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith("acme", call, [
      { field: "repository", values: [], other: "acme/web" },
    ]))
  })

  it("works with the keyboard: the arrows move the choice, Enter in the answer field sends the card", async () => {
    const user = userEvent.setup()
    answerQuestion.mockResolvedValue(DONE)
    const call = show([REPOSITORY])

    await user.tab()
    expect(screen.getByRole("radio", { name: "A new private repository Recommended" })).toHaveFocus()
    // La flèche tenue, comme sous un doigt : le groupe déplace le focus, puis coche le choix qui le reçoit.
    for (const next of ["A new public repository", "No repository for now"]) {
      await user.keyboard("{ArrowDown>}")
      await waitFor(() => expect(screen.getByRole("radio", { name: next })).toBeChecked())
      await user.keyboard("{/ArrowDown}")
    }
    expect(screen.getByRole("radio", { name: "A new private repository Recommended" })).not.toBeChecked()
    await user.tab()
    expect(screen.getByRole("textbox")).toHaveFocus()
    await user.keyboard("{Enter}")

    await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith("acme", call, [
      { field: "repository", values: ["none"] },
    ]))
  })

  it("says why the answers didn't go through, and keeps the card to try again", async () => {
    const user = userEvent.setup()
    answerQuestion.mockImplementation(async () => {
      useCortexStore.setState({ questionProblem: "This question is already answered." })
      return null
    })
    show([REPOSITORY])

    await user.click(screen.getByRole("button", { name: /Send/ }))

    await waitFor(() => expect(screen.getByRole("alert"))
      .toHaveTextContent("Your answers didn't go through: This question is already answered."))
    expect(screen.getByRole("button", { name: /Send/ })).toBeEnabled()
    expect(screen.getByRole("radio", { name: "A new private repository Recommended" })).toBeChecked()
  })

  it("asks a question without choices with its field alone, named by the question", async () => {
    const user = userEvent.setup()
    answerQuestion.mockResolvedValue(DONE)
    const comment: AssistantQuestion = {
      field: "content", header: "Comment", text: "What should the comment say?", multiple: false, choices: [],
    }
    const call = show([comment])

    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
    await user.type(screen.getByRole("textbox", { name: "Comment What should the comment say?" }), "Done in #12{Enter}")

    await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith("acme", call, [
      { field: "content", values: [], other: "Done in #12" },
    ]))
  })
})
