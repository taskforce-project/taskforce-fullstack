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

  it("renders an answer without a correction as Cortex's markdown only", () => {
    render(<AnswerText text={"TESTTA-2 is in **In review by AI**."} />)

    expect(screen.queryByRole("note")).not.toBeInTheDocument()
    expect(screen.getByText("In review by AI").tagName).toBe("STRONG")
  })
})
