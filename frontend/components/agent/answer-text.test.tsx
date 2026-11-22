import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { AnswerText } from "./answer-text"
import { CONSTANTS_EN } from "@/lib/constants_en"

const t = CONSTANTS_EN.cortex

describe("AnswerText : ce que TaskForce dit se voit comme sa parole (R116)", () => {
  it("shows the correction under TaskForce's name, apart from Cortex's words", () => {
    render(<AnswerText text={"Here are the issues.\n\n> [!taskforce] TaskForce\n> Nothing was deleted in this turn.\n\nAnything else?"} />)

    const note = screen.getByRole("note", { name: t.taskforceSaysLabel })
    expect(note).toHaveAttribute("data-by", "taskforce")
    expect(note).toHaveAttribute("title", t.taskforceSaysHint)
    expect(note).toHaveTextContent(t.taskforceSays)
    expect(note).toHaveTextContent(t.taskforceSaysWhat)
    expect(note).toHaveTextContent("Nothing was deleted in this turn.")
    expect(note).not.toHaveTextContent("Here are the issues.")
    expect(screen.getByText("Here are the issues.")).toBeInTheDocument()
    expect(screen.getByText("Anything else?")).toBeInTheDocument()
    expect(screen.queryByText(/\[!taskforce\]/i)).not.toBeInTheDocument()
  })

  /** R115, R136 : les questions d'un geste se lisent sur leur carte ; sans elle (une conversation rouverte), comme les mots de Cortex. */
  const ASKS = "> [!taskforce] TaskForce · asks\n> What should the project be called?\n> Where does its code live?\n"

  it("reads the questions as Cortex's words when their card is not there: one voice", () => {
    render(<AnswerText text={ASKS} />)

    expect(screen.queryByRole("note")).not.toBeInTheDocument()
    expect(screen.queryByText(t.taskforceSays)).not.toBeInTheDocument()
    expect(screen.getByText("What should the project be called?")).toBeInTheDocument()
    expect(screen.getByText("Where does its code live?")).toBeInTheDocument()
  })

  it("leaves the questions to their card, and keeps the rest of the answer", () => {
    render(<AnswerText text={ASKS + "\n> [!taskforce] TaskForce · models\n> Answered by qwen3:8b, as you asked."} withCard />)

    expect(screen.queryByText("What should the project be called?")).not.toBeInTheDocument()
    expect(screen.getByText("Answered by qwen3:8b, as you asked.")).toBeInTheDocument()
  })

  it("says what was done when Cortex said it wasn't, under TaskForce's name (R204)", () => {
    render(<AnswerText text={"> [!taskforce] TaskForce · done\n> This was created in this conversation, in TaskForce: Project created: TESTTASKFO.\n\nQuel nom ?"} />)

    const note = screen.getByRole("note", { name: t.taskforceSaysLabel })
    expect(note).toHaveAttribute("title", t.taskforceSaysDoneHint)
    expect(note).toHaveTextContent(t.taskforceSaysDoneWhat)
    expect(note).toHaveTextContent("This was created in this conversation, in TaskForce: Project created: TESTTASKFO.")
    expect(screen.getByText("Quel nom ?")).toBeInTheDocument()
  })

  it("says what TaskForce found of the tool the request named, apart from a correction (R204)", () => {
    render(<AnswerText text={"> [!taskforce] TaskForce · connections\n> Linear is connected for reading only, so Cortex can read it but not change it."} />)

    const note = screen.getByRole("note", { name: t.taskforceSaysConnectionsLabel })
    expect(note).toHaveAttribute("title", t.taskforceSaysConnectionsHint)
    expect(note).toHaveTextContent(t.taskforceSaysConnectionsWhat)
    expect(note).toHaveTextContent("Linear is connected for reading only")
  })

  it("shows what the conversation did next to Cortex's sentence, which stays, as no correction (R159)", () => {
    render(<AnswerText text={"J'ai bien créé le projet pour la démo.\n\n> [!taskforce] TaskForce · record\n> This was created in this conversation, in TaskForce: Project created: TESTTASKFO."} />)

    const note = screen.getByRole("note", { name: t.taskforceSaysRecordLabel })
    expect(note).toHaveAttribute("title", t.taskforceSaysRecordHint)
    expect(note).toHaveTextContent(t.taskforceSaysRecordWhat)
    expect(note).not.toHaveTextContent(t.taskforceSaysWhat)
    expect(note).toHaveTextContent("This was created in this conversation, in TaskForce: Project created: TESTTASKFO.")
    expect(screen.getByText("J'ai bien créé le projet pour la démo.")).toBeInTheDocument()
  })

  it("renders an answer without a correction as Cortex's markdown only", () => {
    render(<AnswerText text={"TESTTA-2 is in **In review by AI**."} />)

    expect(screen.queryByRole("note")).not.toBeInTheDocument()
    expect(screen.getByText("In review by AI").tagName).toBe("STRONG")
  })
})
